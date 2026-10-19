'use strict';

/* ---------- Small helpers ---------- */

const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem('mathplay.' + key);
      return v === null ? fallback : JSON.parse(v);
    } catch (e) { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem('mathplay.' + key, JSON.stringify(value)); } catch (e) { /* ignore */ }
  }
};

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function shake(el) {
  el.classList.remove('shake');
  void el.offsetWidth; // restart the animation
  el.classList.add('shake');
}

const COLORS = ['#ff6b6b', '#ffa94d', '#fcc419', '#51cf66', '#339af0', '#845ef7', '#f06595', '#20c997'];

/* ---------- Math problems by age ---------- */

const LEVELS = {
  4: { ops: ['+'], max: 5 },
  5: { ops: ['+', '+', '−'], max: 10 },
  6: { ops: ['+', '−'], max: 20 },
  7: { ops: ['+', '−'], max: 50 },
  8: { ops: ['+', '−', '×'], max: 100, tables: [2, 3, 4, 5, 10], tmax: 10 },
  9: { ops: ['+', '−', '×', '÷'], max: 100, tables: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], tmax: 12 }
};

const OP_WORDS = { '+': 'plus', '−': 'minus', '×': 'times', '÷': 'divided by' };

function makeProblem(age) {
  const L = LEVELS[age];
  const op = pick(L.ops);
  let a, b, answer;
  switch (op) {
    case '+':
      answer = rand(2, L.max);
      a = rand(1, answer - 1);
      b = answer - a;
      break;
    case '−':
      a = rand(2, L.max);
      b = rand(1, a);
      answer = a - b;
      break;
    case '×':
      a = pick(L.tables);
      b = rand(1, L.tmax);
      if (Math.random() < 0.5) [a, b] = [b, a];
      answer = a * b;
      break;
    case '÷':
      b = pick(L.tables);
      answer = rand(1, L.tmax);
      a = b * answer;
      break;
  }
  return { a, b, op, answer, text: `${a} ${op} ${b}` };
}

function problemSpeech(p) {
  return `${p.a} ${OP_WORDS[p.op]} ${p.b}`;
}

// The answer plus some nearby wrong answers, shuffled.
function makeChoices(answer, n = 4) {
  const set = new Set([answer]);
  const spread = Math.max(3, Math.ceil(answer * 0.25));
  let guard = 0;
  while (set.size < n && guard++ < 200) {
    const v = answer + rand(-spread, spread);
    if (v >= 0) set.add(v);
  }
  let k = 1;
  while (set.size < n) set.add(answer + k++);
  return shuffle([...set]);
}

/* ---------- Sound (Web Audio, no files needed) ---------- */

const Sound = {
  muted: store.get('muted', false),
  ctx: null,
  ensure() {
    if (!this.ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (C) this.ctx = new C();
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },
  tone(freq, dur, type = 'sine', delay = 0, vol = 0.15, toFreq) {
    if (this.muted) return;
    const c = this.ensure();
    if (!c) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (toFreq) o.frequency.exponentialRampToValueAtTime(toFreq, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.05);
  },
  good() { [523, 659, 784].forEach((f, i) => this.tone(f, 0.16, 'triangle', i * 0.09)); },
  bad() { this.tone(260, 0.18, 'sine', 0, 0.12); this.tone(190, 0.28, 'sine', 0.13, 0.12); },
  pop() { this.tone(900, 0.12, 'square', 0, 0.08, 150); },
  hop() { this.tone(300, 0.15, 'sine', 0, 0.12, 700); },
  chomp() { this.tone(140, 0.08, 'square', 0, 0.1); this.tone(110, 0.1, 'square', 0.12, 0.1); },
  click(n = 0) { this.tone(420 + n * 30, 0.08, 'triangle', 0, 0.1); },
  win() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone(f, 0.18, 'triangle', i * 0.11)); }
};

/* ---------- Speech (reads problems to little ones) ---------- */

// Prefer the "Ava" voice (Microsoft Ava Natural in Edge, Ava on Mac/iPhone).
// Voices load in the background, so look again whenever the list changes.
let avaVoice = null;
function findAvaVoice() {
  if (!('speechSynthesis' in window)) return;
  const ava = speechSynthesis.getVoices().filter(v => /\bava\b/i.test(v.name));
  // The "Natural"/"Online"/"Premium" versions sound the most human.
  avaVoice = ava.find(v => /natural|online|premium|enhanced/i.test(v.name)) || ava[0] || null;
}
if ('speechSynthesis' in window) {
  findAvaVoice();
  speechSynthesis.addEventListener('voiceschanged', findAvaVoice);
}

function say(text, force = false) {
  if (!text || !('speechSynthesis' in window)) return;
  if (Sound.muted && !force) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  if (avaVoice) {
    u.voice = avaVoice;
    u.lang = avaVoice.lang;
    u.rate = 0.95;
    u.pitch = 1; // Ava already sounds friendly; raising pitch makes her sound odd
  } else {
    u.rate = 0.9;
    u.pitch = 1.2;
  }
  speechSynthesis.speak(u);
}

