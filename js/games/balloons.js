'use strict';

// Inspired by Number Munchers: a sky full of balloons and one rule.
// Pop EVERY balloon that fits the rule — but leave the others alone!

const BM_GRID = { 4: [3, 3], 5: [4, 3], 6: [4, 3], 7: [5, 3], 8: [4, 4], 9: [5, 4] }; // [columns, rows]

// A random number from lo..hi that is not "bad".
function bmOther(lo, hi, bad) {
  let v;
  do { v = rand(lo, hi); } while (bad(v));
  return v;
}

const bmNum = (v) => ({ label: String(v), value: v });

// A little math problem whose answer is v.
function bmExpr(v, ops) {
  const options = ops.filter(op => op !== '×' || bmTimesPairs(v).length);
  const op = pick(options.length ? options : ['+']);
  let a, b;
  switch (op) {
    case '+': a = rand(0, v); b = v - a; break;
    case '−': b = rand(1, 9); a = v + b; break;
    case '×': [a, b] = pick(bmTimesPairs(v)); break;
    case '÷': b = rand(2, 9); a = v * b; break;
  }
  return { label: `${a} ${op} ${b}`, value: v, expr: true };
}

function bmTimesPairs(v) {
  const pairs = [];
  for (let a = 1; a <= 12; a++) if (v > 0 && v % a === 0 && v / a <= 12) pairs.push([a, v / a]);
  return pairs;
}

function bmDivisors(n) {
  const d = [];
  for (let i = 1; i <= n; i++) if (n % i === 0) d.push(i);
  return d;
}

// Each rule makes balloons that fit (ok = true) or don't fit (ok = false).
const BM_RULES = {
  equals: (n, lo, hi) => ({
    text: `Pop all the ${n}s!`,
    make: ok => bmNum(ok ? n : bmOther(lo, hi, v => v === n))
  }),
  bigger: (n, lo, hi) => ({
    text: `Pop numbers BIGGER than ${n}`,
    make: ok => bmNum(ok ? rand(n + 1, hi) : rand(lo, n))
  }),
  smaller: (n, lo, hi) => ({
    text: `Pop numbers SMALLER than ${n}`,
    make: ok => bmNum(ok ? rand(lo, n - 1) : rand(n, hi))
  }),
  parity: (even, max) => ({
    text: `Pop the ${even ? 'EVEN' : 'ODD'} numbers`,
    make: ok => {
      const wantEven = even === ok;
      return bmNum(bmOther(1, max, v => (v % 2 === 0) !== wantEven));
    }
  }),
  multiples: (k, max, text) => ({
    text: text || `Pop the multiples of ${k}`,
    make: ok => bmNum(ok ? k * rand(1, Math.floor(max / k)) : bmOther(1, max, v => v % k === 0))
  }),
  factors: (n) => ({
    text: `Pop the factors of ${n}`,
    make: ok => bmNum(ok ? pick(bmDivisors(n)) : bmOther(2, n, v => n % v === 0))
  }),
  makes: (t, ops) => ({
    text: `Pop the balloons that make ${t}`,
    make: ok => bmExpr(ok ? t : bmOther(Math.max(0, t - 4), t + 4, v => v === t), ops)
  })
};

function bmPickRule(age) {
  const R = BM_RULES;
  const choices = {
    4: [() => R.equals(rand(1, 5), 1, 5), () => R.bigger(rand(2, 3), 1, 5)],
    5: [() => R.equals(rand(1, 10), 1, 10), () => R.bigger(rand(3, 7), 1, 10),
        () => R.smaller(rand(4, 8), 1, 10), () => R.makes(rand(4, 10), ['+'])],
    6: [() => R.parity(true, 20), () => R.parity(false, 20),
        () => R.makes(rand(6, 15), ['+', '−']), () => R.bigger(rand(8, 14), 1, 20)],
    7: [() => R.parity(Math.random() < 0.5, 50),
        () => R.multiples(2, 30, 'Pop the numbers you say counting by 2s'),
        () => R.multiples(5, 50, 'Pop the numbers you say counting by 5s'),
        () => R.multiples(10, 100, 'Pop the numbers you say counting by 10s'),
        () => R.makes(rand(10, 20), ['+', '−'])],
    8: [() => R.multiples(pick([2, 3, 4, 5, 10]), 50),
        () => R.makes(pick([12, 16, 18, 20, 24, 30]), ['+', '−', '×'])],
    9: [() => R.multiples(rand(3, 9), 100),
        () => R.factors(pick([12, 18, 20, 24, 30, 36, 48])),
        () => R.makes(rand(4, 12), ['×', '÷'])]
  };
  return pick(choices[age])();
}

