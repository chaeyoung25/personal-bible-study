function downloadResearch(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function researchBackup() {
  return { format: "personal-bible-study", schema: 1, savedAt: new Date().toISOString(), data: state.notes };
}

function validateResearchBackup(payload) {
  if (payload.format !== "personal-bible-study" || payload.schema !== 1 || !payload.data) throw new Error("이 프로그램의 백업 파일이 아닙니다.");
  const data = payload.data;
  for (const name of ["notes", "underlines", "highlights", "updated", "tags"]) {
    if (data[name] === undefined) data[name] = {};
    if (!data[name] || typeof data[name] !== "object" || Array.isArray(data[name])) throw new Error("잘못된 백업 형식입니다.");
    for (const key of Object.keys(data[name])) if (!/^(?:[1-9]|[1-5]\d|6[0-6])-\d+(?:-\d+)?$/.test(key)) throw new Error("잘못된 구절 번호입니다.");
  }
  if (!Object.values(data.notes).every((value) => typeof value === "string")) throw new Error("메모 형식 오류");
  if (!Object.values(data.tags).every((value) => Array.isArray(value) && value.every((tag) => typeof tag === "string"))) throw new Error("태그 형식 오류");
  for (const name of ["underlines", "highlights"]) if (!Object.values(data[name]).every((value) => value && typeof value.text === "string")) throw new Error("표시 형식 오류");
  if (!Array.isArray(data.annotations) || !data.annotations.every((mark) => mark && typeof mark.key === "string" && typeof mark.version === "string" && typeof mark.text === "string" && ["underline", "highlight"].includes(mark.type) && Number.isInteger(mark.start) && Number.isInteger(mark.end) && mark.start >= 0 && mark.end > mark.start)) throw new Error("선택 표시 형식 오류");
  data.bookmarks ||= [];
  return data;
}

function openResearchExport(scope = "chapter") {
  $("exportScope").value = scope;
  $("exportDialog").showModal();
}

function researchExportText() {
  const scope = $("exportScope").value;
  const lines = ["Personal Bible Study", ""];
  const memo = (key) => {
    if (!state.notes.notes[key]) return;
    const [book, chapter, verse] = key.split("-").map(Number);
    lines.push(`${referenceLabel(book, chapter, verse)} 메모`, state.notes.notes[key]);
    if (state.notes.tags?.[key]?.length) lines.push(state.notes.tags[key].map((tag) => `#${tag}`).join(" "));
    lines.push("");
  };
  if (scope === "notes") Object.keys(state.notes.notes).sort((a,b) => { const aa=a.split("-").map(Number),bb=b.split("-").map(Number); return aa[0]-bb[0] || aa[1]-bb[1] || (aa[2]||0)-(bb[2]||0); }).forEach(memo);
  else if (scope === "selection") {
    if (!state.selection.length) throw new Error("먼저 본문을 선택해 주세요.");
    const keys = new Set();
    state.selection.forEach((part) => { const [book,chapter,verse]=part.key.split("-").map(Number); lines.push(`${bookInfo(book).short} ${chapter}:${verse} (${versionName(part.version)}) ${part.text}`); keys.add(part.key); });
    lines.push(""); keys.forEach(memo);
  } else {
    memo(`${state.book}-${state.chapter}`);
    Object.entries(state.passage.versions).forEach(([version, verses]) => {
      lines.push(versionName(version));
      verses.forEach((row) => lines.push(`${bookInfo(row.book).short} ${row.chapter}:${row.verse} ${row.btext}`));
      lines.push("");
    });
    Object.keys(state.notes.notes).filter((key) => key.startsWith(`${state.book}-${state.chapter}-`)).forEach(memo);
  }
  return lines.join("\n");
}

function researchExportHtml(text) {
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><title>Personal Bible Study</title><style>body{max-width:800px;margin:40px auto;padding:20px;font-family:system-ui;line-height:1.8}pre{white-space:pre-wrap;font:inherit}@media print{body{margin:0}}</style><pre>${escapeHtml(text)}</pre></html>`;
}

async function loadCrossReferences(book, chapter, verse) {
  const key = `${book}-${chapter}-${verse}`;
  state.crossReferenceKey = key;
  const source = state.library.commentaries.find((item) => sameName(item.name, "성경관주"));
  if (!source) return;
  try {
    const payload = await api(`/api/passage?versions=${encodeURIComponent(source.id)}&book=${book}&chapter=${chapter}`);
    if (state.crossReferenceKey !== key) return;
    const row = payload.versions[source.id]?.find((row) => row.verse === verse);
    $("crossReferences").replaceChildren();
    if (!row) { $("crossReferences").textContent = "이 구절의 관주가 없습니다."; return; }
    const parser = new DOMParser();
    row.btext.split(/<br\s*\/?>\s*<br\s*\/?>/i).forEach((part) => {
      const text = parser.parseFromString(part, "text/html").body.textContent.trim();
      if (!text) return;
      const ref = text.match(/\(([^()]+)\)\s*$/)?.[1];
      const button = document.createElement("button");
      button.className = "result"; button.textContent = text;
      button.onclick = async () => {
        if (!ref) return;
        const payload = await api(`/api/resolve?q=${encodeURIComponent(ref)}`);
        if (!payload.reference) return;
        state.book = payload.reference.book; state.chapter = payload.reference.chapter;
        await loadPassage(payload.reference.verse);
        document.querySelector(`[data-verse="${payload.reference.verse}"]`)?.scrollIntoView({block:"center"});
      };
      $("crossReferences").append(button);
    });
  } catch(error) { if (state.crossReferenceKey === key) $("crossReferences").textContent=error.message; }
}

function renderPassageGuide() {
  const target = $("passageGuide");
  if (!target || !state.library) return;
  const key = `${state.book}-${state.chapter}-${state.originalVerse}`;
  const chapterKey = `${state.book}-${state.chapter}`;
  target.replaceChildren();
  const heading = document.createElement("strong");
  heading.textContent = referenceLabel(state.book, state.chapter, state.originalVerse);
  target.append(heading);
  const add = (label, text) => {
    const section = document.createElement("section");
    const title = document.createElement("h3");
    title.className = "guide-heading"; title.textContent = label;
    const content = document.createElement("p");
    content.textContent = text;
    section.append(title, content); target.append(section);
  };
  const tags = state.notes.tags?.[key] || [];
  const marks = [
    state.notes.highlights?.[key] ? "형광펜" : "",
    state.notes.underlines?.[key] ? "밑줄" : "",
    ...tags.map((tag) => `#${tag}`),
  ].filter(Boolean);
  add("저장 표시 · 태그", marks.join(" · ") || "저장된 표시가 없습니다.");
  add("구절 메모", state.notes.notes?.[key] || "저장된 메모가 없습니다.");
  if (state.notes.notes?.[chapterKey]) add("장 메모", state.notes.notes[chapterKey]);
  const topics = state.topics?.topics.filter((topic) =>
    topic.entries.some((entry) => entry.verses.some((verse) => verse.key === key))) || [];
  const title = document.createElement("h3");
  title.className = "guide-heading"; title.textContent = "관련 주제";
  target.append(title);
  if (!topics.length) {
    const empty = document.createElement("p"); empty.textContent = "등록된 관련 주제가 없습니다."; target.append(empty);
  }
  topics.forEach((topic) => {
    const button = document.createElement("button");
    button.className = "guide-topic"; button.textContent = topic.name;
    button.onclick = () => {
      $("topicSelect").value = topic.id;
      $("topicQuery").value = "";
      renderTopics();
      if (!$("topicsDialog").open) $("topicsDialog").show();
    };
    target.append(button);
  });
}