/* ---------- Confetti ---------- */

const Confetti = (() => {
  const cv = document.getElementById('confetti');
  const cx = cv.getContext('2d');
  let parts = [];
  let running = false;

  function resize() { cv.width = innerWidth; cv.height = innerHeight; }
  addEventListener('resize', resize);
  resize();

  function add(x, y, n, up) {
    for (let i = 0; i < n; i++) {
      parts.push({
        x, y,
        vx: (Math.random() - 0.5) * 10,
        vy: up ? -Math.random() * 10 - 3 : Math.random() * 3,
        s: rand(6, 11),
        c: pick(COLORS),
        r: Math.random() * 6,
        vr: (Math.random() - 0.5) * 0.4,
        life: rand(60, 110)
      });
    }
    if (!running) { running = true; requestAnimationFrame(tick); }
  }

  function tick() {
    cx.clearRect(0, 0, cv.width, cv.height);
    parts = parts.filter(p => p.life-- > 0 && p.y < cv.height + 20);
    for (const p of parts) {
      p.vy += 0.3;
      p.x += p.vx;
      p.y += p.vy;
      p.r += p.vr;
      cx.save();
      cx.translate(p.x, p.y);
      cx.rotate(p.r);
      cx.fillStyle = p.c;
      cx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
      cx.restore();
    }
    if (parts.length) requestAnimationFrame(tick);
    else { running = false; cx.clearRect(0, 0, cv.width, cv.height); }
  }

  return {
    burst(x = innerWidth / 2, y = innerHeight / 3, n = 30) { add(x, y, n, true); },
    rain() { for (let i = 0; i < 12; i++) add(Math.random() * innerWidth, -10, 12, false); }
  };
})();

/* ---------- Toast messages ---------- */

let toastTimer;
function toast(msg, ms = 1100) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

/* ---------- Shared multiple-choice buttons ---------- */

function renderAnswers(container, values, answer, onRight) {
  container.innerHTML = '';
  let done = false;
  values.forEach(v => {
    const b = document.createElement('button');
    b.className = 'ans-btn';
    b.textContent = v;
    b.addEventListener('click', () => {
      if (done) return;
      if (v === answer) {
        done = true;
        b.classList.add('right');
        const r = b.getBoundingClientRect();
        App.correct(r.left + r.width / 2, r.top + r.height / 2);
        if (onRight) onRight();
      } else {
        shake(b);
        b.classList.add('nope');
        b.disabled = true;
        App.wrong();
      }
    });
    container.appendChild(b);
  });
}

/* ---------- App state ---------- */

const STICKERS = ['🐶', '🐱', '🦊', '🐼', '🐨', '🦁', '🐯', '🐸', '🐵', '🦄', '🐲', '🦖',
  '🐙', '🦋', '🐢', '🐧', '🦉', '🐳', '🚀', '🌈', '🏆', '👑', '💎', '🌟'];
const STARS_PER_STICKER = 5;
const CHEERS = ['Great job!', 'Super!', 'You got it!', 'Awesome!', 'Wow!', 'Fantastic!', 'Math star!', 'Brilliant!'];
const OOPS = ['Oops! Try again', 'Almost!', 'Keep trying!', 'Not quite!'];

const App = {
  age: (() => { const a = Number(store.get('age', 6)); return a >= 4 && a <= 9 ? a : 6; })(),
  stars: Number(store.get('stars', 0)) || 0,
  games: [],
  current: null,
  session: 0,   // bumps every time a game opens/closes so stale timers do nothing
  sayText: '',

  register(game) { this.games.push(game); },

  setAge(a) { this.age = a; store.set('age', a); },

  // What the 🗣️ button reads. Little ones (4-5) hear it automatically.
  setSay(text) {
    this.sayText = text;
    if (this.age <= 5) say(text);
  },

  later(fn, ms) {
    const s = this.session;
    return setTimeout(() => { if (s === this.session) fn(); }, ms);
  },

  correct(x, y) {
    Sound.good();
    Confetti.burst(x, y, 28);
    this.stars++;
    store.set('stars', this.stars);
    this.updateStars();
    const earned = this.stars / STARS_PER_STICKER;
    if (Number.isInteger(earned) && earned <= STICKERS.length) {
      const sticker = STICKERS[earned - 1];
      setTimeout(() => {
        Sound.win();
        Confetti.rain();
        toast(`New sticker! ${sticker}`, 2200);
        say('You got a new sticker!');
      }, 400);
    } else {
      const cheer = pick(CHEERS);
      toast(cheer);
      if (this.age <= 5) say(cheer);
    }
  },

  wrong() {
    Sound.bad();
    toast(pick(OOPS));
  },

  updateStars() {
    document.querySelectorAll('[data-stars]').forEach(e => { e.textContent = this.stars; });
  }
};
