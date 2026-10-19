'use strict';

// Snake, kid style. Eat the numbers in order (or the answer to a problem)
// and your tail spells out everything you ate: 2 · 4 · 6 · 8...
// Little ones (4-6) wrap around the edges. Nothing ever ends the game.
const SNAKE_COLS = { 4: 9, 5: 10, 6: 11, 7: 12, 8: 13, 9: 14 };
const SNAKE_THEMES = [
  { name: 'Meadow', a: '#b2f2bb', b: '#a3e9ad', rock: '🪨' },
  { name: 'Desert', a: '#ffec99', b: '#ffe384', rock: '🌵' },
  { name: 'Ocean', a: '#a5d8ff', b: '#96cffa', rock: '🐚' },
  { name: 'Snowland', a: '#f1f3f5', b: '#e3e7eb', rock: '⛄' },
  { name: 'Jungle', a: '#8ce99a', b: '#7ddd8c', rock: '🌴' }
];
const SNAKE_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const SNAKE_FOOD_COLORS = ['#ff6b6b', '#ffa94d', '#845ef7', '#339af0', '#f06595', '#20c997'];

App.register({
  id: 'snake',
  name: 'Number Snake',
  icon: '🐍',
  color: '#f59f00',
  desc: 'Eat the numbers in order and watch your tail grow!',

  start(stage) {
    stage.innerHTML = `
      <div class="fc-top">
        <div class="problem sn-prompt" id="snQ"></div>
        <div class="pill" id="snLevel"></div>
      </div>
      <div class="fc-wrap sn-wrap"><canvas id="snCv"></canvas></div>
      <div class="hint">Swipe, tap where to turn, or use the arrow keys</div>`;
    this.q = stage.querySelector('#snQ');
    this.levelEl = stage.querySelector('#snLevel');
    this.wrap = stage.querySelector('.sn-wrap');
    this.cv = stage.querySelector('#snCv');
    this.cx = this.cv.getContext('2d');

    const age = App.age;
    this.wrapEdges = age <= 6;               // little ones go off one side, come back the other
    this.baseSpeed = 3 + 0.5 * (age - 4);    // cells per second
    this.perLevel = age <= 5 ? 6 : 8;        // numbers to eat per level
    this.level = 1;
    this.t = 0;

    this.setupInput();
    this.body = null; // forget any board from a previous visit
    this.layout();

    this.running = true;
    this.last = performance.now();
    const loop = (t) => {
      if (!this.running) return;
      const dt = Math.max(0, Math.min(50, t - this.last)) / 1000;
      this.last = t;
      this.update(dt);
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  },

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    removeEventListener('keydown', this.onKey);
  },

  get theme() {
    return SNAKE_THEMES[(this.level - 1) % SNAKE_THEMES.length];
  },

  /* ---------- board ---------- */

  // Match the canvas to its box whenever the box changes size. The board keeps
  // its squares once a level starts and is just rescaled; new levels re-pick.
  layout() {
    const r = this.wrap.getBoundingClientRect();
    const d = window.devicePixelRatio || 1;
    this.W = r.width;
    this.H = r.height;
    this.boxW = this.wrap.clientWidth;
    this.boxH = this.wrap.clientHeight;
    this.cv.width = r.width * d;
    this.cv.height = r.height * d;
    this.cx.setTransform(d, 0, 0, d, 0, 0);
    if (!this.body) this.newBoard();
    else this.fitBoard();
  },

  pickBoardSize() {
    // fewer, bigger squares on narrow screens so numbers stay readable
    this.cols = Math.max(8, Math.min(SNAKE_COLS[App.age], Math.floor(this.W / 34)));
    const C = Math.floor(Math.min(this.W / this.cols, this.H / 8));
    this.rows = Math.floor(this.H / C);
  },

  fitBoard() {
    this.C = Math.floor(Math.min(this.W / this.cols, this.H / this.rows));
    this.offX = (this.W - this.cols * this.C) / 2;
    this.offY = (this.H - this.rows * this.C) / 2;
  },

  newBoard() {
    this.pickBoardSize();
    this.fitBoard();
    const cx = Math.floor(this.cols / 2), cy = Math.floor(this.rows / 2);
    this.body = [[cx, cy], [cx - 1, cy], [cx - 2, cy]];
    this.prev = this.body.map(c => c.slice());
    this.labels = [null, null, null];  // labels[i] is written on segment i (0 = head)
    this.dir = [1, 0];
    this.queue = [];
    this.acc = 0;
    this.stun = 0;
    this.paused = false;
    this.levelEats = 0;
    this.speed = this.baseSpeed + Math.min(1.5, 0.3 * (this.level - 1));
    this.wrap.style.background = this.theme.a;
    this.placeRocks(cy);
    this.setupLevel();
    this.newQuestion();
  },

  // A few obstacles from level 2 on — never sealing off any part of the board.
  placeRocks(snakeRow) {
    const count = Math.min(8, 2 * (this.level - 1));
    for (let attempt = 0; attempt < 30; attempt++) {
      this.rocks = new Set();
      while (this.rocks.size < count) {
        const x = rand(0, this.cols - 1), y = rand(0, this.rows - 1);
        if (Math.abs(y - snakeRow) > 1) this.rocks.add(x + ',' + y);
      }
      if (this.allConnected()) return;
    }
    this.rocks = new Set();
  },

  allConnected() {
    const free = [];
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) if (!this.rocks.has(x + ',' + y)) free.push([x, y]);
    }
    const seen = new Set([free[0].join(',')]);
    const queue = [free[0]];
    while (queue.length) {
      const [x, y] = queue.shift();
      for (const d of SNAKE_DIRS) {
        const n = this.stepFrom([x, y], d);
        if (n && !this.rocks.has(n.join(',')) && !seen.has(n.join(','))) { seen.add(n.join(',')); queue.push(n); }
      }
    }
    return seen.size === free.length;
  },

  // The cell one step away, wrapping for little ones; null if off the board.
  stepFrom([x, y], [dx, dy]) {
    let nx = x + dx, ny = y + dy;
    if (this.wrapEdges) {
      nx = (nx + this.cols) % this.cols;
      ny = (ny + this.rows) % this.rows;
    } else if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) {
      return null;
    }
    return [nx, ny];
  },

  /* ---------- what to eat ---------- */

  // Each level is either counting (by 1s, 2s, 5s...) or answering problems.
  setupLevel() {
    const age = App.age, L = this.level;
    let mode = 'count', step = 1, start = 1;
    if (age === 5) start = 1 + (L - 1) * this.perLevel; // keep counting up, level after level
    else if (age === 6) { step = L % 2 ? 1 : 2; start = step === 1 ? rand(1, 10) : 2; }
    else if (age === 7) { step = pick([2, 5, 10]); start = step; }
    else if (age === 8) {
      if (L % 2 === 0) mode = 'answer';
      else { step = pick([3, 4, 5]); start = step; }
    } else if (age === 9) {
      if (L % 3 === 0) { step = pick([6, 7, 8, 9]); start = step; }
      else mode = 'answer';
    }
    this.mode = mode;
    this.step = step;
    this.nextVal = start;
    this.eaten = [];
  },

  newQuestion() {
    let text, speech;
    if (this.mode === 'answer') {
      const p = makeProblem(App.age);
      this.target = p.answer;
      text = `${p.text} = ?`;
      speech = problemSpeech(p);
    } else {
      this.target = this.nextVal;
      const by = this.step === 1 ? 'Count up' : `Count by ${this.step}s`;
      if (App.age <= 5) {
        text = `Find ${this.target}!`;
        speech = text;
      } else if (!this.eaten.length) {
        text = `${by}! Start with ${this.target}`;
        speech = text;
      } else {
        text = `${by}: ${this.eaten.slice(-3).join(', ')}, ?`;
        speech = `${this.eaten.slice(-3).join(', ')}. What comes next?`;
      }
    }
    this.q.textContent = text;
    this.sayLater = speech;
    App.later(() => { if (this.sayLater === speech) App.setSay(speech); }, 600);
    this.updateLevel();
    this.placeFood();
  },

  wrongValues(n) {
    const t = this.target;
    if (this.mode === 'answer') return makeChoices(t, n + 1).filter(v => v !== t).slice(0, n);
    const s = this.step;
    const cands = shuffle([...new Set([t + s, t - 1, t + 1, t + 2 * s, t - s])].filter(v => v !== t && v >= 0));
    let k = 2;
    while (cands.length < n) cands.push(t + k++);
    return cands.slice(0, n);
  },

  placeFood() {
    const values = [this.target, ...this.wrongValues(App.age <= 5 ? 2 : 3)];
    const colors = shuffle(SNAKE_FOOD_COLORS.slice());
    this.foods = [];
    values.forEach((v, i) => {
      const cell = this.freeCell(3);
      if (cell) this.foods.push({ x: cell[0], y: cell[1], v, ok: v === this.target, color: colors[i], born: this.t + i * 0.12 });
    });
  },

  // An empty cell at least `minDist` steps from the head.
  freeCell(minDist) {
    const used = new Set([...this.body.map(c => c.join(',')), ...this.rocks, ...(this.foods || []).map(f => f.x + ',' + f.y)]);
    const [hx, hy] = this.body[0];
    const cells = [];
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        if (!used.has(x + ',' + y)) cells.push([x, y]);
      }
    }
    const far = cells.filter(([x, y]) => Math.abs(x - hx) + Math.abs(y - hy) >= minDist);
    return pick(far.length ? far : cells);
  },

  updateLevel() {
    this.levelEl.textContent = `Level ${this.level} · 🐍 ${this.levelEats}/${this.perLevel}`;
  },

  /* ---------- controls ---------- */

  setupInput() {
    const keys = {
      ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
      a: [-1, 0], d: [1, 0], w: [0, -1], s: [0, 1]
    };
    this.onKey = (e) => {
      const dir = keys[e.key];
      if (!dir) return;
      e.preventDefault();
      this.turn(dir);
    };
    addEventListener('keydown', this.onKey);

    // Swipe to turn, or tap where you want the snake to go.
    let down = null;
    this.cv.addEventListener('pointerdown', e => {
      this.cv.setPointerCapture(e.pointerId);
      down = { x: e.clientX, y: e.clientY };
    });
    this.cv.addEventListener('pointerup', e => {
      if (!down) return;
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      down = null;
      if (Math.hypot(dx, dy) > 24) {
        this.turn(Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)]);
        return;
      }
      // a tap: head toward it
      const r = this.cv.getBoundingClientRect();
      const h = this.cellCenter(this.body[0]);
      const tx = e.clientX - r.left - h.x, ty = e.clientY - r.top - h.y;
      const major = Math.abs(tx) > Math.abs(ty) ? [Math.sign(tx), 0] : [0, Math.sign(ty)];
      const minor = Math.abs(tx) > Math.abs(ty) ? [0, Math.sign(ty) || 1] : [Math.sign(tx) || 1, 0];
      const reverse = major[0] === -this.dir[0] && major[1] === -this.dir[1];
      this.turn(reverse ? minor : major);
    });
  },

  // Queue a turn (so quick double-turns both happen). No U-turns into yourself.
  turn(d) {
    const last = this.queue.length ? this.queue[this.queue.length - 1] : this.dir;
    if (d[0] === last[0] && d[1] === last[1]) return;
    if (d[0] === -last[0] && d[1] === -last[1]) return;
    if (this.queue.length < 3) this.queue.push(d);
  },

  /* ---------- game loop ---------- */

  update(dt) {
    this.t += dt;
    if (this.paused) return;
    if (this.stun > 0) { this.stun -= dt; return; }
    this.acc += dt * this.speed;
    while (this.acc >= 1) {
      this.acc -= 1;
      this.tick();
      if (this.paused || this.stun > 0) { this.acc = 0; break; }
    }
  },

  blocked(cell) {
    if (!cell) return true;
    const k = cell.join(',');
    if (this.rocks.has(k)) return true;
    // the tail tip moves out of the way, so it doesn't count
    return this.body.slice(0, -1).some(c => c.join(',') === k);
  },

  tick() {
    this.prev = this.body.map(c => c.slice());
    // Take the next turn, skipping any that would run straight into something
    // (like back into your own neck) — the snake just keeps going instead.
    while (this.queue.length) {
      const d = this.queue.shift();
      if (!this.blocked(this.stepFrom(this.body[0], d))) { this.dir = d; break; }
    }

    let next = this.stepFrom(this.body[0], this.dir);
    if (this.blocked(next)) {
      // Turn to a free side instead of crashing. Bigger kids get a little bonk first.
      const sides = [[this.dir[1], -this.dir[0]], [-this.dir[1], this.dir[0]]]
        .filter(d => !this.blocked(this.stepFrom(this.body[0], d)));
      if (App.age >= 7 && !this.wrapEdges) {
        this.stun = 0.8;
        Sound.bad();
        toast('Bonk! 💫', 900);
      }
      if (!sides.length) {
        // boxed in: drop a tail piece so there's room to wiggle free
        if (this.body.length > 2) { this.body.pop(); this.labels.pop(); }
        this.prev = this.body.map(c => c.slice());
        return;
      }
      this.dir = pick(sides);
      this.queue = [];
      if (this.stun > 0) { this.prev = this.body.map(c => c.slice()); return; }
      next = this.stepFrom(this.body[0], this.dir);
    }

    this.body.unshift(next);
    const food = this.foods.find(f => f.x === next[0] && f.y === next[1]);
    if (food && food.ok) {
      this.labels.splice(1, 0, food.v); // grow: the new number sits right behind the head
      this.eat(food);
    } else {
      this.body.pop();
      if (food) this.sneeze(food);
    }
  },

  eat(food) {
    Sound.chomp();
    const p = this.cellCenter([food.x, food.y]);
    const r = this.cv.getBoundingClientRect();
    App.correct(r.left + p.x, r.top + p.y);
    this.levelEats++;
    if (this.mode === 'count') {
      this.eaten.push(food.v);
      this.nextVal += this.step;
    }
    this.foods = [];
    if (this.levelEats >= this.perLevel) this.levelUp();
    else this.newQuestion();
  },

  sneeze(food) {
    Sound.bad();
    toast(`Achoo! That was ${food.v} 🤧`, 1300);
    this.stun = 0.5;
    // the wrong number hops somewhere else
    const cell = this.freeCell(3);
    if (cell) { food.x = cell[0]; food.y = cell[1]; food.born = this.t; }
  },

  levelUp() {
    this.paused = true;
    this.updateLevel();
    this.q.textContent = this.mode === 'count' ? `${this.eaten.join(', ')} 🎉` : 'Level complete! 🎉';
    App.later(() => {
      this.level++;
      Sound.win();
      toast(`Level ${this.level}: ${this.theme.name}!`, 1800);
      this.newBoard();
    }, 2200);
  },

  /* ---------- drawing ---------- */

  cellCenter([x, y]) {
    return { x: this.offX + (x + 0.5) * this.C, y: this.offY + (y + 0.5) * this.C };
  },

  // Where segment i is drawn, sliding smoothly between cells.
  segPos(i) {
    const now = this.body[i];
    const before = this.prev[i] || now;
    const p = this.paused || this.stun > 0 ? 1 : Math.min(1, this.acc);
    const jump = Math.abs(now[0] - before[0]) + Math.abs(now[1] - before[1]) > 1; // wrapped around
    const from = jump ? now : before;
    return this.cellCenter([from[0] + (now[0] - from[0]) * p, from[1] + (now[1] - from[1]) * p]);
  },

  draw() {
    // The play area can change size mid-game (answer buttons appearing, a long
    // question wrapping onto two lines, the window resizing). Re-measure so
    // the picture is never stretched or squished.
    if (this.wrap.clientWidth !== this.boxW || this.wrap.clientHeight !== this.boxH) this.layout();
    const { cx, W, H, C, t } = this;
    cx.clearRect(0, 0, W, H);

    // checkerboard
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        if ((x + y) % 2) continue;
        cx.fillStyle = this.theme.b;
        cx.fillRect(this.offX + x * C, this.offY + y * C, C, C);
      }
    }
    if (!this.wrapEdges) {
      cx.strokeStyle = 'rgba(0, 0, 0, .25)';
      cx.lineWidth = 3;
      cx.strokeRect(this.offX, this.offY, this.cols * C, this.rows * C);
    }

    cx.textAlign = 'center';
    cx.textBaseline = 'middle';
    cx.font = `${C * 0.75}px serif`;
    for (const k of this.rocks) {
      const p = this.cellCenter(k.split(',').map(Number));
      cx.fillText(this.theme.rock, p.x, p.y);
    }

    for (const f of this.foods) {
      const grow = Math.max(0, Math.min(1, (t - f.born) / 0.25));
      if (!grow) continue;
      const p = this.cellCenter([f.x, f.y]);
      const r = C * 0.42 * grow * (1 + Math.sin(t * 5 + f.x) * 0.05);
      cx.fillStyle = f.color;
      cx.strokeStyle = '#fff';
      cx.lineWidth = 3;
      cx.beginPath();
      cx.arc(p.x, p.y, r, 0, Math.PI * 2);
      cx.fill();
      cx.stroke();
      this.label(f.v, p.x, p.y, grow);
    }

    this.drawSnake();
  },

  label(v, x, y, scale = 1) {
    const { cx, C } = this;
    cx.font = `800 ${C * (String(v).length > 2 ? 0.34 : 0.44) * scale}px 'Baloo 2', sans-serif`;
    cx.lineWidth = 4;
    cx.strokeStyle = 'rgba(0, 0, 0, .35)';
    cx.strokeText(v, x, y + C * 0.04);
    cx.fillStyle = '#fff';
    cx.fillText(v, x, y + C * 0.04);
  },

  drawSnake() {
    const { cx, C, t } = this;
    const pts = this.body.map((_, i) => this.segPos(i));

    // body: a thick line joining the segments, then round segments on top
    cx.lineCap = 'round';
    cx.lineJoin = 'round';
    cx.strokeStyle = '#40c057';
    cx.lineWidth = C * 0.7;
    for (let i = 1; i < pts.length; i++) {
      if (Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) > C * 1.5) continue; // wrap gap
      cx.beginPath();
      cx.moveTo(pts[i - 1].x, pts[i - 1].y);
      cx.lineTo(pts[i].x, pts[i].y);
      cx.stroke();
    }
    for (let i = pts.length - 1; i >= 1; i--) {
      cx.fillStyle = i % 2 ? '#51cf66' : '#40c057';
      cx.beginPath();
      cx.arc(pts[i].x, pts[i].y, C * (i === pts.length - 1 ? 0.3 : 0.42), 0, Math.PI * 2);
      cx.fill();
      if (this.labels[i] !== null && this.labels[i] !== undefined) this.label(this.labels[i], pts[i].x, pts[i].y);
    }

    // head
    const h = pts[0];
    const [dx, dy] = this.dir;
    if (Math.sin(t * 3) > 0.7) {
      // flicking tongue
      cx.strokeStyle = '#e03131';
      cx.lineWidth = 3;
      const tx = h.x + dx * C * 0.75, ty = h.y + dy * C * 0.75;
      cx.beginPath();
      cx.moveTo(h.x + dx * C * 0.4, h.y + dy * C * 0.4);
      cx.lineTo(tx, ty);
      cx.lineTo(tx + (dx * 0.15 - dy * 0.15) * C, ty + (dy * 0.15 + dx * 0.15) * C);
      cx.moveTo(tx, ty);
      cx.lineTo(tx + (dx * 0.15 + dy * 0.15) * C, ty + (dy * 0.15 - dx * 0.15) * C);
      cx.stroke();
    }
    cx.fillStyle = '#2f9e44';
    cx.beginPath();
    cx.arc(h.x, h.y, C * 0.5, 0, Math.PI * 2);
    cx.fill();
    for (const side of [-1, 1]) {
      const ex = h.x + dx * C * 0.15 + -dy * side * C * 0.2;
      const ey = h.y + dy * C * 0.15 + dx * side * C * 0.2;
      cx.fillStyle = '#fff';
      cx.beginPath();
      cx.arc(ex, ey, C * 0.13, 0, Math.PI * 2);
      cx.fill();
      cx.fillStyle = '#212529';
      cx.beginPath();
      cx.arc(ex + dx * C * 0.04, ey + dy * C * 0.04, C * 0.065, 0, Math.PI * 2);
      cx.fill();
    }
    if (this.stun > 0) {
      cx.font = `${C * 0.55}px serif`;
      cx.fillText('💫', h.x + Math.cos(t * 8) * C * 0.3, h.y - C * 0.6);
    }
  }
});
