import re
import requests
from bs4 import BeautifulSoup

FAQ_URL = "https://samagama.in/internship/faq"

def clean_text(text: str) -> str:
    """Cleans up extra whitespace and characters like the section symbol '§'."""
    text = text.replace("§", "")
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def scrape_faq(url: str = FAQ_URL, html_content: str = None) -> dict:
    """
    Scrapes the Samagama Internship FAQ page.
    Returns a dictionary containing:
      - 'version': version string (e.g., v24.4.0)
      - 'last_updated': last updated date (e.g., 2026-06-09, IST)
      - 'faqs': list of parsed FAQ items, each containing:
         - section_id: string (e.g., s-1)
         - section_title: string (e.g., 1. About the internship)
         - id: string (e.g., q-1-1)
         - question: string
         - answer: string (markdown/text format)
         - answer_html: string (raw inner HTML for rendering)
         - url: string (canonical anchor URL)
    """
    if not html_content:
        try:
            headers = {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
            response = requests.get(url, headers=headers, timeout=15)
            response.raise_for_status()
            html_content = response.text
        except Exception as e:
            print(f"Error fetching FAQ page: {e}")
            raise e

    soup = BeautifulSoup(html_content, "html.parser")
    
    # Extract version and last updated date
    version = "Unknown"
    last_updated = "Unknown"
    meta_tag = soup.find(class_="meta")
    if meta_tag:
        meta_text = meta_tag.get_text()
        # Look for version
        version_match = re.search(r"Version:\s*([^\s]+)", meta_text)
        if version_match:
            version = version_match.group(1).strip()
        # Look for last updated
        updated_match = re.search(r"Last updated:\s*([^,\n\r]+(?:,\s*[A-Z]{3})?)", meta_text)
        if updated_match:
            last_updated = updated_match.group(1).strip()

    faqs = []
    current_section_id = ""
    current_section_title = ""

    # Find the main container or search through body
    main_container = soup.find("main") or soup.find("body")
    if not main_container:
        main_container = soup

    # Traverse elements to maintain section association
    for element in main_container.find_all(["h2", "details"]):
        # Section header
        if element.name == "h2":
            elem_id = element.get("id", "")
            if elem_id.startswith("s-"):
                current_section_id = elem_id
                current_section_title = clean_text(element.get_text())

        # FAQ item
        elif element.name == "details" and "faq-q" in element.get("class", []):
            faq_id = element.get("id", "")
            summary_tag = element.find("summary")
            if not summary_tag:
                continue

            question = clean_text(summary_tag.get_text())
            
            # Answer content is all children inside <details> except the <summary>
            # Let's clone or extract components to get the answer html and text
            answer_parts = []
            answer_html_parts = []
            for child in element.children:
                if child == summary_tag:
                    continue
                if child.name:
                    answer_parts.append(child.get_text())
                    answer_html_parts.append(str(child))
                elif isinstance(child, str) and child.strip():
                    answer_parts.append(child.strip())
                    answer_html_parts.append(child.strip())

            answer = clean_text("\n\n".join(answer_parts))
            answer_html = "".join(answer_html_parts).strip()
            anchor_url = f"{FAQ_URL}#{faq_id}" if faq_id else FAQ_URL

            faqs.append({
                "section_id": current_section_id,
                "section_title": current_section_title,
                "id": faq_id,
                "question": question,
                "answer": answer,
                "answer_html": answer_html,
                "url": anchor_url
            })

    return {
        "version": version,
        "last_updated": last_updated,
        "faqs": faqs
    }

if __name__ == "__main__":
    # Test scrape
    print("Testing scraper...")
    data = scrape_faq()
    print(f"Version: {data['version']}")
    print(f"Last Updated: {data['last_updated']}")
    print(f"Total FAQs found: {len(data['faqs'])}")
    if data['faqs']:
        print("Sample FAQ:")
        print(data['faqs'][0])
