const state = {
  library: null,
  book: Number(BrowserBible.settings.getItem("book") || 43),
  chapter: Number(BrowserBible.settings.getItem("chapter") || 3),
  versions: JSON.parse(BrowserBible.settings.getItem("versions") || "[]"),
  fontSize: Number(BrowserBible.settings.getItem("fontSize") || 18),
  dark: BrowserBible.settings.getItem("dark") === "1",
  notes: { bookmarks: [], notes: {} },
  selectedVerse: null,
  passage: null,
  selection: [],
  verseSpacing: Number(BrowserBible.settings.getItem("verseSpacing") || 10),
  lineSpacing: Number(BrowserBible.settings.getItem("lineSpacing") || 1.9),
  originalVerse: 1,
  originalRequest: 0,
  concordanceRequest: 0,
  comparisonLayout: BrowserBible.settings.getItem("comparisonLayout") || "aligned",
};

const $ = (id) => document.getElementById(id);

async function api(path, options) {
  if (window.BrowserBible) return window.BrowserBible.api(path, options);
  const response = await fetch(path, { cache: "no-store", ...options });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "요청 실패");
  return payload;
}

function bookInfo(id = state.book) {
  return state.library.books.find((book) => book.id === Number(id));
}

function versionName(id) {
  const found = state.library.translations.concat(state.library.commentaries).find((item) => item.id === id);
  return found ? found.name : id;
}

function sameName(value, expected) {
  return (value || "").normalize("NFC") === expected.normalize("NFC");
}

function persist() {
  BrowserBible.settings.setItem("book", state.book);
  BrowserBible.settings.setItem("chapter", state.chapter);
  BrowserBible.settings.setItem("versions", JSON.stringify(state.versions));
  BrowserBible.settings.setItem("fontSize", state.fontSize);
  BrowserBible.settings.setItem("dark", state.dark ? "1" : "0");
  BrowserBible.settings.setItem("verseSpacing", state.verseSpacing);
  BrowserBible.settings.setItem("lineSpacing", state.lineSpacing);
}

function applyReadingSettings() {
  document.documentElement.style.setProperty("--verse-spacing", `${state.verseSpacing}px`);
  document.documentElement.style.setProperty("--line-spacing", state.lineSpacing);
  $("verseSpacing").value = state.verseSpacing;
  $("lineSpacing").value = state.lineSpacing;
  $("verseSpacingValue").textContent = `${state.verseSpacing * 2}px`;
  $("lineSpacingValue").textContent = state.lineSpacing.toFixed(2);
}

async function loadOriginal(verse = state.originalVerse) {
  state.originalVerse = Number(verse);
  renderPassageGuide();
  const request = ++state.originalRequest;
  const source = state.library.commentaries.find((item) => sameName(item.name, "원전분해"));
  $("originalResults").textContent = "불러오는 중…";
  if (!source) { $("originalResults").textContent = "원전분해 자료를 찾을 수 없습니다."; return; }
  try {
    const payload = await api(`/api/passage?versions=${encodeURIComponent(source.id)}&book=${state.book}&chapter=${state.chapter}`);
    if (request !== state.originalRequest) return;
    const verses = payload.versions[source.id] || [];
    fillSelect($("originalVerse"), verses.map((row) => ({ id: String(row.verse), name: `${row.verse}절` })), String(state.originalVerse));
    const row = verses.find((item) => item.verse === state.originalVerse);
    loadCrossReferences(state.book, state.chapter, state.originalVerse);
    $("originalResults").replaceChildren();
    if (!row) { $("originalResults").textContent = "이 구절의 원전분해 자료가 없습니다."; return; }
    row.btext.split(/[\r\n]+/).filter((line) => line.trim()).forEach((line) => {
      const item = document.createElement("div");
      item.className = "original-word";
      const match = line.match(/^\[([^\]]+)\]\s*\(기본\s+<W([GH]\d+)>\s*\[([^\]]+)\]\s*([^)]*)\)@([^#]*)#\s*(.*)$/);
      if (match) {
        const [, word, strong, lemma, pronunciation, grammar, meaning] = match;
        item.innerHTML = `<strong>${escapeHtml(word)}</strong><span>${escapeHtml(meaning.replace(/\*$/, ""))}</span><small>${escapeHtml(lemma)} · ${escapeHtml(pronunciation)} · ${escapeHtml(strong)}</small><small>${escapeHtml(grammar.trim())}</small>`;
        item.tabIndex = 0;
        item.setAttribute("role", "button");
        item.title = `${lemma} (${strong}) 사용 구절 전체 보기`;
        item.onclick = () => loadConcordance(strong, lemma, pronunciation);
        item.onkeydown = (event) => {
          if (event.key === "Enter" || event.key === " ") { event.preventDefault(); item.click(); }
        };
      } else item.textContent = line.replace(/<W([GH]\d+)>/g, "$1").replace(/\*$/, "");
      $("originalResults").append(item);
    });
  } catch (error) {
    if (request === state.originalRequest) $("originalResults").textContent = error.message;
  }
}

async function loadConcordance(strong, lemma, pronunciation) {
  const request = ++state.concordanceRequest;
  $("concordancePanel").hidden = false;
  $("concordanceTitle").textContent = `${lemma} · ${pronunciation} (${strong})`;
  $("concordanceCount").textContent = "검색 중…";
  $("concordanceResults").replaceChildren();
  const version = state.versions[0];
  try {
    const payload = await api(`/api/concordance?strong=${strong}&version=${encodeURIComponent(version)}`);
    if (request !== state.concordanceRequest) return;
    state.concordance = { rows: payload.results, strong, version };
    renderConcordance();
  } catch (error) {
    if (request === state.concordanceRequest) $("concordanceCount").textContent = error.message;
  }
}

