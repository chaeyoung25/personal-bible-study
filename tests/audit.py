import json
from pathlib import Path
import re

docs = Path(__file__).resolve().parents[1] / "docs"
for path in docs.rglob("*"):
    if not path.is_file():
        continue
    assert path.suffix.lower() not in {".bdb", ".sdb", ".cdb", ".hdb", ".jpg", ".jpeg", ".png", ".zip"}, path
    assert not re.search(r"notes\.json|bible-study-.*\.json|credentials|client_secret", path.name, re.I), path
    if path.suffix.lower() in {".js", ".html", ".json", ".css", ".md"}:
        text = path.read_text()
        assert not re.search(r"ya29\.[A-Za-z0-9_-]+|-----BEGIN .*PRIVATE KEY-----|GOCSPX-[A-Za-z0-9_-]+", text), path
        assert "/Users/chaeyoung2/" not in text, path
topics = json.loads((docs / "topics.json").read_text())
assert all(v["text"] == "" for t in topics["topics"] for e in t["entries"] for v in e["verses"])
assert 'src="/' not in (docs / "index.html").read_text()
assert "window.BrowserBible" in (docs / "app.js").read_text()
print("PASS: public code/metadata only; no private datasets, quotations, notes, paths or secret patterns")
