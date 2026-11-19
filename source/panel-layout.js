(() => {
  const desktop = matchMedia('(min-width: 1101px)');
  const key = 'desktop-panel-layout-v1';
  let saved = {};
  try { saved = JSON.parse(BrowserBible.settings.getItem(key) || '{}') || {}; } catch {}
  const panels = [['navigation', '왼쪽 메뉴', 'navigationPanel'], ['study', '오른쪽 연구 패널', 'studyPanel']];
  const controls = document.createElement('div');
  controls.className = 'desktop-panel-controls';
  controls.setAttribute('role', 'group');
  controls.setAttribute('aria-label', '좌우 패널 표시');
  for (const [name, label, id] of panels) {
    const button = document.createElement('button');
    button.type = 'button'; button.setAttribute('aria-controls', id);
    button.onclick = () => {
      saved[name] = !saved[name];
      try { BrowserBible.settings.setItem(key, JSON.stringify(saved)); } catch {}
      apply();
    };
    controls.append(button);
  }
  document.querySelector('.topbar').prepend(controls);
  function apply() {
    panels.forEach(([name, label, id], index) => {
      const hidden = saved[name] === true;
      document.body.classList.toggle(`hide-${name}-panel`, hidden);
      const button = controls.children[index];
      button.textContent = `${name === 'navigation' ? '☰ 메뉴' : '☷ 연구'} ${hidden ? '펼치기' : '숨기기'}`;
      button.setAttribute('aria-label', `${label} ${hidden ? '펼치기' : '숨기기'}`);
      button.setAttribute('aria-expanded', String(!hidden));
      if (desktop.matches) document.getElementById(id).inert = hidden;
    });
  }
  // Existing responsive drawers own compact-screen focus and visibility.
  desktop.addEventListener('change', () => queueMicrotask(apply));
  apply();
})();