function renderConcordance() {
    if (!state.concordance) return;
    const { rows, strong, version } = state.concordance;
    const scope = $("concordanceScope").value;
    const grammar = $("concordanceGrammar").value.trim();
    const filtered = rows.filter((row) => (scope === "all" || (scope === "ot" ? row.book <= 39 : scope === "nt" ? row.book >= 40 : row.book === Number(scope))) && row.analysis.split(/[\r\n]+/).some((line) => line.includes(`<W${strong}>`) && (!grammar || (line.split("@")[1] || "").split("#")[0].includes(grammar))));
    renderWordDistribution(filtered, strong, grammar);
    $("concordanceResults").replaceChildren();
    $("concordanceCount").textContent = `${filtered.length.toLocaleString("ko-KR")} / ${rows.length.toLocaleString("ko-KR")}개 구절 · ${versionName(version)}`;
    const fragment = document.createDocumentFragment();
    filtered.forEach((row) => {
      const button = document.createElement("button");
      button.className = "result";
      const matches = row.analysis.split(/[\r\n]+/).filter((line) => line.includes(`<W${strong}>`)).map((line) => line.replace(/<W([GH]\d+)>/g, "$1").replace(/\*$/, ""));
      button.innerHTML = `<strong>${referenceLabel(row.book, row.chapter, row.verse)}</strong><span>${escapeHtml(row.btext || matches.join(" · "))}</span><small>${escapeHtml(matches.join(" · "))}</small>`;
      button.onclick = async () => {
        state.book = row.book;
        state.chapter = row.chapter;
        await loadPassage(row.verse);
        document.querySelector(`[data-verse="${row.verse}"]`)?.scrollIntoView({ block: "center" });
      };
      fragment.append(button);
    });
    $("concordanceResults").append(fragment);
}

function fillSelect(select, items, selected, includeBlank = false) {
  select.innerHTML = "";
  if (includeBlank) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "사용 안 함";
    select.append(option);
  }
  items.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.name;
    if (item.id === selected) option.selected = true;
    select.append(option);
  });
}

function renderBooks() {
  $("bookList").innerHTML = "";
  state.library.books.forEach((book) => {
    const button = document.createElement("button");
    button.className = `book-item ${book.id === state.book ? "active" : ""}`;
    button.textContent = book.short;
    button.title = book.name;
    button.onclick = () => {
      state.book = book.id;
      state.chapter = 1;
      loadPassage();
    };
    $("bookList").append(button);
  });
}

function renderChapters() {
  const book = bookInfo();
  $("chapterSelect").innerHTML = "";
  for (let chapter = 1; chapter <= book.chapters; chapter += 1) {
    const option = document.createElement("option");
    option.value = chapter;
    option.textContent = `${chapter}장`;
    if (chapter === state.chapter) option.selected = true;
    $("chapterSelect").append(option);
  }
}

function referenceLabel(book = state.book, chapter = state.chapter, verse = null) {
  const info = bookInfo(book);
  return `${info ? info.name : book} ${chapter}${verse ? `:${verse}` : ""}`;
}

function renderNotes() {
  const key = noteKey();
  $("noteRef").textContent = referenceLabel(state.book, state.chapter, state.selectedVerse);
  $("noteText").placeholder = state.selectedVerse ? "구절에 대한 메모" : "현재 장에 대한 메모";
  $("noteText").value = state.notes.notes[key] || "";
  $("noteTags").value = (state.notes.tags?.[key] || []).join(", ");
  $("deleteNote").disabled = !state.notes.notes[key];
  renderSaved();
}

function openMemo(rect) {
  renderNotes();
  const popup = $("memoPopup");
  popup.hidden = false;
  $("saveStatus").textContent = "";
  popup.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - popup.offsetWidth - 8))}px`;
  const below = rect.bottom + 8;
  popup.style.top = `${Math.max(8, Math.min(below, innerHeight - popup.offsetHeight - 8))}px`;
  $("noteText").focus();
}

function noteKey() {
  return `${state.book}-${state.chapter}${state.selectedVerse ? `-${state.selectedVerse}` : ""}`;
}

function openTags(keys, rect) {
  state.tagKeys = [...new Set(keys)];
  state.notes.tags ||= {};
  state.tagShared = (state.notes.tags[state.tagKeys[0]] || []).filter((tag) => state.tagKeys.every((key) => (state.notes.tags[key] || []).includes(tag)));
  $("markTags").value = state.tagShared.join(", ");
  const [book, chapter, verse] = state.tagKeys[0].split("-").map(Number);
  $("tagRef").textContent = `${referenceLabel(book, chapter, verse)}${state.tagKeys.length > 1 ? ` 외 ${state.tagKeys.length - 1}개 구절` : ""} 태그`;
  $("tagStatus").textContent = "";
  const popup = $("tagPopup");
  popup.hidden = false;
  popup.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - popup.offsetWidth - 8))}px`;
  popup.style.top = `${Math.max(8, Math.min(rect.bottom + 8, innerHeight - popup.offsetHeight - 8))}px`;
  $("markTags").focus();
}

function renderVersionSelectors() {
  $("versionSelectors").replaceChildren();
  state.versions.forEach((version, index) => {
    const row = document.createElement("div");
    row.className = "version-selector";
    row.dataset.version = version;
    const handle = document.createElement("button");
    handle.className = "version-drag-handle";
    handle.textContent = "⠿";
    handle.title = "드래그하여 역본 순서 변경";
    handle.setAttribute("aria-label", `${versionName(version)} 순서 이동`);
    handle.onkeydown = (event) => {
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
      event.preventDefault();
      const target = index + (event.key === "ArrowUp" ? -1 : 1);
      if (target < 0 || target >= state.versions.length) return;
      state.versions.splice(index, 1);
      state.versions.splice(target, 0, version);
      renderVersionSelectors();
      $("versionSelectors").children[target].querySelector("button").focus();
      loadPassage();
    };
    handle.onpointerdown = (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      handle.setPointerCapture(event.pointerId);
      row.classList.add("dragging");
      let destination = index;
      const move = (pointer) => {
        const rows = [...$("versionSelectors").children];
        rows.forEach((item) => item.classList.remove("drop-before", "drop-after"));
        const target = rows.find((item) => {
          const rect = item.getBoundingClientRect();
          return pointer.clientY >= rect.top && pointer.clientY <= rect.bottom;
        });
        if (!target || target === row) { destination = index; return; }
        const targetIndex = rows.indexOf(target);
        const after = pointer.clientY > target.getBoundingClientRect().top + target.offsetHeight / 2;
        destination = targetIndex + (after ? 1 : 0);
        if (destination > index) destination--;
        target.classList.add(after ? "drop-after" : "drop-before");
      };
      const finish = (pointer) => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", finish);
        handle.removeEventListener("pointercancel", cancel);
        if (handle.hasPointerCapture(pointer.pointerId)) handle.releasePointerCapture(pointer.pointerId);
        if (destination !== index) {
          state.versions.splice(index, 1);
          state.versions.splice(destination, 0, version);
          renderVersionSelectors();
          loadPassage();
        } else renderVersionSelectors();
      };
      const cancel = (pointer) => { destination = index; finish(pointer); };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", finish);
      handle.addEventListener("pointercancel", cancel);
    };
    const select = document.createElement("select");
    select.setAttribute("aria-label", `대조 역본 ${index + 1}`);
    fillSelect(select, state.library.translations, version);
    select.onchange = () => {
      state.versions[index] = select.value;
      state.versions = [...new Set(state.versions)];
      renderVersionSelectors();
      loadPassage();
    };
    const remove = document.createElement("button");
    remove.textContent = "×";
    remove.title = "역본 제거";
    remove.disabled = state.versions.length === 1;
    remove.onclick = () => {
      state.versions.splice(index, 1);
      renderVersionSelectors();
      loadPassage();
    };
    row.append(handle, select, remove);
    $("versionSelectors").append(row);
  });
  $("addVersion").disabled = state.versions.length >= state.library.translations.length;
}

