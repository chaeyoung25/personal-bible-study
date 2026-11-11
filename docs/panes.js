function persistPassagePanes() {
  if (!state.panes) return;
  updateCompactPanes();
  BrowserBible.settings.setItem("passagePanes", JSON.stringify(state.panes.map((pane) => ({
    book: pane.book, chapter: pane.chapter, versions: pane.versions, width: pane.element.style.flexBasis, grow: pane.element.style.flexGrow,
  }))));
}

function activatePassagePane(pane) {
  if (state.activePane === pane) return;
  if (state.activePane) {
    Object.assign(state.activePane, {
      book: state.book, chapter: state.chapter, versions: [...state.versions],
      passage: state.passage, selectedVerse: state.selectedVerse,
    });
  }
  state.activePane = pane;
  state.book = pane.book; state.chapter = pane.chapter;
  state.versions = [...pane.versions]; state.passage = pane.passage;
  state.selectedVerse = pane.selectedVerse || null;
  state.originalRequest++;
  hideSelectionMenu();
  $("memoPopup").hidden = true; $("tagPopup").hidden = true;
  state.panes.forEach((item) => item.element.classList.toggle("active-pane", item === pane));
  renderBooks(); renderChapters(); renderVersionSelectors(); renderNotes();
  fillSelect($("searchVersion"), state.library.translations, state.versions[0]);
  $("title").textContent = `${bookInfo().name} ${state.chapter}장`;
  $("subtitle").textContent = state.versions.map(versionName).join(" · ");
  persist();
  updateCompactPanes();
  loadOriginal(state.selectedVerse || 1);
}

function updatePaneControls(pane) {
  pane.bookSelect.value = String(pane.book);
  fillSelect(pane.chapterSelect, Array.from({ length: bookInfo(pane.book).chapters }, (_, i) => ({
    id: String(i + 1), name: `${i + 1}장`,
  })), String(pane.chapter));
  pane.versionSelect.value = pane.versions[0];
  pane.previous.disabled = pane.chapter <= 1;
  pane.next.disabled = pane.chapter >= bookInfo(pane.book).chapters;
}