function renderWordDistribution(rows, strong, grammar) {
  const target = $("wordDistribution");
  target.replaceChildren();
  const counts = new Map();
  for (const row of rows) {
    const count = row.analysis.split(/[\r\n]+/).filter((line) =>
      line.includes(`<W${strong}>`) && (!grammar || (line.split("@")[1] || "").split("#")[0].includes(grammar))).length;
    const entry = counts.get(row.book) || { verses: 0, occurrences: 0 };
    entry.verses++; entry.occurrences += count;
    counts.set(row.book, entry);
  }
  const entries = [...counts.entries()].sort((a, b) => a[0] - b[0]);
  const total = entries.reduce((sum, [, value]) => sum + value.occurrences, 0);
  const summary = document.createElement("p");
  summary.textContent = `${total.toLocaleString("ko-KR")}회 · ${rows.length.toLocaleString("ko-KR")}개 구절 · ${entries.length}권`;
  target.append(summary);
  const max = Math.max(1, ...entries.map(([, value]) => value.occurrences));
  for (const [book, value] of entries) {
    const button = document.createElement("button");
    button.className = "distribution-row";
    button.setAttribute("aria-label", `${bookInfo(book).name}: ${value.occurrences}회, ${value.verses}개 구절 보기`);
    const label = document.createElement("span"); label.textContent = bookInfo(book).short;
    const meter = document.createElement("meter");
    meter.min = 0; meter.max = max; meter.value = value.occurrences;
    const number = document.createElement("small");
    number.textContent = `${value.occurrences}회 / ${value.verses}절`;
    button.append(label, meter, number);
    button.onclick = () => { $("concordanceScope").value = String(book); renderConcordance(); };
    target.append(button);
  }
  if (!entries.length) summary.textContent = "조건에 맞는 용례가 없습니다.";
}

