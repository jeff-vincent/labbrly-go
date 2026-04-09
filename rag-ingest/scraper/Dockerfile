FROM python:3.11
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt && \
	python -m spacy download en_core_web_sm || true
COPY . .
ENV PYTHONPATH=/app
CMD ["scrapy", "crawl", "rag_spider"]
