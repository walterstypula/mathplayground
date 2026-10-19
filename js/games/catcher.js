'use strict';

// A little kid with a basket runs through a maze to fruit trees. Each tree has
// one fruit with a number on it — pick the one with the right answer!
// Picking is always on purpose (tap a tree, or stand next to it and press Space),
// and a wrong pick makes a fruit fall out of your basket.
// Watch out for the buzzy bee, and grab the speedy shoes to run extra fast.
// Mazes are Pac-Man style: all loops, no dead ends, so you never get stuck.
const FRUITS = ['🍎', '🍊', '🍋', '🍉', '🍇', '🍓', '🍑', '🍌', '🍒'];
const MAZE_CELLS = { 4: 4, 5: 5, 6: 5, 7: 6, 8: 7, 9: 7 }; // maze width in rooms
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const CATCHES_PER_LEVEL = 5;

// Each level gets a new maze and a new look.
const MAZE_THEMES = [
  { name: 'Garden', path: '#fff3bf', wall: '#2f9e44', top: '#40c057', tree: '🌳', deco: ['🌼', '🌸', '🌷'] },
  { name: 'Beach', path: '#ffe8cc', wall: '#1971c2', top: '#4dabf7', tree: '🌴', deco: ['🐚', '🦀', '⭐'] },
  { name: 'Candy Land', path: '#fff0f6', wall: '#c2255c', top: '#f06595', tree: '🌳', deco: ['🍬', '🍭', '🧁'] },
  { name: 'Snowy Hills', path: '#f1f3f5', wall: '#4263eb', top: '#91a7ff', tree: '🌲', deco: ['❄️', '⛄', '🌲'] },
  { name: 'Outer Space', path: '#e5dbff', wall: '#5f3dc4', top: '#845ef7', tree: '🌳', deco: ['🪐', '🚀', '✨'] }
];

