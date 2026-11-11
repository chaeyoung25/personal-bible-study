"""Build a public-only Pages directory; never copy private datasets or notes."""
import ast
import hashlib
import json
import re
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parent
APP = ROOT.parent
OUT = ROOT / "docs"
OUT.mkdir(exist_ok=True)
(OUT / "vendor").mkdir(exist_ok=True)
for name in ("sql-wasm.js", "sql-wasm.wasm", "LICENSE", "fflate.min.js", "fflate.LICENSE"):
    source = Path("/private/tmp/bible-sql-vendor") / name
    if source.exists():
        shutil.copyfile(source, OUT / "vendor" / name)
assets = ("styles.css", "responsive.css", "polish.css", "app.js", "panes.js", "research.js", "topics.js", "responsive.js")
for name in assets:
    content = (APP / "static" / name).read_text()
    content = content.replace("localStorage.", "BrowserBible.settings.")
    if name == "app.js":
        content = content.replace('  const response = await fetch(path,', '  if (window.BrowserBible) return window.BrowserBible.api(path, options);\n  const response = await fetch(path,')
        content = content.replace('img.src = `/hymn-score/${encodeURIComponent(name)}`;', 'BrowserBible.image(name).then(url => { if (url) img.src = url; else img.onerror(); }).catch(() => img.onerror());')
        content = content.replace('init().catch((error) => {', 'BrowserBible.start(init).catch((error) => {')
    if name == "research.js":
        content = content.replace('backups/${result.file}', '${result.file}')
    (OUT / name).write_text(content)
html = (APP / "static" / "index.html").read_text()
html = html.replace('href="/', 'href="./').replace('src="/', 'src="./')
html = html.replace('<title>', '<meta name="referrer" content="no-referrer">\n  <meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\' \'wasm-unsafe-eval\' https://accounts.google.com https://apis.google.com; style-src \'self\' \'unsafe-inline\' https://accounts.google.com; connect-src \'self\' https://www.googleapis.com https://accounts.google.com https://content.googleapis.com; img-src \'self\' blob: data: https://*.googleusercontent.com; frame-src https://accounts.google.com https://docs.google.com https://drive.google.com; worker-src \'self\'; object-src \'none\'; base-uri \'self\'; form-action \'none\'">\n  <link rel="stylesheet" href="./cloud.css">\n  <link rel="manifest" href="./manifest.webmanifest">\n  <title>', 1)
html = html.replace('<script src="./topics.js">', '<script src="./vendor/fflate.min.js"></script>\n  <script src="./migration.js"></script>\n  <script src="./sync-engine.js"></script>\n  <script src="./drive-sync.js"></script>\n  <script src="./browser.js"></script>\n  <script src="./topics.js">', 1)
html = html.replace('<button id="openHymns">', '<button id="openCloud">Drive · 자료 관리</button><button id="openHymns">', 1)
html = html.replace('<button id="openCloud">Drive · 자료 관리</button>', '<button id="openCloud">Drive · 자료 관리</button><button id="openSyncStatus" class="sync-summary" aria-label="동기화 상태 보기">Google 연결 필요</button>', 1)
html = html.replace('<strong>Personal Bible Study</strong><div>', '<strong>Personal Bible Study</strong><div><button id="compactCloud">Drive</button>', 1)
html = html.replace('<body>', '<body>\n' + (ROOT / "source" / "cloud.html").read_text(), 1)
html = html.replace('name="referrer" content="no-referrer"', 'name="referrer" content="strict-origin-when-cross-origin"')
html = html.replace('</head>', '<meta name="theme-color" content="#16263f">\n  <meta name="apple-mobile-web-app-title" content="Bible Study">\n  <link rel="icon" type="image/png" href="./app-icon-192.png">\n  <link rel="apple-touch-icon" sizes="180x180" href="./app-icon-180.png">\n</head>')
(OUT / "index.html").write_text(html)
# Only book metadata and topic references are public. Bible quotations stay private.
tree = ast.parse((APP / "server.py").read_text())
books = next(ast.literal_eval(node.value) for node in tree.body if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "BOOKS" for t in node.targets))
(OUT / "books.json").write_text(json.dumps([dict(id=i+1, name=b[0], short=b[1], chapters=b[2]) for i,b in enumerate(books)], ensure_ascii=False))
topics = json.loads((APP / "static" / "topics.json").read_text())
for topic in topics["topics"]:
    for entry in topic["entries"]:
        for verse in entry["verses"]:
            verse["text"] = ""
(OUT / "topics.json").write_text(json.dumps(topics, ensure_ascii=False))
for path in (ROOT / "source").iterdir():
    if path.is_file() and path.name != "cloud.html":
        shutil.copyfile(path, OUT / path.name)
if not (OUT / "vendor" / "sql-wasm.wasm").exists():
    raise SystemExit("Missing vendored sql.js files. See SETUP.md.")
# Give every script/style a content-specific URL, including on the first visit
# while the previous service worker is still controlling the page.
def version_asset(match):
    path = OUT / match.group(2)
    digest = hashlib.sha256(path.read_bytes()).hexdigest()[:16]
    return match.group(1) + match.group(2) + "?v=" + digest + match.group(3)
html = re.sub(r'((?:src|href)="\./)([^"?]+\.(?:js|css))(")', version_asset, html)
(OUT / "index.html").write_text(html)
allowed = {p.name for p in OUT.iterdir() if p.is_file()}
cache_files = sorted("./" + p.relative_to(OUT).as_posix() for p in OUT.rglob("*") if p.is_file() and p.name != "sw.js")
revision = hashlib.sha256(b"".join((OUT / p[2:]).read_bytes() for p in cache_files)).hexdigest()[:16]
sw = """const CACHE = 'bible-shell-REVISION';
const ASSETS = ASSET_LIST;
self.addEventListener('message', e => { if (e.data?.type === 'PBS_ACTIVATE') self.skipWaiting(); });
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(async c => {
  for (const path of ASSETS) {
    const url = new URL(path, self.location.href);
    url.searchParams.set('build', CACHE);
    const response = await fetch(url, {cache:'reload'});
    if (!response.ok) throw new Error('App update download failed');
    await c.put(new URL(path, self.location.href), response);
  }
})));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('bible-shell-') && k !== CACHE).map(k => caches.delete(k))))));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  const u = new URL(e.request.url);
  const base = new URL('./', self.location.href);
  const relative = './' + u.pathname.slice(base.pathname.length);
  if (!ASSETS.includes(relative) && u.pathname !== base.pathname) return;
  e.respondWith(fetch(e.request, {cache:'no-store'}).then(r => {
    if (r.ok && r.type === 'basic') { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return r;
  }).catch(async () => {
    const cache = await caches.open(CACHE);
    const response = await cache.match(e.request, {ignoreSearch:true});
    return response || (e.request.mode === 'navigate' && await cache.match('./index.html')) || Response.error();
  }));
});
""".replace("REVISION", revision).replace("ASSET_LIST", json.dumps(cache_files))
(OUT / "sw.js").write_text(sw)
(OUT / ".nojekyll").touch()
print("Public build complete:", OUT)