function renderSaved() {
  const filter = $("savedFilter").value;
  const source = filter === "all" ? { ...state.notes.underlines, ...state.notes.highlights, ...state.notes.notes } : filter === "highlights" ? state.notes.highlights : filter === "underlines" ? state.notes.underlines : state.notes.notes;
  const normalize = (value) => String(value || "").normalize("NFC").trim().toLocaleLowerCase();
  const query = normalize($("savedQuery").value);
  const tag = normalize($("savedTag").value).replace(/^#/, "");
  const entries = Object.entries(source).filter(([key, value]) => {
    const tags = state.notes.tags?.[key] || [];
    const text = filter === "all" ? `${state.notes.notes[key] || ""} ${state.notes.highlights[key]?.text || ""} ${state.notes.underlines[key]?.text || ""}` : typeof value === "string" ? value : value.text;
    return Boolean(value) && (!query || normalize(`${text} ${tags.join(" ")}`).includes(query)) && (!tag || tags.some((value) => normalize(value).includes(tag)));
  });
  entries.sort(([a], [b]) => {
    if ($("savedSort").value === "recent") return (state.notes.updated[b] || 0) - (state.notes.updated[a] || 0);
    const aa = a.split("-").map(Number), bb = b.split("-").map(Number);
    return aa[0] - bb[0] || aa[1] - bb[1] || (aa[2] || 0) - (bb[2] || 0);
  });
  $("savedList").replaceChildren();
  entries.forEach(([key, value]) => {
    const [book, chapter, verse] = key.split("-").map(Number);
    const item = document.createElement("button");
    item.className = "result";
    item.style.textAlign = "left";
    item.innerHTML = `<strong>${referenceLabel(book, chapter, verse)}</strong><span>${escapeHtml(typeof value === "string" ? value : value.text || "")}</span>`;
    if (state.notes.tags?.[key]?.length) { const tags = document.createElement("small"); tags.textContent = state.notes.tags[key].map((tag) => `#${tag}`).join(" "); item.append(tags); }
    item.onclick = async () => {
      state.book = book;
      state.chapter = chapter;
      await loadPassage(verse || null);
      if (verse) document.querySelector(`[data-verse="${verse}"]`)?.scrollIntoView({ block: "center" });
      if (typeof value === "string") {
        const row = document.querySelector(`[data-verse="${verse || 1}"]`);
        openMemo(row ? row.getBoundingClientRect() : $("chapterGrid").getBoundingClientRect());
      } else {
        const row = document.querySelector(`[data-verse="${verse || 1}"]`);
        openTags([key], row ? row.getBoundingClientRect() : $("chapterGrid").getBoundingClientRect());
      }
    };
    $("savedList").append(item);
  });
  if (!entries.length) $("savedList").textContent = "저장된 항목이 없습니다.";
}

async function saveNotes() {
  await api("/api/notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state.notes),
  });
  renderPassageGuide();
  refreshPassagePanes();
}

function renderPassage(payload, pane = state.activePane) {
  if (pane) {
    pane.passage = payload;
    if (pane === state.activePane) {
      pane.book = state.book; pane.chapter = state.chapter;
      pane.versions = [...state.versions]; pane.selectedVerse = state.selectedVerse;
    }
  }
  const context = pane || state;
  const grid = pane?.grid || $("chapterGrid");
  if (!pane || pane === state.activePane) {
    state.passage = payload;
    $("title").textContent = `${bookInfo(context.book).name} ${context.chapter}장`;
    $("subtitle").textContent = context.versions.filter(Boolean).map(versionName).join(" · ");
  }
  grid.innerHTML = "";
  const verseNumbers = [...new Set(Object.values(payload.versions).flatMap((rows) => rows.map((row) => row.verse)))].sort((a, b) => a - b);
  grid.classList.toggle("aligned", state.comparisonLayout === "aligned");
  grid.style.setProperty("--verse-rows", verseNumbers.length + 1);
  grid.style.setProperty("--version-count", Math.max(1, context.versions.filter(Boolean).length));
  context.versions.filter(Boolean).forEach((version) => {
    const verses = payload.versions[version] || [];
    const column = document.createElement("article");
    column.className = "version-column";
    column.innerHTML = `<div class="version-title">${versionName(version)}</div>`;
    verseNumbers.forEach((number) => {
      const verse = verses.find((item) => item.verse === number);
      if (!verse) {
        const empty = document.createElement("div");
        empty.className = "verse verse-unavailable";
        empty.textContent = `${number} · 본문 없음`;
        column.append(empty);
        return;
      }
      const row = document.createElement("div");
      row.className = "verse";
      const key = `${verse.book}-${verse.chapter}-${verse.verse}`;
      row.dataset.verse = verse.verse;
      row.dataset.key = key;
      row.dataset.version = version;
      row.onclick = () => {
        if (pane) activatePassagePane(pane);
        if (!window.getSelection()?.toString().trim()) loadOriginal(verse.verse);
      };
      row.classList.toggle("underlined", Boolean(state.notes.underlines[key]) && !state.notes.annotations.some((mark) => mark.key === key && mark.type === "underline"));
      row.classList.toggle("selected", context.selectedVerse === verse.verse);
      row.classList.toggle("topic-mark", Boolean(state.notes.highlights[key]?.topicMark));
      row.innerHTML = `<span class="verse-num">${verse.verse}</span><span class="verse-text">${escapeHtml(verse.btext || "")}</span>`;
      const text = verse.btext || "";
      const marks = state.notes.annotations.filter((mark) => mark.key === key && mark.version === version);
      const boundaries = [...new Set([0, text.length, ...marks.flatMap((mark) => [mark.start, mark.end])])].sort((a, b) => a - b);
      const textElement = row.querySelector(".verse-text");
      textElement.replaceChildren();
      for (let i = 0; i < boundaries.length - 1; i++) {
        const start = boundaries[i], end = boundaries[i + 1];
        const span = document.createElement("span");
        span.textContent = text.slice(start, end);
        marks.filter((mark) => mark.start < end && mark.end > start).forEach((mark) => span.classList.add(`text-${mark.type}`));
        textElement.append(span);
      }
      row.ondblclick = async () => {
        await navigator.clipboard.writeText(`${bookInfo(verse.book).short}${verse.chapter}:${verse.verse} ${textElement.textContent}`);
      };
      column.append(row);
    });
    grid.append(column);
  });
  if (typeof renderCompactVersions === "function") renderCompactVersions(grid);
  if (pane) { updatePaneControls(pane); persistPassagePanes(); }
  renderPassageGuide();
}

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[char]));
}

