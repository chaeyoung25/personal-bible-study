(() => {
  function resolve(text, books) {
    const match=String(text).normalize('NFKC').replace(/\s/g,'').match(/^(.+?)(\d+)(?:장)?(?:(?::)(\d+)(?:절)?)?$/);
    if(!match)return null;
    const [,name,chapter,verse]=match;
    let candidates=books.filter(b=>b.name===name||b.short===name);
    if(!candidates.length&&name.length>=2)candidates=books.filter(b=>b.name.startsWith(name));
    if(candidates.length!==1)return null;
    const book=candidates[0];
    if(+chapter<1||+chapter>book.chapters||verse!==undefined&&+verse<1)return null;
    return {book:book.id,chapter:+chapter,verse:verse===undefined?null:+verse};
  }
  window.BibleReferenceJump={resolve};
  async function jump(input, pane, message) {
    const ref=resolve(input.value,state.library.books);
    if(!ref){message.textContent='성경 이름과 장·절을 확인해 주세요.';input.setAttribute('aria-invalid','true');return;}
    input.removeAttribute('aria-invalid');message.textContent='';
    activatePassagePane(pane);
    state.book=ref.book;state.chapter=ref.chapter;
    try {
      await loadPassage(ref.verse);
      if(ref.verse){
        const row=pane.grid.querySelector(`[data-verse="${ref.verse}"]`);
        if(row)row.scrollIntoView({block:'center',inline:'nearest'});
        else message.textContent='해당 장에 없는 절입니다.';
      }
    } catch(error){message.textContent=error.message||'본문을 불러오지 못했습니다.';}
  }
  const original=createPassagePane;
  createPassagePane=function(...args){
    const pane=original(...args);
    // The original factory returns the created pane.
    const target=pane||state.panes[state.panes.length-1];
    const form=document.createElement('form');form.className='reference-jump';
    const input=document.createElement('input');input.type='text';input.placeholder='창1 · 요한복 1:1';input.setAttribute('aria-label','본문 창 구절 바로 이동');input.autocomplete='off';input.enterKeyHint='go';input.addEventListener('keydown',event=>{if(event.key==='Enter'&&(event.isComposing||event.keyCode===229))event.preventDefault();});
    const button=document.createElement('button');button.type='submit';button.textContent='이동';
    const message=document.createElement('span');message.className='reference-jump-message';message.setAttribute('role','status');
    form.append(input,button,message);
    form.onsubmit=event=>{event.preventDefault();if(event.isComposing)return;jump(input,target,message);};
    target.element.querySelector('.pane-controls').append(form);
    return pane;
  };
})();
