import os
import secrets
import logging
from datetime import datetime
from bson import ObjectId
import spacy
from openai import OpenAI
from pymongo import DeleteMany, InsertOne, MongoClient


MONGO_HOST = os.environ.get('MONGO_HOST')
MONGO_USER = os.environ.get('MONGO_USER')
MONGO_PASSWORD = os.environ.get('MONGO_PASSWORD')


class DbInitPipeline:
    """Initialize MongoDB client/collection on spider start (shared for following stages)."""

    def open_spider(self, spider):
        log = logging.getLogger(__name__)
        log.debug(
            "DbInitPipeline.open_spider: preparing Mongo client (host=%s, user=%s)",
            MONGO_HOST,
            MONGO_USER,
        )
        if not MONGO_HOST or not MONGO_USER or not MONGO_PASSWORD:
            log.warning(
                "Mongo env vars incomplete (MONGO_HOST=%s, MONGO_USER=%s, MONGO_PASSWORD set=%s)",
                MONGO_HOST,
                MONGO_USER,
                bool(MONGO_PASSWORD),
            )
        try:
            rag_db = MongoClient(
                f'mongodb+srv://{MONGO_USER}:{MONGO_PASSWORD}@{MONGO_HOST}'
            ).rag
            spider.rag_collection = rag_db.documents
            log.info(
                "Mongo collection ready: %s.documents (type=%s)",
                getattr(rag_db, 'name', 'rag'),
                type(spider.rag_collection).__name__,
            )
        except Exception:
            log.exception("Failed to initialize Mongo client; DB writes will be skipped")
            spider.rag_collection = None

    def process_item(self, item, spider):
        return item


class VectorizePipeline:
    """Chunk text and generate embeddings in-memory; attach docs to the item."""

    def __init__(self):
        self.log = logging.getLogger(__name__)
        self.log.debug("Loading spaCy model en_core_web_sm for chunking")
        self.chunker = spacy.load("en_core_web_sm")
        self.openai = None
        api_key = os.environ.get("OPENAI_API_KEY", "")
        if api_key:
            try:
                self.openai = OpenAI(api_key=api_key)
                self.log.info("OpenAI client initialized; embeddings enabled")
            except Exception:
                # If client init fails (e.g., transport/proxy incompat), skip embeddings gracefully
                self.openai = None
                self.log.exception("OpenAI client init failed; embeddings disabled")
        else:
            self.log.warning("OPENAI_API_KEY not set; embeddings disabled")

    def process_item(self, item, spider):
        title = item.get("title")
        url = item.get("url")
        text = item.get("text", "")
        self.log.debug(
            "VectorizePipeline: %s (title=%s, text_len=%d)", url, title, len(text)
        )

        chunks = self._chunk(text)
        self.log.debug(
            "Chunked into %d pieces (avg_len=%.1f)",
            len(chunks),
            (sum(len(c) for c in chunks) / len(chunks)) if chunks else 0,
        )
        docs = []
        embed_fail = 0
        embed_ok = 0
        for chunk in chunks:
            doc = {
                "content": chunk,
                "page_title": title,
                "page_url": url,
                "date_scraped": datetime.now(),
                "org_id": os.environ.get("ORG_ID"),
                "lab_id": os.environ.get("LAB_ID"),
            }
            embedding = None
            if self.openai is not None:
                try:
                    resp = self.openai.embeddings.create(
                        input=chunk, model="text-embedding-3-small"
                    )
                    embedding = resp.data[0].embedding
                    embed_ok += 1
                except Exception:
                    embed_fail += 1
                    self.log.exception(
                        "Embedding failed for chunk (len=%d) from %s", len(chunk), url
                    )
            else:
                self.log.debug("Embeddings disabled; skipping for chunk len=%d", len(chunk))
            doc["embedding"] = embedding
            docs.append(doc)

        item["docs"] = docs
        self.log.info(
            "Prepared %d docs for %s (embeddings ok=%d, fail=%d)",
            len(docs),
            url,
            embed_ok,
            embed_fail,
        )
        return item

    def _chunk(self, text: str):
        overlap = 100  # characters
        max_chars = 2000
        doc = self.chunker(text)
        chunks = []
        current = ""

        for sent in doc.sents:
            sent_text = sent.text.strip()
            if len(current) + len(sent_text) + 1 <= max_chars:
                current = (current + " " + sent_text).strip()
            else:
                chunks.append(current)
                # start next chunk with some overlap
                current = current[-overlap:].split(" ", 1)[-1] + " " + sent_text

        if current:
            chunks.append(current)

        return chunks


class StorePipeline:
    """Persist the vectorized docs into MongoDB using the collection from spider."""

    def process_item(self, item, spider):
        log = logging.getLogger(__name__)
        url = item.get("url")
        docs = item.get("docs", [])
        # Stats: always count entry calls
        try:
            spider.crawler.stats.inc_value("storepipeline/process_item_called")
        except Exception:
            pass
        log.info(
            "StorePipeline: received item (url=%s) docs_key_present=%s docs_len=%d",
            url,
            "docs" in item,
            len(docs),
        )
        if not hasattr(spider, "rag_collection") or spider.rag_collection is None:
            # If DB wasn't initialized, skip storing
            log.warning(
                "StorePipeline: no rag_collection on spider; skipping DB write for %s (docs=%d)",
                url,
                len(docs),
            )
            try:
                spider.crawler.stats.inc_value("storepipeline/skipped_no_collection")
            except Exception:
                pass
            return item

        if not docs:
            log.debug("StorePipeline: no docs to write for %s", url)
            try:
                spider.crawler.stats.inc_value("storepipeline/skipped_no_docs")
            except Exception:
                pass
            return item

        log.debug(
            "StorePipeline: rag_collection type=%s has_bulk_write=%s",
            type(spider.rag_collection).__name__,
            hasattr(spider.rag_collection, "bulk_write"),
        )
        # ops = [DeleteMany({"page_url": url})]
        ops = []
        for d in docs:
            d["_id"] = ObjectId(secrets.token_hex(12))
            ops.append(InsertOne(d))
        if ops:
            log.debug(
                "StorePipeline: executing bulk_write for %s (ops=%d, collection_type=%s)",
                url,
                len(ops),
                type(spider.rag_collection).__name__,
            )
            try:
                try:
                    spider.crawler.stats.inc_value("storepipeline/bulk_write_attempted")
                    spider.crawler.stats.set_value("storepipeline/ops_count", len(ops))
                except Exception:
                    pass
                result = spider.rag_collection.bulk_write(ops)
                # Sync client: log summary fields
                deleted = getattr(result, 'deleted_count', None)
                inserted = getattr(result, 'inserted_count', None)
                log.info(
                    "bulk_write completed for %s (deleted=%s, inserted=%s)",
                    url,
                    deleted,
                    inserted,
                )
                try:
                    spider.crawler.stats.inc_value("storepipeline/bulk_write_success")
                    if inserted is not None:
                        spider.crawler.stats.set_value("storepipeline/inserted_count", inserted)
                    if deleted is not None:
                        spider.crawler.stats.set_value("storepipeline/deleted_count", deleted)
                except Exception:
                    pass
            except Exception:
                log.exception("StorePipeline: Mongo bulk_write failed for %s (ops=%d)", url, len(ops))
                try:
                    spider.crawler.stats.inc_value("storepipeline/bulk_write_failed")
                except Exception:
                    pass
        return item
