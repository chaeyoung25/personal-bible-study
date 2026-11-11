function renderTopics() {
  const selected = $("topicSelect").value;
  const query = $("topicQuery").value.trim().normalize("NFC").toLocaleLowerCase();
  const topics = state.topics.topics.filter((topic) => !selected || topic.id === selected);
  const entries = topics.flatMap((topic) => topic.entries.map((entry) => ({ ...entry, topic: topic.name })));
  const filtered = entries.filter((entry) => `${entry.reference} ${entry.title} ${entry.topic} ${entry.verses.map((verse) => verse.text).join(" ")}`.normalize("NFC").toLocaleLowerCase().includes(query));
  if ($("topicSort").value === "bible") filtered.sort((a, b) => a.book - b.book || a.chapter - b.chapter || a.start - b.start || a.number - b.number);
  $("topicCount").textContent = `${filtered.length}개 항목 / ${entries.length}개`;
  $("topicResults").replaceChildren();
  const fragment = document.createDocumentFragment();
  filtered.forEach((entry) => {
    const item = document.createElement("article");
    item.className = "topic-entry";
    const head = document.createElement("div");
    head.className = "topic-entry-head";
    const button = document.createElement("button");
    button.textContent = `${entry.reference} · ${entry.title}`;
    button.title = "성경 본문 열기";
    button.onclick = async () => {
      state.book = entry.book;
      state.chapter = entry.chapter;
      await loadPassage(entry.start);
      document.querySelector(`[data-verse="${entry.start}"]`)?.scrollIntoView({ block: "center" });
    };
    const label = document.createElement("small");
    label.textContent = `${entry.number} · ${entry.topic}`;
    head.append(button, label);
    item.append(head);
    entry.verses.forEach((verse) => {
      const paragraph = document.createElement("p");
      const number = document.createElement("span");
      number.className = "topic-verse-number";
      number.textContent = verse.verse;
      const text = document.createElement("span");
      text.textContent = verse.text;
      paragraph.append(number, text);
      item.append(paragraph);
    });
    fragment.append(item);
  });
  $("topicResults").append(fragment);
  $("topicResults").scrollTop = 0;
  if (!filtered.length) $("topicResults").textContent = "검색 결과가 없습니다.";
}

function bindTopics() {
  const dialog = $("topicsDialog");
  const header = dialog.querySelector(".topics-header");
  header.onpointerdown = (event) => {
    if (event.button !== 0 || event.target.closest("button")) return;
    event.preventDefault();
    const rect = dialog.getBoundingClientRect();
    dialog.style.margin = "0";
    dialog.style.inset = "auto";
    dialog.style.left = `${rect.left}px`;
    dialog.style.top = `${rect.top}px`;
    dialog.style.width = `${rect.width}px`;
    dialog.style.height = `${rect.height}px`;
    header.setPointerCapture(event.pointerId);
    const move = (pointer) => {
      dialog.style.left = `${Math.max(0, Math.min(innerWidth - dialog.offsetWidth, rect.left + pointer.clientX - event.clientX))}px`;
      dialog.style.top = `${Math.max(0, Math.min(innerHeight - dialog.offsetHeight, rect.top + pointer.clientY - event.clientY))}px`;
    };
    const end = (pointer) => {
      header.removeEventListener("pointermove", move);
      header.removeEventListener("pointerup", end);
      header.removeEventListener("pointercancel", end);
      if (header.hasPointerCapture(pointer.pointerId)) header.releasePointerCapture(pointer.pointerId);
    };
    header.addEventListener("pointermove", move);
    header.addEventListener("pointerup", end);
    header.addEventListener("pointercancel", end);
  };
  dialog.querySelectorAll("[data-topic-corner]").forEach((handle) => {
    handle.title = "드래그하여 창 크기 조절";
    handle.onpointerdown = (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      const rect = dialog.getBoundingClientRect();
      const west = handle.dataset.topicCorner.includes("w");
      const north = handle.dataset.topicCorner.includes("n");
      dialog.style.margin = "0";
      dialog.style.inset = "auto";
      dialog.style.left = `${rect.left}px`;
      dialog.style.top = `${rect.top}px`;
      dialog.style.width = `${rect.width}px`;
      dialog.style.height = `${rect.height}px`;
      handle.setPointerCapture(event.pointerId);
      const move = (pointer) => {
        const dx = pointer.clientX - event.clientX, dy = pointer.clientY - event.clientY;
        const width = Math.max(Math.min(340, innerWidth - 16), Math.min(west ? rect.right - 8 : innerWidth - rect.left - 8, rect.width + (west ? -dx : dx)));
        const height = Math.max(Math.min(300, innerHeight - 16), Math.min(north ? rect.bottom - 8 : innerHeight - rect.top - 8, rect.height + (north ? -dy : dy)));
        dialog.style.width = `${width}px`;
        dialog.style.height = `${height}px`;
        if (west) dialog.style.left = `${rect.right - width}px`;
        if (north) dialog.style.top = `${rect.bottom - height}px`;
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
  });
  const all = document.createElement("option");
  all.value = ""; all.textContent = "전체 주제 · 1,000선";
  $("topicSelect").append(all);
  state.topics.topics.forEach((topic) => {
    const option = document.createElement("option");
    option.value = topic.id;
    option.textContent = `${topic.name} · ${topic.entries.length}선`;
    $("topicSelect").append(option);
  });
  $("topicSelect").value = "1";
  $("openTopics").onclick = () => { renderTopics(); if (!dialog.open) dialog.show(); };
  $("closeTopics").onclick = () => $("topicsDialog").close();
  $("topicSelect").onchange = renderTopics;
  $("topicQuery").oninput = renderTopics;
  $("topicSort").onchange = renderTopics;
}
