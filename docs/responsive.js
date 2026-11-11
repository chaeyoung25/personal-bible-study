const compactScreen = window.matchMedia("(max-width: 1100px)");
let drawerReturnFocus = null;

function renderCompactVersions(grid) {
  const pane = grid.closest(".passage-pane");
  if (!pane) return;
  let tabs = pane.querySelector(".mobile-version-tabs");
  if (!tabs) {
    tabs = document.createElement("nav");
    tabs.className = "mobile-version-tabs";
    tabs.setAttribute("aria-label", "읽을 역본 선택");
    grid.before(tabs);
  }
  const columns = [...grid.querySelectorAll(".version-column")];
  const previous = pane.dataset.mobileVersion;
  let selected = Math.max(0, columns.findIndex(column => column.querySelector(".version-title").textContent === previous));
  tabs.replaceChildren();
  const choose = index => {
    selected = index;
    pane.dataset.mobileVersion = columns[index].querySelector(".version-title").textContent;
    columns.forEach((column, i) => column.classList.toggle("mobile-version-active", i === index));
    [...tabs.children].forEach((button, i) => button.setAttribute("aria-pressed", String(i === index)));
  };
  columns.forEach((column, index) => {
    const button = document.createElement("button");
    button.textContent = column.querySelector(".version-title").textContent;
    button.onclick = () => choose(index);
    tabs.append(button);
  });
  if (columns.length) choose(selected);
  tabs.hidden = columns.length < 2;
}

function setStudyDrawer(name = null) {
  if (!compactScreen.matches) name = null;
  const opening = Boolean(name);
  if (opening && !document.body.dataset.drawer) drawerReturnFocus = document.activeElement;
  if (name) document.body.dataset.drawer = name;
  else delete document.body.dataset.drawer;
  $("drawerBackdrop").hidden = !opening;
  $("toggleNavigation").setAttribute("aria-expanded", String(name === "navigation"));
  $("toggleStudy").setAttribute("aria-expanded", String(name === "study"));
  $("navigationPanel").inert = compactScreen.matches && name !== "navigation";
  $("studyPanel").inert = compactScreen.matches && name !== "study";
  document.querySelector(".reader").inert = opening;
  if (opening) {
    $(name === "study" ? "studyPanel" : "navigationPanel").querySelector("[data-close-drawer]").focus();
  } else if (drawerReturnFocus?.isConnected) {
    drawerReturnFocus.focus({ preventScroll: true }); drawerReturnFocus = null;
  }
}

function updateCompactPanes() {
  if (!$("compactPaneSelect") || !state.panes) return;
  fillSelect($("compactPaneSelect"), state.panes.map((pane, index) => ({
    id: String(index), name: `${index + 1}. ${bookInfo(pane.book).name} ${pane.chapter}장`,
  })), String(state.panes.indexOf(state.activePane)));
  $("compactClosePane").disabled = state.activePane === state.panes[0];
}

function initResponsive() {
  const fitViewport = () => {
    const viewport = window.visualViewport;
    document.documentElement.style.setProperty("--visible-height", `${viewport?.height || innerHeight}px`);
    document.documentElement.style.setProperty("--keyboard-offset", `${Math.max(0, innerHeight - (viewport?.height || innerHeight) - (viewport?.offsetTop || 0))}px`);
  };
  window.visualViewport?.addEventListener("resize", fitViewport);
  window.visualViewport?.addEventListener("scroll", fitViewport);
  window.addEventListener("resize", fitViewport);
  fitViewport();
  let selectionTimer;
  document.addEventListener("selectionchange", () => {
    if (!compactScreen.matches) return;
    clearTimeout(selectionTimer);
    selectionTimer = setTimeout(() => {
      if (!window.getSelection()?.isCollapsed) captureSelection();
    }, 180);
  });
  const toggle = (name) => setStudyDrawer(document.body.dataset.drawer === name ? null : name);
  $("toggleNavigation").onclick = () => toggle("navigation");
  $("toggleStudy").onclick = () => toggle("study");
  $("drawerBackdrop").onclick = () => setStudyDrawer();
  document.querySelectorAll("[data-close-drawer]").forEach(button => button.onclick = () => setStudyDrawer());
  for (const [id, original] of [["compactHymns", "openHymns"], ["compactTopics", "openTopics"]]) {
    $(id).onclick = () => { setStudyDrawer(); $(original).click(); };
  }
  $("compactPaneSelect").onchange = () => activatePassagePane(state.panes[Number($("compactPaneSelect").value)]);
  $("compactAddPane").onclick = () => $("addPassagePane").click();
  $("compactClosePane").onclick = () => state.activePane?.element.querySelector('[aria-label="본문 창 닫기"]')?.click();
  $("navigationPanel").addEventListener("click", event => {
    if (event.target.closest(".book-item, #goRef, #openHymns, #openTopics")) setStudyDrawer();
  });
  $("studyPanel").addEventListener("click", event => {
    if (event.target.closest(".result, .saved-go")) setStudyDrawer();
  });
  document.addEventListener("keydown", event => {
    if (!document.body.dataset.drawer) return;
    if (event.key === "Escape") { event.preventDefault(); setStudyDrawer(); }
    if (event.key !== "Tab") return;
    const panel = $(document.body.dataset.drawer === "study" ? "studyPanel" : "navigationPanel");
    const items = [...panel.querySelectorAll('button:not(:disabled),input,select,textarea,[tabindex="0"]')]
      .filter(item => item.getClientRects().length && !item.closest("[hidden]"));
    if (!items.length) return;
    if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1).focus(); }
    else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus(); }
  });
  compactScreen.addEventListener("change", () => { setStudyDrawer(); updateCompactPanes(); });
  setStudyDrawer(); updateCompactPanes();
}