function hideSelectionMenu() {
  $("selectionMenu").hidden = true;
}

function captureSelection() {
  const selection = window.getSelection();
  if (!selection.rangeCount || selection.isCollapsed) return hideSelectionMenu();
  const range = selection.getRangeAt(0);
  const elementOf = (node) => node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  const first = elementOf(range.startContainer).closest(".verse-text");
  const last = elementOf(range.endContainer).closest(".verse-text");
  if (!first || !last || first.closest(".version-column") !== last.closest(".version-column")) return hideSelectionMenu();
  const pane = state.panes?.find((item) => item.element === first.closest(".passage-pane"));
  if (pane) activatePassagePane(pane);
  const offset = (element, node, position) => {
    const prefix = document.createRange();
    prefix.selectNodeContents(element);
    prefix.setEnd(node, position);
    return prefix.toString().length;
  };
  state.selection = [];
  first.closest(".version-column").querySelectorAll(".verse-text").forEach((element) => {
    if (!range.intersectsNode(element)) return;
    const start = element === first ? offset(element, range.startContainer, range.startOffset) : 0;
    const end = element === last ? offset(element, range.endContainer, range.endOffset) : element.textContent.length;
    if (end <= start) return;
    const row = element.closest(".verse");
    state.selection.push({ key: row.dataset.key, version: row.dataset.version, start, end, text: element.textContent.slice(start, end) });
  });
  if (!state.selection.length) return hideSelectionMenu();
  const rect = range.getBoundingClientRect();
  const menu = $("selectionMenu");
  menu.hidden = false;
  menu.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - menu.offsetWidth - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(rect.bottom + 8, innerHeight - menu.offsetHeight - 8))}px`;
}

async function applySelection(type) {
  const selected = state.selection;
  if (!selected.length) return;
  const menuRect = $("selectionMenu").getBoundingClientRect();
  hideSelectionMenu();
  window.getSelection().removeAllRanges();
  if (type === "export") { openResearchExport("selection"); return; }
  if (type === "tags") { openTags(selected.map((part) => part.key), menuRect); return; }
  if (type === "original") {
    if (compactScreen.matches) setStudyDrawer("study");
    await loadOriginal(Number(selected[0].key.split("-")[2]));
    $("originalResults").scrollIntoView({ block: "nearest" });
    return;
  }
  if (type === "memo") {
    state.selectedVerse = Number(selected[0].key.split("-")[2]);
    renderPassage(state.passage);
    openMemo({ left: menuRect.left, bottom: menuRect.top });
    loadOriginal(state.selectedVerse);
    return;
  }
  selected.forEach((part) => {
    if (type === "remove") {
      state.notes.annotations = state.notes.annotations.flatMap((mark) => {
        if (mark.key !== part.key || mark.version !== part.version || mark.end <= part.start || mark.start >= part.end) return [mark];
        const pieces = [];
        if (mark.start < part.start) pieces.push({ ...mark, end: part.start, text: mark.text.slice(0, part.start - mark.start) });
        if (mark.end > part.end) pieces.push({ ...mark, start: part.end, text: mark.text.slice(part.end - mark.start) });
        return pieces;
      });
      delete state.notes.underlines[part.key];
    } else {
      state.notes.annotations.push({ ...part, type });
    }
    for (const [markType, collection] of [["underline", "underlines"], ["highlight", "highlights"]]) {
      const remaining = state.notes.annotations.filter((mark) => mark.key === part.key && mark.type === markType);
      if (remaining.length) state.notes[collection][part.key] = { text: remaining.map((mark) => mark.text).join(" · ") };
      else if (type === "remove") delete state.notes[collection][part.key];
    }
    state.notes.updated[part.key] = Date.now();
  });
  try {
    await saveNotes();
    renderPassage(state.passage);
    renderSaved();
    if (type === "highlight" || type === "underline") openTags(selected.map((part) => part.key), menuRect);
  } catch (error) {
    $("saveStatus").textContent = `저장 실패: ${error.message}`;
  }
}

async function loadPassage(selectedVerse = null) {
  const pane = state.activePane;
  const request = pane ? (pane.request = (pane.request || 0) + 1) : 0;
  $("tagPopup").hidden = true;
  hideSelectionMenu();
  $("memoPopup").hidden = true;
  state.selectedVerse = selectedVerse;
  const book = bookInfo();
  if (state.chapter < 1) state.chapter = 1;
  if (state.chapter > book.chapters) state.chapter = book.chapters;
  persist();
  applyReadingSettings();
  document.body.classList.toggle("dark", state.dark);
  document.documentElement.style.setProperty("--reader-size", `${state.fontSize}px`);
  renderBooks();
  renderChapters();
  renderNotes();
  if (pane) Object.assign(pane, { book: state.book, chapter: state.chapter, versions: [...state.versions], selectedVerse });
  const versions = state.versions.filter(Boolean).join(",");
  const payload = await api(`/api/passage?versions=${encodeURIComponent(versions)}&book=${state.book}&chapter=${state.chapter}`);
  if (pane && (pane.request !== request || !state.panes.includes(pane))) return;
  renderPassage(payload, pane);
  if (!pane || pane === state.activePane) await loadOriginal(selectedVerse || 1);
}

async function search() {
  const q = $("searchInput").value.trim();
  if (q.length < 2) return;
  $("searchResults").innerHTML = "검색 중...";
  const version = $("searchVersion").value;
  const payload = await api(`/api/search?version=${encodeURIComponent(version)}&q=${encodeURIComponent(q)}`);
  $("searchResults").innerHTML = "";
  payload.results.forEach((row) => {
    const item = document.createElement("div");
    item.className = "result";
    item.innerHTML = `<strong>${referenceLabel(row.book, row.chapter, row.verse)}</strong><span>${escapeHtml(row.btext || "")}</span>`;
    item.onclick = () => {
      state.book = row.book;
      state.chapter = row.chapter;
      loadPassage();
    };
    $("searchResults").append(item);
  });
  if (!payload.results.length) $("searchResults").textContent = "검색 결과가 없습니다.";
}

async function goReference() {
  const payload = await api(`/api/resolve?q=${encodeURIComponent($("refInput").value)}`);
  if (!payload.reference) {
    $("refInput").select();
    return;
  }
  state.book = payload.reference.book;
  state.chapter = payload.reference.chapter;
  await loadPassage();
}

function bindEvents() {
  $("closeTags").onclick = () => { $("tagPopup").hidden = true; };
  $("markTags").onkeydown = (event) => {
    if (event.key === "Enter") { event.preventDefault(); $("saveTags").click(); }
    if (event.key === "Escape") $("tagPopup").hidden = true;
  };
  $("saveTags").onclick = async () => {
    const typed = [...new Set($("markTags").value.split(",").map((tag) => tag.trim()).filter(Boolean))];
    const previous = structuredClone(state.notes.tags);
    state.tagKeys.forEach((key) => {
      state.notes.tags[key] = [...new Set([...(state.notes.tags[key] || []).filter((tag) => !state.tagShared.includes(tag)), ...typed])];
    });
    $("saveTags").disabled = true;
    try {
      await saveNotes();
      state.tagShared = typed;
      $("tagStatus").textContent = "태그를 저장했습니다.";
      renderSaved();
    } catch (error) {
      state.notes.tags = previous;
      $("tagStatus").textContent = `저장 실패: ${error.message}`;
    } finally { $("saveTags").disabled = false; }
  };
  bindTopics();
  bindResearch();
  let hymns = [], selectedHymn = null, hymnRequest = 0, hymnTimer;
  let scoreScale = 100, scoreFit = true;
  const hymnWindow = $("hymnDialog");
  // History stores only navigation markers. Hymn data stays in memory.
  const hymnHistorySession = `${Date.now()}-${Math.random()}`;
  let hymnHistoryIndex = 0, applyingHymnHistory = false;
  const hymnScreens = [];
  const captureHymnScreen = () => ({
    open:hymnWindow.open, search:hymnWindow.classList.contains("search-open"),
    full:hymnWindow.classList.contains("score-fullscreen"), split:hymnWindow.classList.contains("bible-visible"),
    lyrics:!$("hymnLyrics").hidden, hymn:selectedHymn, query:$("hymnSearch").value,
    results:hymns, scale:scoreScale, fit:scoreFit, width:scoreWidth,
    scroll:[$("hymnScore").scrollLeft,$("hymnScore").scrollTop],
  });
  const rememberHymnScreen = () => { if (!applyingHymnHistory) hymnScreens[hymnHistoryIndex] = captureHymnScreen(); };
  const pushHymnScreen = () => {
    if (applyingHymnHistory) return;
    const next = captureHymnScreen(), current = hymnScreens[hymnHistoryIndex];
    const identity = screen => JSON.stringify([screen.open,screen.search,screen.full,screen.split,screen.lyrics,screen.hymn?.number,screen.query]);
    if (current && identity(current) === identity(next)) return;
    hymnScreens.splice(hymnHistoryIndex + 1);
    hymnScreens[++hymnHistoryIndex] = next;
    history.pushState({...history.state,pbsHymn:{session:hymnHistorySession,index:hymnHistoryIndex}}, "");
  };
  const fullHymnButton = document.createElement("button");
  fullHymnButton.id = "fullHymns"; fullHymnButton.textContent = "전체 화면";
  $("closeHymns").before(fullHymnButton);
  const exitHymnButton = document.createElement("button");
  exitHymnButton.id = "exitFullHymns"; exitHymnButton.textContent = "전체 화면 닫기";
  hymnWindow.append(exitHymnButton);
  let previousScoreView = null;
  const restoreHymnView = () => {
    hymnWindow.classList.remove("score-fullscreen");
    if (previousScoreView) {
      ({scoreFit, scoreScale, scoreWidth} = previousScoreView);
      previousScoreView = null;
    }
    requestAnimationFrame(sizeScore);
    fullHymnButton.focus({preventScroll:true});
  };
  fullHymnButton.onclick = () => {
    previousScoreView = {scoreFit, scoreScale, scoreWidth};
    scoreFit = true; scoreScale = 100; scoreWidth = false;
    $("hymnSearch").blur();
    hymnWindow.classList.add("score-fullscreen");
    exitHymnButton.focus({preventScroll:true});
    // The viewport-sized layout also works where the Fullscreen API is absent.
    if (hymnWindow.requestFullscreen && !document.fullscreenElement)
      hymnWindow.requestFullscreen().catch(() => {});
    requestAnimationFrame(sizeScore);
  };
  exitHymnButton.onclick = () => {
    if (hymnHistoryIndex > 0 && hymnScreens[hymnHistoryIndex]?.full) { history.back(); return; }
    if (document.fullscreenElement === hymnWindow) document.exitFullscreen().catch(() => {});
    restoreHymnView();
  };
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement && hymnWindow.classList.contains("score-fullscreen")) {
      restoreHymnView();
      if (!applyingHymnHistory && hymnScreens[hymnHistoryIndex]?.full) history.back();
    }
    else requestAnimationFrame(sizeScore);
  });
  hymnWindow.addEventListener("keydown", event => {
    if (event.key === "Escape" && hymnWindow.classList.contains("score-fullscreen")) {
      event.preventDefault(); exitHymnButton.click();
    }
  });
  let scoreWidth = false;
  const mobileHymns = () => matchMedia("(max-width: 700px)").matches;
  const setHymnSearch = open => {
    hymnWindow.classList.toggle("search-open", open);
    $("toggleHymnSearch").setAttribute("aria-expanded", String(open));
    if (open) $("hymnSearch").focus(); else $("hymnSearch").blur();
  };
  $("toggleHymnSearch").onclick = () => setHymnSearch(!hymnWindow.classList.contains("search-open"));
  $("hymnReadingMode").onclick = () => {
    const split = hymnWindow.classList.toggle("bible-visible");
    $("hymnReadingMode").textContent = split ? "크게 보기" : "성경 함께";
  };
  $("clearHymnSearch").onclick = () => { $("hymnSearch").value = ""; searchHymns(); $("hymnSearch").focus(); };
  const widthButton = document.createElement("button");
  widthButton.id = "scoreWidth"; widthButton.textContent = "너비 맞춤";
  $("scoreFit").after(widthButton);
  const songNavigation = document.createElement("div");
  songNavigation.className = "hymn-song-navigation";
  songNavigation.innerHTML = '<button id="previousHymn" aria-label="이전 찬송가">‹ 이전 곡</button><button id="nextHymn" aria-label="다음 찬송가">다음 곡 ›</button>';
  hymnWindow.querySelector(".hymn-content").append(songNavigation);
  const resizeHymn = (handle, corner) => {
    handle.onpointerdown = (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      const rect = hymnWindow.getBoundingClientRect();
      const docked = hymnWindow.classList.contains("docked");
      if (corner && docked) {
        hymnWindow.classList.remove("docked");
        document.body.classList.remove("hymn-open");
        hymnWindow.style.left = `${rect.left}px`;
        hymnWindow.style.top = `${rect.top}px`;
        hymnWindow.style.width = `${rect.width}px`;
        hymnWindow.style.height = `${rect.height}px`;
      }
      handle.setPointerCapture(event.pointerId);
      const move = (pointer) => {
        const dx = pointer.clientX - event.clientX;
        const fromLeft = corner ? corner.includes("w") : true;
        const width = Math.max(Math.min(420, innerWidth), Math.min(fromLeft ? rect.right : innerWidth - rect.left, rect.width + (fromLeft ? -dx : dx)));
        hymnWindow.style.width = `${width}px`;
        if (corner && fromLeft) hymnWindow.style.left = `${rect.right - width}px`;
        if (!corner && !docked) hymnWindow.style.left = `${rect.right - width}px`;
        if (corner) {
          const fromTop = corner.includes("n");
          const dy = pointer.clientY - event.clientY;
          const height = Math.max(Math.min(260, innerHeight), Math.min(fromTop ? rect.bottom : innerHeight - rect.top, rect.height + (fromTop ? -dy : dy)));
          hymnWindow.style.height = `${height}px`;
          if (fromTop) hymnWindow.style.top = `${rect.bottom - height}px`;
        }
        if (docked && !corner) document.documentElement.style.setProperty("--hymn-width", `${width}px`);
      };
      const end = (pointer) => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", end);
        handle.removeEventListener("pointercancel", end);
        if (handle.hasPointerCapture(pointer.pointerId)) handle.releasePointerCapture(pointer.pointerId);
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", end);
      handle.addEventListener("pointercancel", end);
    };
  };
  resizeHymn($("hymnResizeEdge"), false);
  hymnWindow.querySelectorAll("[data-corner]").forEach((handle) => resizeHymn(handle, handle.dataset.corner));
  const sizeScore = () => {
    const area = $("hymnScore");
    area.querySelectorAll("img").forEach((img) => {
      if (!img.naturalWidth) return;
      const fit = Math.min((area.clientWidth - 20) / img.naturalWidth, (area.clientHeight - 20) / img.naturalHeight);
      const baseline = scoreWidth ? (area.clientWidth - 20) / img.naturalWidth : fit;
      const scale = scoreFit ? baseline : baseline * scoreScale / 100;
      img.style.width = `${Math.max(1, img.naturalWidth * scale)}px`;
      img.style.height = `${Math.max(1, img.naturalHeight * scale)}px`;
    });
    $("scoreZoom").value = scoreScale;
    $("scoreZoomValue").textContent = `${scoreScale}%`;
  };
  const dock = () => {
    hymnWindow.classList.add("docked");
    hymnWindow.style.left = "auto";
    hymnWindow.style.top = "0px";
    hymnWindow.style.height = "100vh";
    document.body.classList.add("hymn-open");
    document.documentElement.style.setProperty("--hymn-width", `${hymnWindow.offsetWidth}px`);
  };
  $("dockHymns").onclick = dock;
  const header = hymnWindow.querySelector(".hymn-header");
  header.onpointerdown = (event) => {
    if (mobileHymns()) return;
    if (event.target.closest("button") || event.button !== 0) return;
    const rect = hymnWindow.getBoundingClientRect();
    hymnWindow.classList.remove("docked");
    document.body.classList.remove("hymn-open");
    hymnWindow.style.left = `${rect.left}px`;
    hymnWindow.style.top = `${rect.top}px`;
    hymnWindow.style.width = `${rect.width}px`;
    hymnWindow.style.height = `${Math.min(rect.height, innerHeight - 16)}px`;
    header.setPointerCapture(event.pointerId);
    const move = (pointer) => {
      hymnWindow.style.left = `${Math.max(0, Math.min(innerWidth - hymnWindow.offsetWidth, rect.left + pointer.clientX - event.clientX))}px`;
      hymnWindow.style.top = `${Math.max(0, Math.min(innerHeight - 60, rect.top + pointer.clientY - event.clientY))}px`;
    };
    const end = () => { header.removeEventListener("pointermove", move); header.removeEventListener("pointerup", end); header.removeEventListener("pointercancel", end); };
    header.addEventListener("pointermove", move);
    header.addEventListener("pointerup", end);
    header.addEventListener("pointercancel", end);
  };
  new ResizeObserver(() => {
    if (hymnWindow.classList.contains("docked")) document.documentElement.style.setProperty("--hymn-width", `${hymnWindow.offsetWidth}px`);
    sizeScore();
  }).observe($("hymnScore"));
  $("scoreFit").onclick = () => { scoreWidth = false; scoreFit = true; scoreScale = 100; sizeScore(); $("hymnScore").scrollTo(0, 0); };
  widthButton.onclick = () => { scoreWidth = true; scoreFit = true; scoreScale = 100; sizeScore(); $("hymnScore").scrollTo(0, 0); };
  const zoomScore = (value) => { scoreFit = false; scoreScale = Math.max(25, Math.min(250, value)); sizeScore(); };
  $("scoreZoom").oninput = () => zoomScore(Number($("scoreZoom").value));
  $("scoreZoomOut").onclick = () => zoomScore(scoreScale - 25);
  $("scoreZoomIn").onclick = () => zoomScore(scoreScale + 25);
  const showHymn = (hymn) => {
    selectedHymn = hymn;
    $("previousHymn").disabled = hymn.number <= 1;
    $("nextHymn").disabled = hymn.number >= 645;
    $("hymnTitle").textContent = `${hymn.number}장 ${hymn.title}`;
    $("hymnLyrics").textContent = hymn.lyrics;
    $("hymnScore").replaceChildren();
    const images = hymn.images.length ? hymn.images : [`new_${hymn.number}.jpg`];
    images.forEach((name) => {
      const img = document.createElement("img");
      BrowserBible.image(name).then(url => { if (url) img.src = url; else img.onerror(); }).catch(() => img.onerror());
      img.alt = `${hymn.number}장 ${hymn.title} 악보`;
      img.onload = sizeScore;
      img.onerror = () => {
        img.replaceWith(document.createTextNode(`${hymn.number}장 악보를 불러오지 못했습니다. 창을 닫고 다시 열어주세요.`));
      };
      $("hymnScore").append(img);
    });
    $("hymnList").querySelectorAll("button").forEach((button) => button.classList.toggle("active", Number(button.dataset.number) === hymn.number));
  };
  const searchHymns = async () => {
    const request = ++hymnRequest;
    $("hymnCount").textContent = "검색 중…";
    try {
      const payload = await api(`/api/hymns?q=${encodeURIComponent($("hymnSearch").value.trim())}`);
      if (request !== hymnRequest) return;
      hymns = payload.results;
      $("hymnCount").textContent = `${hymns.length}곡`;
      $("hymnList").replaceChildren();
      hymns.forEach((hymn) => {
        const button = document.createElement("button");
        button.textContent = `${hymn.number}장 ${hymn.title}`;
        button.dataset.number = hymn.number;
        button.onclick = () => { rememberHymnScreen(); showHymn(hymn); if (mobileHymns()) setHymnSearch(false); pushHymnScreen(); };
        $("hymnList").append(button);
      });
      if (hymns.length) showHymn(hymns.find((hymn) => hymn.number === selectedHymn?.number) || hymns[0]);
      else { $("hymnTitle").textContent = "검색 결과가 없습니다."; $("hymnScore").replaceChildren(); $("hymnLyrics").textContent = ""; }
    } catch (error) { $("hymnCount").textContent = error.message; }
  };
  const moveHymn = async delta => {
    if (!selectedHymn) return;
    const number = selectedHymn.number + delta;
    const request = ++hymnRequest;
    try {
      const payload = await api(`/api/hymns?q=${number}`);
      if (request !== hymnRequest) return;
      const hymn = payload.results.find(item => item.number === number);
      if (hymn) { rememberHymnScreen(); showHymn(hymn); setHymnSearch(false); pushHymnScreen(); }
    } catch (error) { $("hymnCount").textContent = error.message; }
  };
  $("previousHymn").onclick = () => moveHymn(-1);
  $("nextHymn").onclick = () => moveHymn(1);
  $("hymnSearch").onkeydown = event => {
    if (event.key === "Enter") { event.preventDefault(); clearTimeout(hymnTimer); searchHymns().then(() => { if (hymns.length === 1 && mobileHymns()) { rememberHymnScreen(); setHymnSearch(false); pushHymnScreen(); } }); }
  };
  $("openHymns").onclick = () => { if (!hymnWindow.open) hymnWindow.show(); dock(); searchHymns(); setHymnSearch(!selectedHymn); if (!mobileHymns()) $("hymnSearch").focus(); };
  $("closeHymns").onclick = () => { hymnWindow.close(); document.body.classList.remove("hymn-open"); };
  hymnWindow.addEventListener("close", () => document.body.classList.remove("hymn-open"));
  $("hymnSearch").oninput = () => { clearTimeout(hymnTimer); hymnTimer = setTimeout(searchHymns, 200); };
  for (const [id, lyrics] of [["showScore", false], ["showLyrics", true]]) {
    $(id).onclick = () => {
      $("hymnScore").hidden = lyrics;
      $("hymnLyrics").hidden = !lyrics;
      $("showScore").setAttribute("aria-pressed", String(!lyrics));
      $("showLyrics").setAttribute("aria-pressed", String(lyrics));
      hymnWindow.querySelector(".score-toolbar").hidden = lyrics;
      requestAnimationFrame(sizeScore);
    };
  }
  hymnScreens[0] = captureHymnScreen();
  history.replaceState({...history.state,pbsHymn:{session:hymnHistorySession,index:0}}, "");
  for (const id of ["openHymns","toggleHymnSearch","hymnReadingMode","fullHymns","showScore","showLyrics"]) {
    const action = $(id).onclick;
    $(id).onclick = event => { rememberHymnScreen(); action(event); pushHymnScreen(); };
  }
  const closeHymnWindow = $("closeHymns").onclick;
  $("closeHymns").onclick = () => {
    if (hymnHistoryIndex > 0) history.go(-hymnHistoryIndex);
    else closeHymnWindow();
  };
  window.addEventListener("popstate", event => {
    const marker = event.state?.pbsHymn;
    if (marker?.session !== hymnHistorySession || !hymnScreens[marker.index]) return;
    applyingHymnHistory = true;
    clearTimeout(hymnTimer); ++hymnRequest;
    hymnHistoryIndex = marker.index;
    const screen = hymnScreens[hymnHistoryIndex];
    if (document.fullscreenElement === hymnWindow && !screen.full) document.exitFullscreen().catch(() => {});
    if (!screen.full) restoreHymnView();
    if (!screen.open) closeHymnWindow();
    else {
      if (!hymnWindow.open) hymnWindow.show();
      document.body.classList.add("hymn-open");
      hymnWindow.classList.toggle("search-open",screen.search);
      hymnWindow.classList.toggle("bible-visible",screen.split);
      hymnWindow.classList.toggle("score-fullscreen",screen.full);
      $("toggleHymnSearch").setAttribute("aria-expanded",String(screen.search));
      $("hymnReadingMode").textContent = screen.split ? "크게 보기" : "성경 함께";
      $("hymnSearch").value = screen.query;
      hymns = screen.results;
      $("hymnList").replaceChildren();
      hymns.forEach(hymn => {
        const button = document.createElement("button");
        button.textContent = `${hymn.number}장 ${hymn.title}`; button.dataset.number = hymn.number;
        button.onclick = () => { rememberHymnScreen(); showHymn(hymn); if(mobileHymns())setHymnSearch(false); pushHymnScreen(); };
        $("hymnList").append(button);
      });
      $("hymnCount").textContent = `${hymns.length}곡`;
      if (screen.hymn) showHymn(screen.hymn);
      $(screen.lyrics ? "showLyrics" : "showScore").onclick();
      scoreFit=screen.fit;scoreScale=screen.scale;scoreWidth=screen.width;
      $("hymnSearch").blur();
      requestAnimationFrame(() => {sizeScore(); $("hymnScore").scrollTo(...screen.scroll);});
    }
    applyingHymnHistory = false;
  });
  document.addEventListener("copy", (event) => {
    const selection = window.getSelection();
    if (!selection.rangeCount || selection.isCollapsed || !event.clipboardData) return;
    const range = selection.getRangeAt(0);
    const elementOf = (node) => node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    const first = elementOf(range.startContainer).closest(".chapter-grid");
    const last = elementOf(range.endContainer).closest(".chapter-grid");
    if (!first || first !== last) return;
    const lines = [];
    first.querySelectorAll(".verse-text").forEach((element) => {
      if (!range.intersectsNode(element)) return;
      const part = document.createRange();
      part.selectNodeContents(element);
      if (range.compareBoundaryPoints(Range.START_TO_START, part) > 0) part.setStart(range.startContainer, range.startOffset);
      if (range.compareBoundaryPoints(Range.END_TO_END, part) < 0) part.setEnd(range.endContainer, range.endOffset);
      const text = part.toString().trim();
      if (!text) return;
      const row = element.closest(".verse");
      const [book, chapter, verse] = row.dataset.key.split("-").map(Number);
      lines.push(`${bookInfo(book).short}${chapter}:${verse} ${text}`);
    });
    if (!lines.length) return;
    event.preventDefault();
    event.clipboardData.clearData();
    event.clipboardData.setData("text/plain", lines.join("\n"));
  });
  $("closeConcordance").onclick = () => { state.concordanceRequest++; $("concordancePanel").hidden = true; };
  $("originalVerse").onchange = () => loadOriginal($("originalVerse").value);
  $("verseSpacing").oninput = () => { state.verseSpacing = Number($("verseSpacing").value); applyReadingSettings(); persist(); };
  $("lineSpacing").oninput = () => { state.lineSpacing = Number($("lineSpacing").value); applyReadingSettings(); persist(); };
  $("deleteNote").onclick = async () => {
    const key = noteKey();
    const previous = state.notes.notes[key];
    delete state.notes.notes[key];
    try {
      await saveNotes();
      $("noteText").value = "";
      $("deleteNote").disabled = true;
      $("saveStatus").textContent = "메모를 삭제했습니다.";
      renderSaved();
      renderPassage(state.passage);
    } catch (error) {
      state.notes.notes[key] = previous;
      $("saveStatus").textContent = `삭제 실패: ${error.message}`;
    }
  };
  $("closeMemo").onclick = () => { $("memoPopup").hidden = true; };
  $("memoPopup").addEventListener("keydown", (event) => {
    if (event.key === "Escape") $("memoPopup").hidden = true;
  });
  document.addEventListener("selectionchange", () => {
    if (window.getSelection().isCollapsed) hideSelectionMenu();
  });
  $("chapterGrid").addEventListener("pointerup", () => setTimeout(captureSelection, 0));
  document.addEventListener("keyup", captureSelection);
  document.addEventListener("scroll", hideSelectionMenu, true);
  window.addEventListener("resize", hideSelectionMenu);
  $("selectionMenu").addEventListener("pointerdown", (event) => event.preventDefault());
  $("selectionMenu").querySelectorAll("button").forEach((button) => {
    button.onclick = () => applySelection(button.dataset.mark);
  });
  $("addVersion").onclick = () => {
    const next = state.library.translations.find((item) => !state.versions.includes(item.id));
    if (!next) return;
    state.versions.push(next.id);
    renderVersionSelectors();
    loadPassage();
  };
  $("savedFilter").onchange = renderSaved;
  $("savedSort").onchange = renderSaved;
  $("chapterSelect").onchange = () => {
    state.chapter = Number($("chapterSelect").value);
    loadPassage();
  };
  $("prevChapter").onclick = () => {
    state.chapter -= 1;
    loadPassage();
  };
  $("nextChapter").onclick = () => {
    state.chapter += 1;
    loadPassage();
  };
  $("fontDown").onclick = () => {
    state.fontSize = Math.max(14, state.fontSize - 1);
    loadPassage();
  };
  $("fontUp").onclick = () => {
    state.fontSize = Math.min(28, state.fontSize + 1);
    loadPassage();
  };
  $("themeToggle").onclick = () => {
    state.dark = !state.dark;
    loadPassage();
  };
  $("searchBtn").onclick = search;
  $("searchInput").onkeydown = (event) => {
    if (event.key === "Enter") search();
  };
  $("goRef").onclick = goReference;
  $("refInput").onkeydown = (event) => {
    if (event.key === "Enter") goReference();
  };
  $("saveNote").onclick = async () => {
    const key = noteKey();
    const text = $("noteText").value.trim();
    if (text) state.notes.notes[key] = text;
    else delete state.notes.notes[key];
    state.notes.updated[key] = Date.now();
    state.notes.tags ||= {};
    state.notes.tags[key] = [...new Set($("noteTags").value.split(",").map((tag) => tag.trim()).filter(Boolean))];
    try {
      await saveNotes();
      $("saveStatus").textContent = "저장되었습니다.";
      $("deleteNote").disabled = !text;
      renderSaved();
      renderPassage(state.passage);
    } catch (error) {
      $("saveStatus").textContent = `저장 실패: ${error.message}`;
    }
  };
}

async function init() {
  state.library = await api("/api/library");
  state.topics = await api("/topics.json");
  if (!state.versions.length) {
    state.versions = [
      state.library.translations.find((item) => sameName(item.name, "개역개정"))?.id,
      state.library.translations.find((item) => sameName(item.name, "ESV"))?.id,
    ].filter(Boolean);
    if (!state.versions.length) state.versions = [state.library.translations[0]?.id].filter(Boolean);
  }
  state.versions = [...new Set(state.versions.filter((id) => state.library.translations.some((item) => item.id === id)))];
  if (!state.versions.length) state.versions = [state.library.translations[0].id];
  renderVersionSelectors();
  fillSelect($("searchVersion"), state.library.translations, state.versions[0]);
  state.notes = await api("/api/notes");
  state.notes.underlines ||= {};
  state.notes.highlights ||= {};
  state.notes.annotations ||= [];
  state.notes.updated ||= {};
  bindEvents();
  initPassagePanes();
  initResponsive();
  await loadPassage();
}

BrowserBible.start(init).catch((error) => {
  document.body.innerHTML = `<pre style="padding:20px">${escapeHtml(error.message)}</pre>`;
});