function bindResearch() {
  $("comparisonLayout").value = state.comparisonLayout;
  $("comparisonLayout").onchange = () => {
    state.comparisonLayout = $("comparisonLayout").value;
    BrowserBible.settings.setItem("comparisonLayout", state.comparisonLayout);
    if (state.passage) renderPassage(state.passage);
    refreshPassagePanes();
  };
  const backupButton = $("backupResearch"), restoreButton = $("restoreResearch");
  backupButton.onclick = async () => {
    backupButton.disabled = restoreButton.disabled = true;
    try {
      const result = await api("/api/research-backup", { method: "POST" });
      $("researchStatus").textContent = `백업 완료: ${result.file}`;
    } catch(error) { $("researchStatus").textContent=error.message; }
    finally { backupButton.disabled = restoreButton.disabled = false; }
  };
  restoreButton.onclick = async () => {
    backupButton.disabled = restoreButton.disabled = true;
    try {
      const result = await api("/api/research-restore-latest", { method: "POST" });
      state.notes = result.data;
      renderNotes(); renderPassage(state.passage);
      refreshPassagePanes();
      $("researchStatus").textContent = `최신 백업 복원 완료: ${result.file}`;
    } catch(error) { $("researchStatus").textContent=error.message; }
    finally { backupButton.disabled = restoreButton.disabled = false; }
  };
  $("savedQuery").oninput=renderSaved;
  const searchTags = () => {
    if ($("savedTag").value.trim()) $("savedFilter").value = "all";
    renderSaved();
  };
  $("savedTag").oninput = searchTags;
  $("savedTag").onkeydown = (event) => {
    if (event.key === "Enter") { event.preventDefault(); searchTags(); }
  };
  $("concordanceScope").onchange=renderConcordance; $("concordanceGrammar").oninput=renderConcordance;
  state.library.books.forEach((book)=>{ const option=document.createElement("option"); option.value=book.id;option.textContent=book.name;$("concordanceScope").append(option); });
  $("exportResearch").onclick=()=>openResearchExport();
  $("closeExport").onclick=()=>$("exportDialog").close();
  for(const [id,html] of [["exportTxt",false],["exportHtml",true]]) $(id).onclick=()=>{try{const text=researchExportText();downloadResearch(`bible-study.${html?"html":"txt"}`,html?researchExportHtml(text):text,html?"text/html":"text/plain;charset=utf-8");}catch(error){$("researchStatus").textContent=error.message;}};
  $("printResearch").onclick=()=>{try{const text=researchExportText();const win=window.open("","_blank");if(!win)throw new Error("인쇄 창이 차단되었습니다.");win.document.write(researchExportHtml(text));win.document.close();win.focus();win.print();}catch(error){$("researchStatus").textContent=error.message;}};
}