function createPassagePane(config, primary = false) {
  const element = primary ? $("primaryPane") : document.createElement("section");
  element.className = "passage-pane";
  const controls = primary ? element.querySelector(".pane-controls") : document.createElement("div");
  controls.className = "pane-controls";
  const grid = primary ? $("chapterGrid") : document.createElement("section");
  grid.className = "chapter-grid";
  if (!primary) element.append(controls, grid);
  const versions = (config.versions || []).filter((id) => state.library.translations.some((version) => version.id === id));
  const book = state.library.books.some((item) => item.id === Number(config.book)) ? Number(config.book) : 43;
  const pane = {
    element, grid, book, chapter: Math.max(1, Math.min(Number(config.chapter) || 1, bookInfo(book).chapters)),
    versions: versions.length ? [...versions] : [state.versions[0]], passage: null, selectedVerse: null,
  };
  element.style.flexBasis = config.width || "360px";
  element.style.flexGrow = config.grow === "0" ? "0" : "1";
  const select = (label) => {
    const node = document.createElement("select"); node.setAttribute("aria-label", label);
    controls.append(node); return node;
  };
  pane.bookSelect = select("본문 창 성경 선택");
  fillSelect(pane.bookSelect, state.library.books.map((book) => ({ id: String(book.id), name: book.name })), String(book));
  pane.chapterSelect = select("본문 창 장 선택");
  pane.versionSelect = select("본문 창 역본 선택");
  fillSelect(pane.versionSelect, state.library.translations, pane.versions[0]);
  const command = (text, title, run) => {
    const node = document.createElement("button"); node.textContent = text;
    node.title = title; node.setAttribute("aria-label", title); node.onclick = run;
    controls.append(node); return node;
  };
  const navigate = async (change) => {
    activatePassagePane(pane);
    change();
    try { await loadPassage(); }
    catch (error) { pane.grid.textContent = error.message; }
  };
  pane.bookSelect.onchange = () => navigate(() => { state.book = Number(pane.bookSelect.value); state.chapter = 1; });
  pane.chapterSelect.onchange = () => navigate(() => { state.chapter = Number(pane.chapterSelect.value); });
  pane.versionSelect.onchange = () => navigate(() => { state.versions = [pane.versionSelect.value]; renderVersionSelectors(); });
  pane.previous = command("‹", "본문 창 이전 장", () => navigate(() => { state.chapter--; }));
  pane.next = command("›", "본문 창 다음 장", () => navigate(() => { state.chapter++; }));
  if (!primary) command("×", "본문 창 닫기", () => {
    if (state.activePane === pane) activatePassagePane(state.panes[0]);
    state.panes = state.panes.filter((item) => item !== pane);
    element.previousElementSibling?.classList.contains("pane-divider") && element.previousElementSibling.remove();
    element.remove(); persistPassagePanes();
  });
  element.addEventListener("pointerup", (event) => {
    if (!event.target.closest(".verse")) return;
    setTimeout(captureSelection, 0);
  });
  element.addEventListener("focusin", (event) => {
    if (event.target.closest(".verse")) activatePassagePane(pane);
  });
  updatePaneControls(pane);
  state.panes.push(pane);
  if (!primary) {
    const divider = document.createElement("div");
    divider.className = "pane-divider"; divider.tabIndex = 0;
    divider.setAttribute("role", "separator"); divider.setAttribute("aria-orientation", "vertical");
    divider.setAttribute("aria-label", "본문 창 너비 조절");
    divider.setAttribute("aria-valuemin", "260"); divider.setAttribute("aria-valuemax", "1400");
    divider.setAttribute("aria-valuenow", String(Math.round(state.panes[state.panes.length - 2].element.getBoundingClientRect().width)));
    const setWidth = (left, width) => {
      width = Math.max(260, Math.min(1400, width));
      left.style.flexGrow = "0"; left.style.flexBasis = `${width}px`;
      divider.setAttribute("aria-valuenow", String(Math.round(width)));
    };
    divider.onpointerdown = (event) => {
      if (event.button !== 0) return;
      event.preventDefault(); divider.setPointerCapture(event.pointerId);
      const left = divider.previousElementSibling, start = event.clientX, width = left.getBoundingClientRect().width;
      divider.onpointermove = (move) => setWidth(left, width + move.clientX - start);
      const finish = () => {
        divider.onpointermove = null;
        if (divider.hasPointerCapture(event.pointerId)) divider.releasePointerCapture(event.pointerId);
        persistPassagePanes();
      };
      divider.onpointerup = finish; divider.onpointercancel = finish;
    };
    divider.onkeydown = (event) => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      const left = divider.previousElementSibling;
      setWidth(left, left.getBoundingClientRect().width + (event.key === "ArrowRight" ? 20 : -20));
      persistPassagePanes();
    };
    $("passageWorkspace").append(divider, element);
  }
  return pane;
}

async function loadIndependentPane(pane) {
  const request = pane.request = (pane.request || 0) + 1;
  pane.grid.textContent = "불러오는 중…";
  try {
    const payload = await api(`/api/passage?versions=${encodeURIComponent(pane.versions.join(","))}&book=${pane.book}&chapter=${pane.chapter}`);
    if (pane.request !== request || !state.panes.includes(pane)) return;
    renderPassage(payload, pane);
  } catch (error) { if (pane.request === request) pane.grid.textContent = error.message; }
}

function refreshPassagePanes() {
  for (const pane of state.panes || []) {
    if (pane !== state.activePane && pane.passage) renderPassage(pane.passage, pane);
  }
}

function initPassagePanes() {
  state.panes = [];
  let saved;
  try { saved = JSON.parse(BrowserBible.settings.getItem("passagePanes")); } catch {}
  if (!Array.isArray(saved) || !saved.length) saved = [
    { book: state.book, chapter: state.chapter, versions: state.versions },
    { book: 43, chapter: 10, versions: [state.versions[0]] },
  ];
  const primary = createPassagePane(saved[0], true);
  activatePassagePane(primary);
  saved.slice(1).forEach((config) => loadIndependentPane(createPassagePane(config)));
  $("addPassagePane").onclick = () => {
    const pane = createPassagePane({ book: state.book, chapter: state.chapter, versions: [state.versions[0]] });
    if (compactScreen.matches) activatePassagePane(pane);
    loadIndependentPane(pane);
    pane.element.scrollIntoView({ block: "nearest", inline: "end" });
    persistPassagePanes();
  };
}
