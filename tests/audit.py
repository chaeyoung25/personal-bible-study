import json
from pathlib import Path
import re
import hashlib

docs = Path(__file__).resolve().parents[1] / "docs"
for path in docs.rglob("*"):
    if not path.is_file():
        continue
    if path.name in {"app-icon-180.png", "app-icon-192.png", "app-icon-512.png"} and path.parent == docs:
        size = int(path.stem.rsplit("-", 1)[1])
        data = path.read_bytes()
        assert data[:8] == b'\x89PNG\r\n\x1a\n' and int.from_bytes(data[16:20], 'big') == size and int.from_bytes(data[20:24], 'big') == size
    else:
        assert path.suffix.lower() not in {".bdb", ".sdb", ".cdb", ".hdb", ".jpg", ".jpeg", ".png", ".zip"}, path
    assert not re.search(r"notes\.json|bible-study-.*\.json|credentials|client_secret", path.name, re.I), path
    if path.suffix.lower() in {".js", ".html", ".json", ".css", ".md"}:
        text = path.read_text()
        assert not re.search(r"ya29\.[A-Za-z0-9_-]+|-----BEGIN .*PRIVATE KEY-----|GOCSPX-[A-Za-z0-9_-]+", text), path
        assert not re.search(r"/(?:Users|home)/[A-Za-z0-9_.-]+/", text), path
vendor = json.loads((docs / "vendor-integrity.json").read_text())
for name, metadata in vendor.items():
    assert hashlib.sha256((docs / "vendor" / name).read_bytes()).hexdigest() == metadata["sha256"], name
topics = json.loads((docs / "topics.json").read_text())
assert all(v["text"] == "" for t in topics["topics"] for e in t["entries"] for v in e["verses"])
assert 'src="/' not in (docs / "index.html").read_text()
assert "window.BrowserBible" in (docs / "app.js").read_text()
print("PASS: public code/metadata only; no private datasets, quotations, notes, paths or secret patterns")
