'use strict';

(function () {
  const $ = (s) => document.querySelector(s);
  const menu = $('#menu');
  const game = $('#game');
  const stage = $('#stage');

  function show(screen) {
    [menu, game].forEach(s => s.classList.toggle('active', s === screen));
    window.scrollTo(0, 0);
  }

  function renderAges() {
    const box = $('#ages');
    box.innerHTML = '';
    for (let a = 4; a <= 9; a++) {
      const b = document.createElement('button');
      b.className = 'age-btn' + (a === App.age ? ' on' : '');
      b.textContent = a;
      b.setAttribute('aria-label', `I am ${a}`);
      b.addEventListener('click', () => {
        App.setAge(a);
        Sound.click(a);
        renderAges();
      });
      box.appendChild(b);
    }
  }

  function renderGames() {
    const box = $('#gameList');
    box.innerHTML = '';
    App.games.forEach(g => {
      const card = document.createElement('button');
      card.className = 'game-card';
      card.style.setProperty('--c', g.color);
      card.innerHTML = `<span class="gi">${g.icon}</span><span class="gn">${g.name}</span><span class="gd">${g.desc}</span>`;
      card.addEventListener('click', () => openGame(g));
      box.appendChild(card);
    });
  }

  function renderStickers() {
    const have = Math.min(STICKERS.length, Math.floor(App.stars / STARS_PER_STICKER));
    $('#stickers').innerHTML = STICKERS
      .map((s, i) => `<div class="sticker${i < have ? '' : ' locked'}">${i < have ? s : '❔'}</div>`)
      .join('');
    const left = STARS_PER_STICKER - (App.stars % STARS_PER_STICKER);
    $('#stickerHint').textContent = have >= STICKERS.length
      ? 'You collected every sticker! 🎉'
      : `Get ${left} more ⭐ for your next sticker!`;
  }

  function openGame(g) {
    Sound.ensure();
    App.session++;
    App.current = g;
    $('#gameTitle').textContent = `${g.icon} ${g.name}`;
    stage.innerHTML = '';
    stage.className = 'stage stage-' + g.id;
    show(game); // show first so games can measure their layout
    g.start(stage);
    try { history.pushState({ game: g.id }, ''); } catch (e) { /* ignore */ }
  }

  function closeGame() {
    if (!App.current) return;
    App.current.stop();
    App.current = null;
    App.session++;
    App.sayText = '';
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    stage.innerHTML = '';
    show(menu);
    renderStickers();
  }

  // Our own back button closes right away; the phone/browser back button closes via popstate.
  let ignorePop = false;
  $('#backBtn').addEventListener('click', () => {
    closeGame();
    if (history.state && history.state.game) { ignorePop = true; history.back(); }
  });
  addEventListener('popstate', () => {
    if (ignorePop) { ignorePop = false; return; }
    closeGame();
  });
  addEventListener('keydown', e => { if (e.key === 'Escape' && App.current) $('#backBtn').click(); });

  $('#sayBtn').addEventListener('click', () => say(App.sayText, true));

  const muteBtn = $('#muteBtn');
  function renderMute() { muteBtn.textContent = Sound.muted ? '🔇' : '🔊'; }
  muteBtn.addEventListener('click', () => {
    Sound.muted = !Sound.muted;
    store.set('muted', Sound.muted);
    if (Sound.muted && 'speechSynthesis' in window) speechSynthesis.cancel();
    renderMute();
    Sound.click();
  });

  // A reload mid-game leaves a stale "in game" history entry; we always start on the menu.
  try { if (history.state && history.state.game) history.replaceState(null, ''); } catch (e) { /* ignore */ }

  renderMute();
  renderAges();
  renderGames();
  renderStickers();
  App.updateStars();
})();
