/* Read only public connection settings; never read notes, files or auth tokens. */
(() => {
  const status = document.getElementById("connectionStatus");
  const request = indexedDB.open("personal-bible-private-v1");
  request.onupgradeneeded = () => {
    request.transaction.abort();
    status.textContent = "이 브라우저에 연결설정이 없습니다. 기존 시험 화면에서 Google 설정 저장을 먼저 눌러주세요.";
  };
  request.onerror = () => {
    status.textContent = "저장된 연결설정을 읽을 수 없습니다. Google 설정을 입력했던 브라우저에서 이 링크를 열어주세요.";
  };
  request.onsuccess = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains("kv")) { db.close(); return; }
    const read = db.transaction("kv").objectStore("kv").get("public-config");
    read.onerror = () => { db.close(); status.textContent = "연결설정 읽기에 실패했습니다."; };
    read.onsuccess = () => {
      db.close();
      const value = read.result;
      if (!value || !/^[a-zA-Z0-9.-]+\.apps\.googleusercontent\.com$/.test(value.clientId) ||
          !/^AIza[\w-]+$/.test(value.pickerKey) || !/^\d+$/.test(value.project)) {
        status.textContent = "저장된 연결설정이 없습니다. 기존 시험 화면에서 설정 저장을 누른 후 다시 열어주세요."; return;
      }
      const clean = {clientId:value.clientId,pickerKey:value.pickerKey,project:value.project};
      status.textContent = "개인 자료 없이 연결설정만 인터넷 사이트로 전달합니다.";
      location.replace("https://chaeyoung25.github.io/personal-bible-study/#setup=" + encodeURIComponent(JSON.stringify(clean)));
    };
  };
})();
