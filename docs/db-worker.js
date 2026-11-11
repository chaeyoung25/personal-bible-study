importScripts("./vendor/sql-wasm.js");
importScripts("./terminology.js" + new URL(self.location.href).search);
const sqlReady = initSqlJs({ locateFile: file => new URL("./vendor/" + file, self.location.href).href });
const handles = new Map();
function rows(db, sql, params = []) {
  const statement = db.prepare(sql);
  try {
    statement.bind(params);
    const result = [];
    while (statement.step()) result.push(BibleTerms.content(statement.getAsObject()));
    return result;
  } finally { statement.free(); }
}
function storedFile(id) {
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open("personal-bible-private-v1", 1);
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const db = opening.result;
      const request = db.transaction("files").objectStore("files").get(id);
      request.onsuccess = () => { db.close(); resolve(request.result); };
      request.onerror = () => { db.close(); reject(request.error); };
    };
  });
}
async function database(id) {
  if (handles.has(id)) {
    const value = handles.get(id); handles.delete(id); handles.set(id, value); return value;
  }
  const data = await storedFile(id);
  if (!data) throw Error("이 기기에 자료가 없습니다. Drive에서 해당 파일을 선택해 주세요.");
  const SQL = await sqlReady;
  while (handles.size >= 2) { const [key, db] = handles.entries().next().value; db.close(); handles.delete(key); }
  const db = new SQL.Database(new Uint8Array(data));
  db.run("PRAGMA query_only=ON"); handles.set(id, db); return db;
}
async function execute(message) {
  const { action, id, params = {} } = message;
  if (action === "reset") { for (const db of handles.values()) db.close(); handles.clear(); return true; }
  if (action === "validate") {
    const SQL = await sqlReady;
    const db = new SQL.Database(new Uint8Array(message.buffer));
    try {
      db.run("PRAGMA query_only=ON");
      rows(db, params.kind === "hymns" ? "SELECT chapter,title,htext FROM hymnal LIMIT 1" : "SELECT book,chapter,verse,btext FROM Bible LIMIT 1");
    } finally { db.close(); }
    return true;
  }
  const db = await database(params.version || params.source);
  if (action === "passage") return rows(db, "SELECT book,chapter,verse,btext FROM Bible WHERE book=? AND chapter=? ORDER BY verse", [params.book, params.chapter]);
  if (action === "search") return rows(db, "SELECT book,chapter,verse,btext FROM Bible WHERE REPLACE(btext, '침례', '세례') LIKE ? ORDER BY book,chapter,verse LIMIT 200", ["%" + BibleTerms.text(params.query) + "%"]);
  if (action === "hymns") return rows(db, "SELECT chapter,title,htext FROM hymnal WHERE chapter BETWEEN 1 AND 645 ORDER BY chapter");
  if (action === "topicTexts") return rows(db, "SELECT book,chapter,verse,btext FROM Bible");
  if (action === "concordance") {
    if (!/^[GH][1-9][0-9]*$/.test(params.strong)) throw Error("잘못된 스트롱 번호");
    const found = rows(db, "SELECT book,chapter,verse,btext AS analysis FROM Bible WHERE btext LIKE ? ORDER BY book,chapter,verse", ["%<W" + params.strong + ">%"]);
    const translation = await database(params.translation);
    return found.map(row => ({...row, btext: rows(translation, "SELECT btext FROM Bible WHERE book=? AND chapter=? AND verse=?", [row.book,row.chapter,row.verse])[0]?.btext || ""}));
  }
  throw Error("지원하지 않는 검색 요청");
}
let queue = Promise.resolve();
self.onmessage = event => {
  const message = event.data;
  queue = queue.then(async () => {
    try { self.postMessage({ id: message.id, result: await execute(message) }); }
    catch (error) { self.postMessage({ id: message.id, error: error.message }); }
  });
};