App.register({
  id: 'balloons',
  name: 'Balloon Pop',
  icon: '🎈',
  color: '#f06595',
  desc: 'Pop EVERY balloon that matches the rule!',

  start(stage) {
    stage.innerHTML = `
      <div class="bm-top">
        <div class="pill" id="bmRound"></div>
        <div class="bm-rule" id="bmRule"></div>
        <div class="pill" id="bmLeft"></div>
      </div>
      <div class="bm-grid" id="bmGrid"></div>`;
    this.roundEl = stage.querySelector('#bmRound');
    this.ruleEl = stage.querySelector('#bmRule');
    this.leftEl = stage.querySelector('#bmLeft');
    this.grid = stage.querySelector('#bmGrid');
    stage.insertAdjacentHTML('beforeend', '<div class="hint">Arrow keys move the pin · Space or Enter pops · or just tap</div>');
    this.round = 0;
    this.sel = 0;
    this.setupKeys();
    this.onResize = () => this.placeHand();
    addEventListener('resize', this.onResize);
    this.newRound();
  },

  stop() {
    removeEventListener('keydown', this.onKey);
    removeEventListener('resize', this.onResize);
  },

  // A hand holding a pin hops from balloon to balloon with the arrow keys.
  setupKeys() {
    const moves = {
      ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
      a: [-1, 0], d: [1, 0], w: [0, -1], s: [0, 1]
    };
    this.onKey = (e) => {
      const name = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (name === ' ' || name === 'Enter') {
        e.preventDefault();
        if (e.repeat) return;
        const it = this.items[this.sel];
        this.poke();
        this.tap(it, it.el);
        return;
      }
      const m = moves[name];
      if (!m) return;
      e.preventDefault();
      const cols = this.renderedCols();
      const n = this.items.length;
      const rows = Math.ceil(n / cols);
      const r = Math.max(0, Math.min(rows - 1, Math.floor(this.sel / cols) + m[1]));
      const c = Math.max(0, Math.min(cols - 1, (this.sel % cols) + m[0]));
      this.sel = Math.min(n - 1, r * cols + c);
      this.placeHand();
    };
    addEventListener('keydown', this.onKey);
  },

  // Columns as actually shown (phones squeeze the grid to fewer columns).
  renderedCols() {
    const top = this.items[0].el.offsetTop;
    return this.items.filter(o => o.el.offsetTop === top).length;
  },

  placeHand() {
    const it = this.items && this.items[this.sel];
    if (!it || !this.hand) return;
    this.items.forEach(o => o.el.classList.toggle('aimed', o === it));
    const el = it.el;
    // the pin's point touches the balloon's lower right, clear of the number
    const x = el.offsetLeft + el.offsetWidth * 0.74;
    const y = el.offsetTop + el.offsetWidth * 0.8;
    this.hand.style.transform = `translate(${x}px, ${y}px)`;
  },

  poke() {
    this.hand.classList.remove('poke');
    void this.hand.offsetWidth;
    this.hand.classList.add('poke');
  },

  newRound() {
    this.round++;
    this.misses = 0;
    this.done = false;
    const age = App.age;
    const [cols, rows] = BM_GRID[age];
    const rule = bmPickRule(age);
    const nOk = age <= 5 ? rand(3, 4) : rand(4, 6);

    // Build the balloons, avoiding repeated problems when we can.
    const items = [];
    const seen = new Set();
    const add = (ok) => {
      for (let t = 0; t < 30; t++) {
        const it = rule.make(ok);
        if (!seen.has(it.label) || t === 29) {
          seen.add(it.label);
          items.push({ ...it, ok });
          return;
        }
      }
    };
    for (let i = 0; i < nOk; i++) add(true);
    while (items.length < cols * rows) add(false);
    shuffle(items);

    this.items = items;
    this.left = nOk;
    this.roundEl.textContent = `Round ${this.round}`;
    this.ruleEl.textContent = rule.text;
    this.updateLeft();
    App.setSay(rule.text);

    this.grid.style.setProperty('--cols', cols);
    this.grid.innerHTML = '';
    const colors = shuffle(COLORS.slice());
    items.forEach((it, i) => {
      const el = document.createElement('button');
      el.className = 'mballoon';
      el.style.setProperty('--c', colors[i % colors.length]);
      el.style.setProperty('--d', `${(-Math.random() * 2.6).toFixed(2)}s`);
      const text = it.label.replace(/ /g, ''); // "40÷5" fits bigger than "40 ÷ 5"
      const size = text.length > 4 ? ' longer' : text.length > 2 ? ' long' : '';
      el.innerHTML = `<div class="bal-body${size}">${text}</div>`;
      el.addEventListener('pointerdown', e => {
        e.preventDefault();
        this.sel = i; // the hand follows taps too
        this.placeHand();
        this.tap(it, el);
      });
      it.el = el;
      this.grid.appendChild(el);
    });

    this.hand = document.createElement('div');
    this.hand.className = 'bm-hand';
    this.hand.innerHTML = '<div class="bm-hand-inner"><span class="pin">📌</span><span class="fist">✊</span></div>';
    this.grid.appendChild(this.hand);
    this.sel = Math.min(this.sel, items.length - 1);
    this.placeHand();
  },

  updateLeft() {
    this.leftEl.textContent = `🎈 ${this.left} to go`;
  },

  tap(it, el) {
    if (this.done || it.popped) return;
    if (it.ok) {
      it.popped = true;
      el.classList.add('pop');
      Sound.pop();
      const r = el.getBoundingClientRect();
      Confetti.burst(r.left + r.width / 2, r.top + r.width / 2, 12);
      this.left--;
      this.updateLeft();
      if (this.left === 0) this.roundDone();
    } else {
      shake(el);
      Sound.bad();
      // For problems, show the answer so kids learn why it didn't fit.
      toast(it.expr ? `${it.label} = ${it.value}` : pick(OOPS), 1400);
      this.misses++;
      if (this.misses >= 3) {
        this.items.forEach(o => { if (o.ok && !o.popped) o.el.classList.add('hint'); });
      }
    }
  },

  roundDone() {
    this.done = true;
    this.ruleEl.textContent = 'You popped them all!';
    App.later(() => {
      this.items.forEach(o => { if (!o.popped) o.el.classList.add('away'); });
      const r = this.grid.getBoundingClientRect();
      App.correct(r.left + r.width / 2, r.top + r.height / 3);
    }, 300);
    App.later(() => this.newRound(), 2000);
  }
});
