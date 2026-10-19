'use strict';

// Classic memory: flip two cards at a time and find the pairs.
// Each pair is a problem and its answer (age 4 matches dots to numbers).
App.register({
  id: 'memory',
  name: 'Memory Match',
  icon: '🃏',
  color: '#e8590c',
  desc: 'Flip the cards and match each problem to its answer!',

  start(stage) {
    stage.innerHTML = `
      <div class="prompt">Find the pairs that match!</div>
      <div class="mm-grid" id="mmGrid"></div>
      <div class="mm-foot"><div class="pill" id="mmInfo"></div></div>`;
    this.grid = stage.querySelector('#mmGrid');
    this.info = stage.querySelector('#mmInfo');
    this.newBoard();
  },

  stop() {},

  makePairs() {
    const age = App.age;
    const n = age === 4 ? 4 : age <= 6 ? 6 : 8;
    const pairs = [];
    const used = new Set();
    for (let guard = 0; pairs.length < n && guard < 500; guard++) {
      if (age === 4) {
        const v = rand(1, 6);
        if (used.has(v)) continue;
        used.add(v);
        pairs.push([{ dots: v, say: String(v) }, { text: String(v), say: String(v) }]);
      } else {
        const p = makeProblem(age);
        if (used.has(p.answer)) continue; // every answer different, so only one match
        used.add(p.answer);
        pairs.push([{ text: p.text, say: problemSpeech(p) }, { text: String(p.answer), say: String(p.answer) }]);
      }
    }
    return pairs;
  },

  newBoard() {
    this.first = null;
    this.lock = false;
    this.tries = 0;
    this.found = 0;
    const pairs = this.makePairs();
    this.total = pairs.length;
    const cards = shuffle(pairs.flatMap((pair, id) => pair.map(face => ({ ...face, id }))));

    this.grid.innerHTML = '';
    cards.forEach(c => {
      const el = document.createElement('button');
      el.className = 'mm-card';
      const face = c.dots
        ? `<div class="mm-dots">${'<i></i>'.repeat(c.dots)}</div>`
        : `<span class="${c.text.length > 3 ? 'mm-prob' : 'mm-num'}">${c.text}</span>`;
      el.innerHTML = `<div class="mm-inner"><div class="mm-face mm-front">?</div><div class="mm-face mm-back">${face}</div></div>`;
      el.addEventListener('click', () => this.flip(c, el));
      this.grid.appendChild(el);
    });
    this.updateInfo();
    App.setSay('Find the pairs that match!');
  },

  updateInfo() {
    this.info.textContent = `Pairs ${this.found}/${this.total} · Tries ${this.tries}`;
  },

  flip(c, el) {
    if (this.lock || c.up || c.matched) return;
    c.up = true;
    el.classList.add('flipped');
    Sound.click(2);
    if (App.age <= 6) say(c.say);

    if (!this.first) { this.first = { c, el }; return; }
    const a = this.first;
    this.first = null;
    this.tries++;

    if (a.c.id === c.id) {
      a.c.matched = c.matched = true;
      a.el.classList.add('matched');
      el.classList.add('matched');
      this.found++;
      const r = el.getBoundingClientRect();
      App.correct(r.left + r.width / 2, r.top + r.height / 2);
      if (this.found === this.total) {
        App.later(() => {
          Sound.win();
          Confetti.rain();
          toast(`All pairs found in ${this.tries} tries! 🎉`, 2200);
        }, 700);
        App.later(() => this.newBoard(), 3000);
      }
    } else {
      // Not a pair: have a good look, then they flip back over.
      this.lock = true;
      App.later(() => {
        Sound.tone(300, 0.15, 'sine', 0, 0.1);
        a.c.up = c.up = false;
        a.el.classList.remove('flipped');
        el.classList.remove('flipped');
        this.lock = false;
      }, 1100);
    }
    this.updateInfo();
  }
});