App.register({
  id: 'catch',
  name: 'Fruit Maze',
  icon: '🧺',
  color: '#339af0',
  desc: 'Run to the tree with the right answer and pick it!',

  start(stage) {
    stage.innerHTML = `
      <div class="fc-top">
        <div class="problem" id="fcQ"></div>
        <div class="pill" id="fcBasket"></div>
      </div>
      <div class="fc-wrap"><canvas id="fcCv"></canvas></div>
      <div class="hint">Tap a tree to pick its fruit — or walk next to it and press Space</div>`;
    this.q = stage.querySelector('#fcQ');
    this.basketEl = stage.querySelector('#fcBasket');
    this.wrap = stage.querySelector('.fc-wrap');
    this.cv = stage.querySelector('#fcCv');
    this.cx = this.cv.getContext('2d');

    const age = App.age;
    this.kidSpeed = 4;                          // tiles per second
    this.beeSpeed = 1.2 + 0.2 * (age - 4);
    this.beeChase = 0.5 + 0.05 * (age - 4);     // how often the bee heads for you
    this.caught = 0;
    this.level = 1;
    this.levelCatches = 0;
    this.trees = [];
    this.flyers = [];
    this.t = 0;

    this.setupInput();
    this.grid = null; // forget any maze from a previous visit
    this.layout();
    this.next();

    this.running = true;
    this.last = performance.now();
    const loop = (t) => {
      if (!this.running) return;
      const dt = Math.max(0, Math.min(50, t - this.last)) / 1000; // first frame can be slightly "early"
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
    removeEventListener('keyup', this.onKey);
    removeEventListener('blur', this.onBlur);
  },

  get theme() {
    return MAZE_THEMES[(this.level - 1) % MAZE_THEMES.length];
  },

  /* ---------- maze ---------- */

  // Match the canvas to its box whenever the box changes size. A maze keeps
  // its shape once built and is just rescaled; each new level picks a fresh size.
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
    if (!this.grid) this.newMaze();
    else this.fitMaze();
  },

  // How many tiles across and down suit the space we have right now.
  pickMazeSize() {
    this.TW = MAZE_CELLS[App.age] * 2 + 1;
    const T = Math.floor(Math.min(this.W / this.TW, this.H / 7));
    this.TH = Math.floor(this.H / T);
    if (this.TH % 2 === 0) this.TH--;
  },

  fitMaze() {
    this.T = Math.floor(Math.min(this.W / this.TW, this.H / this.TH));
    this.offX = (this.W - this.TW * this.T) / 2;
    this.offY = (this.H - this.TH * this.T) / 2;
  },

  // Fresh maze for this level, with everyone back at the start.
  newMaze() {
    this.pickMazeSize();
    this.fitMaze();
    this.buildMaze();
    this.wrap.style.background = this.theme.path;
    this.kid = this.mover(this.startTile());
    this.kid.face = 1;
    this.kid.stun = 0;
    this.kid.fast = 0;
    this.goal = null;
    this.goalTree = null;
    this.bee = null;
    this.beeT = 3;
    this.shoes = null;
    this.shoesT = rand(8, 14);
  },

  // Pac-Man style: start with every corridor open (just little posts), then
  // join posts into walls — mirrored left/right — but only where it never
  // makes a dead end or cuts the maze in two.
  buildMaze() {
    const { TW, TH } = this;
    const g = Array.from({ length: TH }, (_, y) => Array.from({ length: TW }, (_, x) =>
      x === 0 || y === 0 || x === TW - 1 || y === TH - 1 || (x % 2 === 0 && y % 2 === 0) ? 1 : 0));

    const gaps = [];
    for (let y = 1; y < TH - 1; y++) {
      for (let x = 1; x <= (TW - 1) / 2; x++) {
        if ((x % 2 === 0) !== (y % 2 === 0)) gaps.push([x, y]);
      }
    }
    shuffle(gaps);
    let wanted = Math.floor(gaps.length * 0.5);
    for (const [x, y] of gaps) {
      if (wanted <= 0) break;
      const spots = [[x, y], [TW - 1 - x, y]];
      spots.forEach(([a, b]) => { g[b][a] = 1; });
      if (this.noDeadEnds(g)) wanted--;
      else spots.forEach(([a, b]) => { g[b][a] = 0; });
    }

    this.grid = g;
    this.openTiles = [];
    this.flowers = [];
    for (let y = 0; y < TH; y++) {
      for (let x = 0; x < TW; x++) {
        if (g[y][x] === 0) this.openTiles.push([x, y]);
        else if (Math.random() < 0.1) this.flowers.push([x, y, pick(this.theme.deco)]);
      }
    }
  },

  // Every path tile has 2+ ways out, and every path tile can reach every other.
  noDeadEnds(g) {
    const open = (x, y) => g[y] && g[y][x] === 0;
    let first = null, total = 0;
    for (let y = 0; y < this.TH; y++) {
      for (let x = 0; x < this.TW; x++) {
        if (!open(x, y)) continue;
        total++;
        first = first || [x, y];
        if (DIRS.filter(([dx, dy]) => open(x + dx, y + dy)).length < 2) return false;
      }
    }
    const seen = new Set([first.join(',')]);
    const queue = [first];
    while (queue.length) {
      const [x, y] = queue.shift();
      for (const [dx, dy] of DIRS) {
        const k = (x + dx) + ',' + (y + dy);
        if (open(x + dx, y + dy) && !seen.has(k)) { seen.add(k); queue.push([x + dx, y + dy]); }
      }
    }
    return seen.size === total;
  },

  isOpen(x, y) {
    return y >= 0 && y < this.TH && x >= 0 && x < this.TW && this.grid[y][x] === 0;
  },

  startTile() {
    const cx = (this.TW - 1) / 2, cy = (this.TH - 1) / 2;
    return this.openTiles.reduce((best, t) =>
      Math.hypot(t[0] - cx, t[1] - cy) < Math.hypot(best[0] - cx, best[1] - cy) ? t : best);
  },

  // Steps away from a tile, for every open tile.
  distances(from) {
    const dist = new Map([[from.join(','), 0]]);
    const queue = [from];
    while (queue.length) {
      const [x, y] = queue.shift();
      const d = dist.get(x + ',' + y);
      for (const [dx, dy] of DIRS) {
        const k = (x + dx) + ',' + (y + dy);
        if (this.isOpen(x + dx, y + dy) && !dist.has(k)) { dist.set(k, d + 1); queue.push([x + dx, y + dy]); }
      }
    }
    return dist;
  },

  path(from, to) {
    const prev = new Map([[from.join(','), null]]);
    const queue = [from];
    while (queue.length) {
      const [x, y] = queue.shift();
      if (x === to[0] && y === to[1]) break;
      for (const [dx, dy] of DIRS) {
        const k = (x + dx) + ',' + (y + dy);
        if (this.isOpen(x + dx, y + dy) && !prev.has(k)) { prev.set(k, [x, y]); queue.push([x + dx, y + dy]); }
      }
    }
    const steps = [];
    let cur = to;
    while (cur && prev.has(cur.join(',')) && prev.get(cur.join(','))) {
      steps.unshift(cur);
      cur = prev.get(cur.join(','));
    }
    return steps;
  },

  // A random open tile at least `minSteps` from the kid.
  farTile(minSteps) {
    const dist = this.distances(this.kidTile());
    const far = this.openTiles.filter(t => (dist.get(t.join(',')) || 0) >= minSteps);
    return pick(far.length ? far : this.openTiles);
  },

  /* ---------- fruit trees ---------- */

  // Trees grow out of hedges next to a path, spread apart and not right
  // beside the kid. One has the answer; the rest have near-miss numbers.
  plantTrees() {
    const n = App.age <= 5 ? 3 : 4;
    const dist = this.distances(this.kidTile());
    const spots = [];
    for (let y = 1; y < this.TH - 1; y++) {
      for (let x = 1; x < this.TW - 1; x++) {
        if (this.grid[y][x] !== 1) continue;
        const near = DIRS.map(([dx, dy]) => [x + dx, y + dy]).filter(([a, b]) => this.isOpen(a, b));
        if (!near.length) continue;
        const steps = Math.min(...near.map(t => dist.get(t.join(',')) ?? 99));
        if (steps >= 3) spots.push({ x, y });
      }
    }
    shuffle(spots);
    const chosen = [];
    for (const minGap of [5, 4, 3, 2]) {
      for (const s of spots) {
        if (chosen.length >= n) break;
        if (chosen.includes(s)) continue;
        if (chosen.every(o => Math.abs(o.x - s.x) + Math.abs(o.y - s.y) >= minGap)) chosen.push(s);
      }
      if (chosen.length >= n) break;
    }
    const values = makeChoices(this.problem.answer, chosen.length);
    this.trees = chosen.map((s, i) => ({
      x: s.x, y: s.y,
      v: values[i],
      ok: values[i] === this.problem.answer,
      fruit: pick(FRUITS),
      hasFruit: true,
      born: this.t + i * 0.12,
      shake: 0
    }));
  },

  treeAt(x, y) {
    return this.trees.find(tr => tr.x === x && tr.y === y && tr.hasFruit);
  },

  // A fruit tree right next to the kid (prefer the one they're facing).
  treeNextToKid() {
    const k = this.kid;
    const [x, y] = this.kidTile();
    const facing = k.dir && this.treeAt(x + k.dir[0], y + k.dir[1]);
    if (facing) return facing;
    for (const [dx, dy] of DIRS) {
      const tr = this.treeAt(x + dx, y + dy);
      if (tr) return tr;
    }
    return null;
  },

  // The path tile beside a tree that the kid can reach soonest.
  standingSpot(tr) {
    const dist = this.distances(this.kidTile());
    const spots = DIRS.map(([dx, dy]) => [tr.x + dx, tr.y + dy]).filter(([a, b]) => this.isOpen(a, b));
    return spots.reduce((a, b) => (dist.get(b.join(',')) ?? 99) < (dist.get(a.join(',')) ?? 99) ? b : a);
  },

  pickTree(tr) {
    if (this.paused || !tr.hasFruit) return;
    this.goal = null;
    this.goalTree = null;
    const k = this.kid;
    const kp = this.pos(k);
    const tp = this.tileCenter(tr.x, tr.y);
    if (tr.x !== this.kidTile()[0]) k.face = Math.sign(tr.x - this.kidTile()[0]);
    tr.hasFruit = false;
    tr.shake = 0.4;
    const r = this.cv.getBoundingClientRect();

    if (tr.ok) {
      this.flyers.push({ kind: 'good', emoji: tr.fruit, x: tp.x, y: tp.y - this.T * 0.15, tx: kp.x + this.T * 0.3, ty: kp.y + this.T * 0.2, t: 0, dur: 0.45 });
      this.paused = true;
      this.caught++;
      this.levelCatches++;
      this.updateBasket();
      App.correct(r.left + tp.x, r.top + tp.y);
      this.q.textContent = `${this.problem.text} = ${this.problem.answer}`;
      if (this.levelCatches >= CATCHES_PER_LEVEL) {
        // Level up: a brand new maze with a new look.
        App.later(() => {
          this.level++;
          this.levelCatches = 0;
          this.newMaze();
          Sound.win();
          toast(`Level ${this.level}: ${this.theme.name}!`, 1800);
          this.next();
        }, 1500);
      } else {
        App.later(() => this.next(), 1500);
      }
    } else {
      // Wrong pick: the fruit rots and drops, and one falls out of the basket.
      Sound.bad();
      this.flyers.push({ kind: 'rot', emoji: tr.fruit, x: tp.x, y: tp.y - this.T * 0.15, tx: tp.x, ty: tp.y + this.T * 0.6, t: 0, dur: 0.8 });
      k.stun = 0.7;
      if (this.levelCatches > 0) {
        this.levelCatches--;
        this.flyers.push({ kind: 'rot', emoji: pick(FRUITS), x: kp.x + this.T * 0.3, y: kp.y + this.T * 0.2, tx: kp.x + this.T * 0.5, ty: kp.y + this.T * 0.9, t: 0, dur: 0.8 });
        toast(`That's ${tr.v}! A fruit fell out of your basket!`, 1700);
      } else {
        toast(`Yuck! That's ${tr.v}. Try another tree!`, 1600);
      }
      this.updateBasket();
      shake(this.basketEl);
    }
  },

  /* ---------- things that walk the maze ---------- */

  mover([x, y]) {
    return { tx: x, ty: y, nx: null, ny: null, p: 0, dir: null };
  },

  // Walk tile to tile; `choose` picks the next step when we reach a tile.
  walk(e, dt, speed, choose) {
    if (e.nx === null) {
      const d = choose(e);
      if (!d) return;
      e.dir = d; e.nx = e.tx + d[0]; e.ny = e.ty + d[1]; e.p = 0;
    }
    e.p += speed * dt;
    while (e.p >= 1) {
      e.tx = e.nx; e.ty = e.ny; e.p -= 1;
      const d = choose(e);
      if (!d) { e.nx = e.ny = null; e.p = 0; break; }
      e.dir = d; e.nx = e.tx + d[0]; e.ny = e.ty + d[1];
    }
  },

  tileCenter(x, y) {
    return { x: this.offX + (x + 0.5) * this.T, y: this.offY + (y + 0.5) * this.T };
  },

  pos(e) {
    const fx = e.nx === null ? e.tx : e.tx + (e.nx - e.tx) * e.p;
    const fy = e.ny === null ? e.ty : e.ty + (e.ny - e.ty) * e.p;
    return this.tileCenter(fx, fy);
  },

  // The tile something is mostly standing on.
  tileOf(e) {
    return e.nx !== null && e.p > 0.5 ? [e.nx, e.ny] : [e.tx, e.ty];
  },

  kidTile() { return this.tileOf(this.kid); },

  // Open directions from a tile, avoiding turning straight back unless stuck.
  options(e) {
    const opts = DIRS.filter(([dx, dy]) => this.isOpen(e.tx + dx, e.ty + dy));
    if (opts.length > 1 && e.dir) {
      const fwd = opts.filter(([dx, dy]) => dx !== -e.dir[0] || dy !== -e.dir[1]);
      if (fwd.length) return fwd;
    }
    return opts;
  },

  /* ---------- controls ---------- */

  setupInput() {
    const keys = {
      ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
      a: [-1, 0], d: [1, 0], w: [0, -1], s: [0, 1]
    };
    this.onKey = (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (e.type !== 'keydown' || e.repeat || this.kid.stun > 0) return;
        const tr = this.treeNextToKid();
        if (tr) this.pickTree(tr);
        else toast('Walk next to a tree first! 🌳', 1200);
        return;
      }
      const name = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const dir = keys[name];
      if (!dir) return;
      e.preventDefault();
      // Hold a key to walk, let go to stop. Newest key held wins.
      this.held = this.held.filter(h => h.name !== name);
      if (e.type === 'keydown') {
        this.held.push({ name, dir });
        this.goal = null;
        this.goalTree = null;
      }
    };
    this.onBlur = () => { this.held = []; }; // switched windows: let go of everything
    this.held = [];
    addEventListener('keydown', this.onKey);
    addEventListener('keyup', this.onKey);
    addEventListener('blur', this.onBlur);

    // Tap a tree to go pick it, or tap anywhere to run there.
    const aim = (e) => {
      const r = this.cv.getBoundingClientRect();
      const fx = (e.clientX - r.left - this.offX) / this.T - 0.5;
      const fy = (e.clientY - r.top - this.offY) / this.T - 0.5;
      const tr = this.trees.find(t => t.hasFruit && Math.hypot(t.x - fx, t.y - fy) < 0.75);
      if (tr) {
        this.goalTree = tr;
        this.goal = this.standingSpot(tr);
        return;
      }
      this.goalTree = null;
      this.goal = this.openTiles.reduce((best, t) =>
        Math.hypot(t[0] - fx, t[1] - fy) < Math.hypot(best[0] - fx, best[1] - fy) ? t : best);
    };
    this.cv.addEventListener('pointerdown', e => { this.cv.setPointerCapture(e.pointerId); aim(e); });
    this.cv.addEventListener('pointermove', e => { if (e.buttons && !this.goalTree) aim(e); });
  },

  chooseKid(k) {
    if (this.goal) {
      if (k.tx === this.goal[0] && k.ty === this.goal[1]) {
        const tr = this.goalTree;
        this.goal = null;
        this.goalTree = null;
        if (tr && tr.hasFruit) this.pickTree(tr); // arrived at the tree you tapped
        return null;
      }
      const route = this.path([k.tx, k.ty], this.goal);
      if (route.length) return [route[0][0] - k.tx, route[0][1] - k.ty];
      this.goal = null;
      return null;
    }
    // Walk while a key is held: the newest one if that way is open, otherwise
    // another held key (hold → and press ↑ to turn at the next gap).
    for (let i = this.held.length - 1; i >= 0; i--) {
      const [dx, dy] = this.held[i].dir;
      if (this.isOpen(k.tx + dx, k.ty + dy)) return [dx, dy];
    }
    return null;
  },

  /* ---------- rounds ---------- */

  next() {
    this.paused = false;
    this.problem = makeProblem(App.age);
    this.q.textContent = `${this.problem.text} = ?`;
    App.setSay(problemSpeech(this.problem));
    this.plantTrees();
    this.updateBasket();
  },

  updateBasket() {
    this.basketEl.textContent = `Level ${this.level} · 🧺 ${this.levelCatches}/${CATCHES_PER_LEVEL}`;
  },

  /* ---------- game loop ---------- */

  update(dt) {
    this.t += dt;
    const k = this.kid;

    for (const tr of this.trees) if (tr.shake > 0) tr.shake -= dt;
    this.flyers = this.flyers.filter(f => (f.t += dt) < f.dur);

    if (k.stun > 0) k.stun -= dt;
    else {
      if (k.fast > 0) k.fast -= dt;
      this.walk(k, dt, this.kidSpeed * (k.fast > 0 ? 1.6 : 1), e => this.chooseKid(e));
      if (k.dir && k.dir[0]) k.face = k.dir[0];
    }
    if (this.paused) return;

    const kp = this.pos(k);
    this.updateBee(dt, kp);
    this.updateShoes(dt, kp);
  },

  updateBee(dt, kp) {
    if (!this.bee) {
      this.beeT -= dt;
      if (this.beeT <= 0) this.bee = this.mover(this.farTile(8));
      return;
    }
    const dist = this.distances(this.kidTile());
    const b = this.bee;
    this.walk(b, dt, this.beeSpeed, e => {
      const opts = this.options(e);
      if (Math.random() < this.beeChase) {
        return opts.reduce((a, c) =>
          (dist.get((e.tx + c[0]) + ',' + (e.ty + c[1])) ?? 99) < (dist.get((e.tx + a[0]) + ',' + (e.ty + a[1])) ?? 99) ? c : a);
      }
      return pick(opts);
    });
    const bp = this.pos(b);
    const k = this.kid;
    if (k.stun <= 0 && Math.hypot(bp.x - kp.x, bp.y - kp.y) < this.T * 0.6) {
      k.stun = 1.1;
      Sound.bad();
      toast('Ouch! Buzz off, bee! 🐝', 1200);
      this.bee = this.mover(this.farTile(8)); // bee zooms away
    }
  },

  updateShoes(dt, kp) {
    if (!this.shoes) {
      this.shoesT -= dt;
      if (this.shoesT <= 0) this.shoes = { tile: this.farTile(3), life: 9 };
      return;
    }
    this.shoes.life -= dt;
    if (this.shoes.life <= 0) { this.shoes = null; this.shoesT = rand(10, 16); return; }
    const sp = this.tileCenter(this.shoes.tile[0], this.shoes.tile[1]);
    if (Math.hypot(sp.x - kp.x, sp.y - kp.y) < this.T * 0.6) {
      this.shoes = null;
      this.shoesT = rand(14, 20);
      this.kid.fast = 6;
      Sound.win();
      toast('Speedy shoes! Zoom! 👟', 1500);
    }
  },

  /* ---------- drawing ---------- */

  draw() {
    // The play area can change size mid-game (answer buttons appearing, a long
    // question wrapping onto two lines, the window resizing). Re-measure so
    // the picture is never stretched or squished.
    if (this.wrap.clientWidth !== this.boxW || this.wrap.clientHeight !== this.boxH) this.layout();
    const { cx, W, H, T, t } = this;
    cx.clearRect(0, 0, W, H);
    const isTree = new Set(this.trees.map(tr => tr.x + ',' + tr.y));

    // hedges
    for (let y = 0; y < this.TH; y++) {
      for (let x = 0; x < this.TW; x++) {
        if (this.grid[y][x] !== 1 || isTree.has(x + ',' + y)) continue;
        const px = this.offX + x * T, py = this.offY + y * T;
        cx.fillStyle = this.theme.wall;
        cx.beginPath();
        cx.roundRect(px + 1, py + 1, T - 2, T - 2, T * 0.3);
        cx.fill();
        cx.fillStyle = this.theme.top;
        cx.beginPath();
        cx.roundRect(px + 3, py + 2, T - 6, T * 0.55, T * 0.25);
        cx.fill();
      }
    }
    cx.textAlign = 'center';
    cx.textBaseline = 'middle';
    cx.font = `${T * 0.45}px serif`;
    for (const [x, y, f] of this.flowers) {
      if (!isTree.has(x + ',' + y)) cx.fillText(f, this.offX + (x + 0.5) * T, this.offY + (y + 0.5) * T);
    }

    // where the kid is heading
    if (this.goal) {
      const g = this.goalTree ? this.tileCenter(this.goalTree.x, this.goalTree.y) : this.tileCenter(...this.goal);
      cx.strokeStyle = 'rgba(255, 146, 43, .85)';
      cx.lineWidth = 3;
      cx.beginPath();
      cx.arc(g.x, g.y, T * ((this.goalTree ? 0.55 : 0.25) + Math.sin(t * 8) * 0.05), 0, Math.PI * 2);
      cx.stroke();
    }

    this.drawTrees();

    if (this.shoes && !(this.shoes.life < 2 && Math.sin(t * 20) > 0)) {
      const s = this.tileCenter(this.shoes.tile[0], this.shoes.tile[1]);
      cx.font = `${T * 0.75 * (1 + Math.sin(t * 6) * 0.1)}px serif`;
      cx.fillText('👟', s.x, s.y);
    }

    if (this.bee) {
      const b = this.pos(this.bee);
      cx.font = `${T * 0.75}px serif`;
      cx.fillText('🐝', b.x + Math.sin(t * 9) * T * 0.08, b.y + Math.cos(t * 13) * T * 0.08);
    }

    this.drawKid();
    this.drawFlyers();
  },

  drawTrees() {
    const { cx, T, t } = this;
    const nextTo = this.paused ? null : this.treeNextToKid();
    for (const tr of this.trees) {
      const p = this.tileCenter(tr.x, tr.y);
      const grow = Math.max(0, Math.min(1, (t - tr.born) / 0.3));
      const sway = tr.shake > 0 ? Math.sin(tr.shake * 40) * T * 0.06 : 0;

      // "you can pick this one" glow
      if (tr === nextTo) {
        cx.fillStyle = `rgba(255, 224, 102, ${0.45 + Math.sin(t * 6) * 0.2})`;
        cx.beginPath();
        cx.arc(p.x, p.y, T * 0.62, 0, Math.PI * 2);
        cx.fill();
      }

      cx.globalAlpha = tr.hasFruit ? 1 : 0.5;
      cx.font = `${T * 1.15 * Math.max(grow, 0.6)}px serif`;
      cx.fillText(this.theme.tree, p.x + sway, p.y - T * 0.1);
      cx.globalAlpha = 1;
      if (!tr.hasFruit || !grow) continue;

      // the fruit hanging in the branches
      cx.font = `${T * 0.42 * grow}px serif`;
      cx.fillText(tr.fruit, p.x + sway + T * 0.2, p.y - T * 0.22);

      // the number, on a little sign by the trunk
      if (grow === 1) {
        const label = String(tr.v);
        cx.font = `800 ${T * 0.36}px 'Baloo 2', sans-serif`;
        const w = Math.max(T * 0.5, cx.measureText(label).width + T * 0.22);
        const sy = p.y + T * 0.3;
        cx.fillStyle = '#fff';
        cx.strokeStyle = '#8d6e63';
        cx.lineWidth = 2.5;
        cx.beginPath();
        cx.roundRect(p.x - w / 2, sy - T * 0.21, w, T * 0.42, T * 0.12);
        cx.fill();
        cx.stroke();
        cx.fillStyle = '#2b2d42';
        cx.fillText(label, p.x, sy + T * 0.02);
      }
    }
  },

  // Fruit flying into the basket, or rotten fruit dropping.
  drawFlyers() {
    const { cx, T } = this;
    for (const f of this.flyers) {
      const k = f.t / f.dur;
      const x = f.x + (f.tx - f.x) * k;
      const y = f.kind === 'good'
        ? f.y + (f.ty - f.y) * k - Math.sin(k * Math.PI) * T * 0.6 // arc into the basket
        : f.y + (f.ty - f.y) * k * k;                                // fall
      cx.save();
      cx.globalAlpha = f.kind === 'good' ? 1 : 1 - k;
      cx.translate(x, y);
      if (f.kind === 'rot') cx.rotate(k * 2);
      cx.font = `${T * (f.kind === 'good' ? 0.6 - k * 0.25 : 0.55)}px serif`;
      cx.fillText(f.emoji, 0, 0);
      if (f.kind === 'rot') cx.fillText('💨', T * 0.25, -T * 0.2);
      cx.restore();
    }
  },

  drawKid() {
    const { cx, T, t } = this;
    const k = this.kid;
    const p = this.pos(k);
    const moving = k.nx !== null && k.stun <= 0;
    const bounce = moving ? Math.abs(Math.sin(t * 14)) * T * 0.08 : 0;

    if (k.fast > 0) {
      cx.fillStyle = 'rgba(255, 212, 59, .5)';
      cx.beginPath();
      cx.arc(p.x, p.y, T * 0.55, 0, Math.PI * 2);
      cx.fill();
    }

    cx.save();
    cx.translate(p.x, p.y - bounce);
    cx.scale(k.face < 0 ? -1 : 1, 1); // face the way we're running
    cx.font = `${T * 0.85}px serif`;
    cx.fillText('🧒', -T * 0.08, -T * 0.04);
    cx.font = `${T * 0.5}px serif`;
    cx.fillText('🧺', T * 0.3, T * 0.22);
    cx.restore();

    if (k.stun > 0) {
      cx.font = `${T * 0.45}px serif`;
      cx.fillText('💫', p.x + Math.cos(t * 8) * T * 0.25, p.y - T * 0.5);
    }
  }
});
