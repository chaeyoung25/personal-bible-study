(() => {
  const desktop = matchMedia('(min-width: 1101px)');
  const key = 'desktop-panel-layout-v1';
  let saved = {};
  try { saved = JSON.parse(BrowserBible.settings.getItem(key) || '{}') || {}; } catch {}
  const panels = [['navigation', '왼쪽 메뉴', 'navigationPanel'], ['study', '오른쪽 연구 패널', 'studyPanel']];
  const buttons = [];
  for (const [name, label, id] of panels) {
    const panel = document.getElementById(id);
    const heading = document.createElement('div');
    heading.className = 'panel-collapse-heading';
    const button = document.createElement('button');
    const reopen = document.createElement('button');
    button.className = 'panel-collapse-button';
    reopen.className = `panel-reopen-button panel-reopen-${name}`;
    for (const control of [button, reopen]) {
      control.type = 'button'; control.setAttribute('aria-controls', id);
      control.onclick = () => {
        saved[name] = !saved[name];
        try { BrowserBible.settings.setItem(key, JSON.stringify(saved)); } catch {}
        apply();
        (saved[name] ? reopen : button).focus({preventScroll:true});
      };
    }
    heading.append(button); panel.prepend(heading); document.body.append(reopen);
    buttons.push({button, reopen});
  }
  function apply() {
    panels.forEach(([name, label, id], index) => {
      const hidden = saved[name] === true;
      document.body.classList.toggle(`hide-${name}-panel`, hidden);
      const {button, reopen} = buttons[index];
      button.textContent = name === 'navigation' ? '‹' : '›';
      reopen.textContent = name === 'navigation' ? '›' : '‹';
      button.setAttribute('aria-label', `${label} 숨기기`);
      reopen.setAttribute('aria-label', `${label} 펼치기`);
      button.title = `${label} 접기`; reopen.title = `${label} 펼치기`;
      button.setAttribute('aria-expanded', String(!hidden));
      reopen.setAttribute('aria-expanded', String(!hidden));
      reopen.hidden = !hidden;
      if (desktop.matches) document.getElementById(id).inert = hidden;
    });
  }
  // Existing responsive drawers own compact-screen focus and visibility.
  desktop.addEventListener('change', () => queueMicrotask(apply));
  apply();
})();
