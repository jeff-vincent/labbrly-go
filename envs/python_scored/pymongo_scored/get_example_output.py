import os
import sys
import json
from datetime import datetime
from bson import ObjectId
from pymongo.mongo_client import MongoClient
from pymongo.errors import PyMongoError

def get_env(name, required=True, default=None):
    val = os.getenv(name, default)
    if required and not val:
        print(f"Missing required environment variable: {name}", file=sys.stderr)
        sys.exit(1)
    return val

def build_uri(user, password):
    hosts = (
        "ac-zeyocbe-shard-00-00.syixker.mongodb.net:27017,"
        "ac-zeyocbe-shard-00-01.syixker.mongodb.net:27017,"
        "ac-zeyocbe-shard-00-02.syixker.mongodb.net:27017"
    )
    params = "ssl=true&replicaSet=atlas-n36qup-shard-0&authSource=admin&retryWrites=true&w=majority"
    return f"mongodb://{user}:{password}@{hosts}/?{params}"

# Fetch configuration from environment
DB_USER = get_env("MONGO_USER")
DB_PASS = get_env("MONGO_PASSWORD")
DB_NAME = get_env("MONGO_DB", default="sample_db")
COLLECTION_NAME = get_env("MONGO_COLLECTION", default="sample_collection")

URI = build_uri(DB_USER, DB_PASS)

def to_jsonable(doc):
    def convert(v):
        if isinstance(v, ObjectId):
            return str(v)
        if isinstance(v, datetime):
            return v.isoformat()
        return v
    return {k: convert(v) for k, v in doc.items()}

def main():
    try:
        with MongoClient(URI, serverSelectionTimeoutMS=5000) as client:
            # Validate connection
            client.admin.command("ping")
            db = client[DB_NAME]
            collection = db[COLLECTION_NAME]

            sample_document = {
                "name": "Sample Document",
                "description": "This is a sample document.",
                "created_at": datetime.utcnow()
            }

            insert_result = collection.insert_one(sample_document)
            retrieved = collection.find_one({"_id": insert_result.inserted_id})

            output_path = "example_output.txt"
            with open(output_path, "w", encoding="utf-8") as f:
                f.write("Retrieved document:\n")
                f.write(json.dumps(to_jsonable(retrieved), indent=2))
            print(f"Inserted document with ID: {insert_result.inserted_id}")
            print(f"Wrote output to {output_path}")
    except PyMongoError as e:
        print(f"MongoDB error: {e}", file=sys.stderr)
        sys.exit(2)
    except Exception as e:
        print(f"Unexpected error: {e}", file=sys.stderr)
        sys.exit(3)

if __name__ == "__main__":
    main()


