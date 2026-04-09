import scrapy
from bs4 import BeautifulSoup
import os

class ScrapedPage(scrapy.Item):
    title = scrapy.Field()
    url = scrapy.Field()
    text = scrapy.Field()
    # Pipeline attaches vectorized document chunks here
    docs = scrapy.Field()

def get_start_urls():
    url_files = os.listdir(os.path.join('/mnt/config'))
    urls = []
    for url_file in url_files:
        if '..' not in url_file:
            filepath = f'/mnt/config/{url_file}'
            with open(filepath, 'r') as file:
                urls.extend(file.readlines())

    return urls

class RagSpider(scrapy.Spider):
    name = "rag_spider"
    start_urls = get_start_urls()

    def parse(self, response):
        url = response.url
        soup = BeautifulSoup(response.text, 'html.parser')

        title = soup.title.string if soup.title else "No title"
        parts = []

        if soup.body:
            for tag in soup.body.find_all(recursive=True):
                if tag.name == "p":
                    paragraph_text = tag.get_text().replace("\n", "").strip()
                    if paragraph_text:
                        parts.append(paragraph_text)
                elif tag.name == "code" and tag.parent and tag.parent.name == "pre":
                    code_text = tag.get_text(strip=True)
                    if code_text:
                        parts.append(f"```{code_text}```")

        text = " \n".join(parts)
        yield ScrapedPage(title=title, url=url, text=text)
