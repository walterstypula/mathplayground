'use strict';

// Join block buddies to make the target number.
// Too small? They stay joined so you can keep building (or undo).
// Too big? The tower wobbles apart and you lose a heart.
const BB_TARGET = { 4: [3, 5], 5: [4, 10], 6: [6, 10], 7: [10, 20], 8: [15, 30], 9: [20, 49] };

App.register({
  id: 'buddies',
  name: 'Block Buddies',
  icon: '🧱',
  color: '#d6336c',
  desc: 'Join the block buddies together to make the number!',

  start(stage) {
    stage.innerHTML = `
      <div class="fc-top">
        <div class="problem bb-goal" id="bbGoal"></div>
        <div class="pill" id="bbHearts"></div>
      </div>
      <div class="bb-play" id="bbPlay"></div>
      <div class="bb-bar"><button class="ans-btn bb-undo" id="bbUndo">↩ Split apart</button></div>
      <div class="hint">Tap two buddies to join them · Arrow keys + Space work too</div>`;
    this.goalEl = stage.querySelector('#bbGoal');
    this.heartsEl = stage.querySelector('#bbHearts');
    this.play = stage.querySelector('#bbPlay');
    this.undoBtn = stage.querySelector('#bbUndo');
    this.undoBtn.addEventListener('click', () => this.undo());
    this.sel = 0;

    this.onKey = (e) => {
      const k = e.key;
      if (k === ' ' || k === 'Enter') {
        e.preventDefault();
        if (!e.repeat) this.choose(this.sel);
      } else if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'a' || k === 'w') {
        e.preventDefault();
        this.sel = Math.max(0, this.sel - 1);
        this.render();
      } else if (k === 'ArrowRight' || k === 'ArrowDown' || k === 'd' || k === 's') {
        e.preventDefault();
        this.sel = Math.min(this.buddies.length - 1, this.sel + 1);
        this.render();
      } else if (k === 'Backspace' || k === 'u') {
        e.preventDefault();
        this.undo();
      }
    };
    addEventListener('keydown', this.onKey);
    this.onResize = () => { this.fitCubes(); this.render(); };
    addEventListener('resize', this.onResize);
    this.next();
  },

  stop() {
    removeEventListener('keydown', this.onKey);
    removeEventListener('resize', this.onResize);
  },

  next() {
    const age = App.age;
    const [lo, hi] = BB_TARGET[age];
    const N = rand(lo, hi);
    const a = rand(1, N - 1);
    this.target = N;
    this.solution = [a, N - a];
    this.hearts = 3;
    this.done = false;
    this.lock = false;
    this.picked = null;
    this.history = [];
    this.sel = 0;

    // the answer pair plus some other buddies (all smaller than the target)
    const vals = [a, N - a];
    const narrow = this.play.clientWidth < 500; // phones: one fewer, so big towers fit
    const count = age === 4 ? 4 : age <= 6 ? 5 : narrow ? 5 : 6;
    while (vals.length < count) vals.push(rand(1, N - 1));
    this.buddies = shuffle(vals).map(v => ({ parts: [[v, buddyColor(v)]], total: v }));

    this.fitCubes();
    this.goalEl.textContent = `Make ${N}!`;
    App.setSay(`Make ${N}! Join two buddies together.`);
    this.render();
  },

  // Make the cubes as big as the playground allows. Try the buddies in 1, 2
  // or 3 rows (narrow phones do better with more rows) and keep the biggest
  // size where the finished tower still fits.
  fitCubes() {
    this.play.innerHTML = ''; // measure the space, not the old buddies
    const W = this.play.clientWidth - 32;
    const H = this.play.clientHeight - 32;
    const tall = Math.min(10, this.target);                              // the finished tower
    const tallestNow = Math.min(10, Math.max(...this.buddies.map(b => b.total)));
    const columns = this.buddies.reduce((s, b) => s + Math.ceil(b.total / 10), 0);
    const n = this.buddies.length;
    let best = 0;
    for (let rows = 1; rows <= 3; rows++) {
      const byHeight = (H - rows * 74) / (tall + (rows - 1) * tallestNow) - 2; // 74 = label + gaps per row
      const byWidth = (W - Math.ceil(n / rows) * 40) / Math.ceil(columns / rows) - 3;
      best = Math.max(best, Math.min(byHeight, byWidth));
    }
    const c = Math.max(12, Math.min(90, Math.floor(best)));
    this.play.style.setProperty('--cube', `${c}px`);
  },

  render(effect) {
    this.play.innerHTML = '';
    this.buddies.forEach((b, i) => {
      const btn = document.createElement('button');
      btn.className = 'bb-btn' + (this.picked === i ? ' picked' : '') + (this.sel === i ? ' aimed' : '');
      if (effect && effect.index === i) btn.classList.add(effect.cls);
      btn.appendChild(buddyEl(b.parts));
      btn.addEventListener('click', () => { this.sel = i; this.choose(i); });
      this.play.appendChild(btn);
    });
    this.heartsEl.textContent = heartsText(this.hearts);
    this.undoBtn.disabled = !this.history.length || this.done;
  },

  choose(i) {
    if (this.done || this.lock || !this.buddies[i]) return;
    if (this.picked === null) {
      this.picked = i;
      Sound.click(2);
      if (App.age <= 6) say(String(this.buddies[i].total));
      this.render();
      return;
    }
    if (this.picked === i) { this.picked = null; this.render(); return; } // tap again to put down

    const a = this.buddies[this.picked], b = this.buddies[i];
    const total = a.total + b.total;
    const before = this.buddies.slice();
    const lo = Math.min(this.picked, i), hi = Math.max(this.picked, i);
    const joined = { parts: [...a.parts, ...b.parts], total };
    this.buddies = this.buddies.filter((_, k) => k !== hi);
    this.buddies[lo] = joined;
    this.picked = null;
    this.sel = lo;
    const sum = `${a.total} + ${b.total} = ${total}`;

    if (total === this.target) {
      this.done = true;
      this.render({ index: lo, cls: 'join' });
      this.goalEl.textContent = `${sum} 🎉`;
      const r = this.play.children[lo].getBoundingClientRect();
      App.correct(r.left + r.width / 2, r.top + r.height / 3);
      App.later(() => this.next(), 2000);
    } else if (total > this.target) {
      // Too big: wobble, then split back apart and lose a heart.
      this.lock = true;
      this.hearts--;
      this.render({ index: lo, cls: 'wobble' });
      Sound.bad();
      toast(`${sum}. Too big! We need ${this.target}`, 2000);
      App.later(() => {
        this.buddies = before;
        this.lock = false;
        this.render();
        if (this.hearts <= 0) this.reveal();
      }, 1000);
    } else {
      // Not there yet: stay joined and keep building.
      this.history.push(before);
      this.render({ index: lo, cls: 'join' });
      Sound.tone(520, 0.15, 'triangle', 0, 0.1, 700);
      toast(App.age <= 6 ? `${sum}. ${this.target - total} more!` : `${sum}. Keep going!`, 1600);
    }
  },

  // Out of hearts: show a way to do it, then move on (no star).
  reveal() {
    this.done = true;
    const [a, b] = this.solution;
    this.goalEl.textContent = `${a} + ${b} = ${this.target}`;
    toast(`Here's one way: ${a} + ${b} = ${this.target}`, 2400);
    say(`${a} plus ${b} makes ${this.target}`);
    this.buddies = [{ parts: [[a, buddyColor(a)], [b, buddyColor(b)]], total: this.target }];
    this.sel = 0;
    this.render({ index: 0, cls: 'join' });
    App.later(() => this.next(), 3000);
  },

  undo() {
    if (this.lock || this.done || !this.history.length) return;
    this.buddies = this.history.pop();
    this.picked = null;
    this.sel = Math.min(this.sel, this.buddies.length - 1);
    Sound.click();
    this.render();
  }
});
