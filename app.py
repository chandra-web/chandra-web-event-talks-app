import os
import time
import urllib.request
import xml.etree.ElementTree as ET
from flask import Flask, jsonify, render_template, request
from bs4 import BeautifulSoup

app = Flask(__name__)

FEED_URL = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"

# In-memory cache
cache = {
    "data": None,
    "last_fetched": 0
}
CACHE_DURATION = 300  # 5 minutes

def parse_release_notes():
    try:
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
        req = urllib.request.Request(FEED_URL, headers=headers)
        with urllib.request.urlopen(req, timeout=10) as response:
            xml_data = response.read()
            
        root = ET.fromstring(xml_data)
        ns = {'atom': 'http://www.w3.org/2005/Atom'}
        
        entries = root.findall('atom:entry', ns)
        updates = []
        
        for index, entry in enumerate(entries):
            day_title = entry.find('atom:title', ns).text
            updated_iso = entry.find('atom:updated', ns).text
            
            link_elem = entry.find('atom:link', ns)
            link = link_elem.attrib.get('href') if link_elem is not None else ""
            
            content_elem = entry.find('atom:content', ns)
            if content_elem is None or not content_elem.text:
                continue
                
            html_content = content_elem.text
            soup = BeautifulSoup(html_content, 'html.parser')
            
            # Find headings. The BigQuery release notes feed structure has h3 tags for section headers
            headings = soup.find_all(['h3', 'h4', 'h2'])
            
            if not headings:
                # Fallback: treat the entire content as a single update
                updates.append({
                    "id": f"update-{index}-0",
                    "date": day_title,
                    "updated_iso": updated_iso,
                    "link": link,
                    "type": "Update",
                    "content_html": html_content,
                    "content_text": soup.get_text().strip()
                })
                continue
                
            for idx, heading in enumerate(headings):
                update_type = heading.get_text().strip()
                
                # Get siblings until the next heading
                sibling_html = []
                sibling_text = []
                curr = heading.next_sibling
                while curr and curr not in headings:
                    if curr.name:
                        sibling_html.append(str(curr))
                        sibling_text.append(curr.get_text())
                    elif isinstance(curr, str) and curr.strip():
                        sibling_html.append(curr)
                        sibling_text.append(curr)
                    curr = curr.next_sibling
                    
                content_html = "".join(sibling_html).strip()
                content_text = " ".join(sibling_text).strip()
                
                updates.append({
                    "id": f"update-{index}-{idx}",
                    "date": day_title,
                    "updated_iso": updated_iso,
                    "link": link,
                    "type": update_type,
                    "content_html": content_html,
                    "content_text": content_text
                })
                
        return updates, None
    except Exception as e:
        return None, str(e)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/release-notes')
def get_release_notes():
    force_refresh = request.args.get('refresh', 'false').lower() == 'true'
    current_time = time.time()
    
    if force_refresh or not cache["data"] or (current_time - cache["last_fetched"] > CACHE_DURATION):
        data, error = parse_release_notes()
        if error:
            # If there's an error and we have cached data, return the cached data with a warning
            if cache["data"]:
                return jsonify({
                    "updates": cache["data"],
                    "warning": f"Failed to refresh. Showing cached data. Error: {error}",
                    "cached_at": cache["last_fetched"]
                })
            return jsonify({"error": f"Failed to fetch release notes: {error}"}), 500
            
        cache["data"] = data
        cache["last_fetched"] = current_time
        
    return jsonify({
        "updates": cache["data"],
        "cached_at": cache["last_fetched"]
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=True)
