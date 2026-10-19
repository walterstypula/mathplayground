'use strict';

// Inspired by TuxMath: meteors with problems drift down toward a little town.
// Tap the answer to zap one! A wrong tap pulls the closest meteor nearer, and
// a meteor that lands dents the shield. Shields gone? Just try the wave again.
const MR_SHIELDS = 5;
const MR_PER_WAVE = 6;
const MR_HOUSES = [
  { x: 0.08, w: 1.0, body: '#ffd8a8', roof: '#e8590c' },
  { x: 0.2, w: 0.8, body: '#d0bfff', roof: '#7048e8' },
  { x: 0.32, w: 1.1, body: '#c3fae8', roof: '#0ca678' },
  { x: 0.68, w: 0.9, body: '#ffdeeb', roof: '#d6336c' },
  { x: 0.8, w: 1.1, body: '#d0ebff', roof: '#1c7ed6' },
  { x: 0.92, w: 0.8, body: '#fff3bf', roof: '#f08c00' }
];

App.register({
  id: 'meteor',
  name: 'Meteor Rescue',
  icon: '☄️',
  color: '#4c6ef5',
  desc: 'Zap the falling meteors by tapping their answers!',

  start(stage) {
    stage.innerHTML = `
      <div class="fc-top">
        <div class="pill" id="mrWave"></div>
        <div class="pill" id="mrShield"></div>
      </div>
      <div class="fc-wrap mr-sky"><canvas id="mrCv"></canvas></div>
      <div class="answers" id="mrAns"></div>`;
    this.waveEl = stage.querySelector('#mrWave');
    this.shieldEl = stage.querySelector('#mrShield');
    this.ans = stage.querySelector('#mrAns');
    this.wrap = stage.querySelector('.mr-sky');
    this.cv = stage.querySelector('#mrCv');
    this.cx = this.cv.getContext('2d');

    const age = App.age;
    this.fallTime = 16 - (age - 4) * 1.4;              // seconds for a meteor to land
    this.maxLive = age <= 5 ? 1 : age <= 7 ? 2 : 3;    // meteors on screen at once
    this.wave = 1;
    this.shields = MR_SHIELDS;
    this.spawned = 0;
    this.meteors = [];
    this.sparks = [];      // glowing explosion bits
    this.debris = [];      // tumbling rock chunks
    this.rings = [];       // shockwaves
    this.embers = [];      // little bits falling off meteor tails
    this.lasers = [];
    this.spawnT = 1;
    this.pauseT = 0;
    this.shakeT = 0;
    this.flashT = 0;       // red flash when the town gets hit
    this.domeHitT = 0;
    this.muzzleT = 0;
    this.shooting = null;  // a shooting star now and then
    this.shootT = 3;
    this.banner = null;    // big "Wave 2!" text
    this.aim = this.aimTarget = -Math.PI / 2;
    this.charge = 1;
    this.t = 0;
    this.twinkles = Array.from({ length: 45 }, () => ({ x: Math.random(), y: Math.random() * 0.7, r: Math.random() * 1.6 + 0.8, ph: Math.random() * 6 }));

    this.resize = () => {
      const r = this.wrap.getBoundingClientRect();
      const d = window.devicePixelRatio || 1;
      this.W = r.width;
      this.H = r.height;
      this.boxW = this.wrap.clientWidth;
      this.boxH = this.wrap.clientHeight;
      this.cv.width = r.width * d;
      this.cv.height = r.height * d;
      this.cx.setTransform(d, 0, 0, d, 0, 0);
      this.R = Math.max(32, Math.min(56, this.W * 0.095)); // meteor size
      this.groundY = this.H * 0.84;
      this.buildBackdrop(d);
    };
    this.resize();
    this.updateHud();
    this.updateButtons();
    this.showBanner('Wave 1');

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
  },

  /* ---------- game logic ---------- */

  updateHud() {
    const left = MR_PER_WAVE - (this.spawned - this.meteors.length);
    this.waveEl.textContent = `Wave ${this.wave} · ☄️ ${left} left`;
    this.shieldEl.textContent = '💙'.repeat(this.shields) + '🤍'.repeat(MR_SHIELDS - this.shields);
  },

  showBanner(text) {
    this.banner = { text, t: 0 };
  },

  lowest() {
    return this.meteors.reduce((a, m) => (!a || m.y > a.y ? m : a), null);
  },

  spawn() {
    let p;
    for (let i = 0; i < 20; i++) {
      p = makeProblem(App.age);
      if (!this.meteors.some(m => m.p.answer === p.answer)) break; // one meteor per answer
    }
    // pick the lane furthest from meteors near the top
    const lanes = shuffle([0.2, 0.5, 0.8]);
    const lane = lanes.reduce((best, l) => {
      const crowd = (x) => Math.min(1, ...this.meteors.filter(m => m.y < 0.45).map(m => Math.abs(m.lane - x)));
      return crowd(l) > crowd(best) ? l : best;
    });
    // a lumpy rock: a ring of points at slightly different distances, plus craters
    const shape = Array.from({ length: 11 }, () => 0.84 + Math.random() * 0.2);
    const craters = Array.from({ length: 4 }, () => ({ a: Math.random() * 6.28, d: 0.25 + Math.random() * 0.45, r: 0.1 + Math.random() * 0.12 }));
    this.meteors.push({ p, lane, y: 0, spin: Math.random() * 6, spinSpeed: (Math.random() - 0.5) * 1.2, shape, craters });
    this.spawned++;
    if (this.meteors.length === 1) App.setSay(problemSpeech(p));
    this.updateButtons();
    this.updateHud();
  },

  // Answer buttons: every meteor's answer plus a few near misses, smallest first.
  updateButtons() {
    this.ans.innerHTML = '';
    if (!this.meteors.length) return;
    const n = App.age <= 5 ? 3 : 4;
    const vals = [...new Set(this.meteors.map(m => m.p.answer))];
    const base = this.lowest().p.answer;
    for (const v of makeChoices(base, n + 4)) {
      if (vals.length >= n) break;
      if (!vals.includes(v)) vals.push(v);
    }
    vals.sort((a, b) => a - b).forEach(v => {
      const b = document.createElement('button');
      b.className = 'ans-btn';
      b.textContent = v;
      b.addEventListener('click', () => this.fire(v, b));
      this.ans.appendChild(b);
    });
  },

  meteorPos(m) {
    const R = this.R;
    return { x: m.lane * this.W, y: -R + m.y * (this.groundY - R * 0.4 + R) };
  },

  // The cannon turns around the middle of its dome.
  pivot() {
    return { x: this.W / 2, y: this.groundY - this.R * 0.45 };
  },

  aimAt(x, y) {
    const p = this.pivot();
    const a = Math.atan2(y - p.y, x - p.x);
    return Math.max(-Math.PI + 0.15, Math.min(-0.15, a)); // always somewhere up in the sky
  },

  gunTip() {
    const L = this.R * 1.5;
    const p = this.pivot();
    return { x: p.x + Math.cos(this.aim) * L, y: p.y + Math.sin(this.aim) * L };
  },

  fire(v, btn) {
    if (this.pauseT > 0) return;
    const hits = this.meteors.filter(m => m.p.answer === v);
    if (hits.length) {
      const m = hits.reduce((a, b) => (b.y > a.y ? b : a));
      const mp = this.meteorPos(m);
      this.aim = this.aimTarget = this.aimAt(mp.x, mp.y); // snap onto the target
      const tip = this.gunTip();
      this.lasers.push({ x1: tip.x, y1: tip.y, x2: mp.x, y2: mp.y, t: 0 });
      this.muzzleT = 0.15;
      this.charge = 0; // the barrel tips dim, then recharge
      this.explode(mp.x, mp.y, ['#ffd43b', '#ff922b', '#ffffff'], m);
      Sound.tone(1200, 0.25, 'square', 0, 0.06, 200);
      this.meteors = this.meteors.filter(o => o !== m);
      const r = this.cv.getBoundingClientRect();
      App.correct(r.left + mp.x, r.top + mp.y);
      this.updateButtons();
      this.updateHud();
    } else {
      // Wrong answer: the closest meteor jumps nearer.
      Sound.bad();
      shake(btn);
      const low = this.lowest();
      if (low) low.y = Math.min(0.96, low.y + 0.1);
      toast(`No meteor equals ${v}! It's getting closer!`, 1600);
    }
  },

  explode(x, y, colors, m) {
    for (let i = 0; i < 36; i++) {
      const a = Math.random() * Math.PI * 2, s = 80 + Math.random() * 220;
      this.sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + Math.random() * 0.5, max: 1, size: 2 + Math.random() * 3, color: pick(colors) });
    }
    if (m) {
      for (let i = 0; i < 7; i++) {
        const a = Math.random() * Math.PI * 2, s = 60 + Math.random() * 120;
        this.debris.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 10, size: this.R * (0.12 + Math.random() * 0.15), life: 1.2 });
      }
    }
    this.rings.push({ x, y, t: 0, dur: 0.5, max: this.R * 2.4, color: colors[0] });
  },

  landed(m) {
    const mp = this.meteorPos(m);
    this.meteors = this.meteors.filter(o => o !== m);
    this.shields--;
    this.shakeT = 0.45;
    this.flashT = 0.35;
    this.domeHitT = 0.6;
    this.explode(mp.x, this.groundY - this.R * 0.5, ['#ff6b6b', '#ffa94d', '#ffe066'], m);
    Sound.tone(120, 0.4, 'sawtooth', 0, 0.12, 50);
    if (this.shields <= 0) {
      this.meteors = [];
      this.pauseT = 2.2;
      toast("Shields down! Let's try this wave again 💪", 2200);
      this.afterPause = () => {
        this.spawned = 0;
        this.shields = MR_SHIELDS;
        this.spawnT = 1;
        this.updateHud();
        this.showBanner(`Wave ${this.wave}`);
      };
    } else {
      toast(`Bump! It was ${m.p.text} = ${m.p.answer}`, 1700);
    }
    this.updateButtons();
    this.updateHud();
  },

  update(dt) {
    this.t += dt;
    for (const k of ['shakeT', 'flashT', 'domeHitT', 'muzzleT']) if (this[k] > 0) this[k] -= dt;
    this.charge = Math.min(1, this.charge + dt * 1.6);

    // The cannon keeps an eye on the closest meteor, turning smoothly toward it.
    const low = this.lowest();
    if (this.muzzleT <= 0) {
      if (low) { const mp = this.meteorPos(low); this.aimTarget = this.aimAt(mp.x, mp.y); }
      else this.aimTarget = -Math.PI / 2;
    }
    this.aim += (this.aimTarget - this.aim) * Math.min(1, dt * 4);
    this.lasers = this.lasers.filter(l => (l.t += dt) < 0.35);
    this.rings = this.rings.filter(r => (r.t += dt) < r.dur);
    this.sparks = this.sparks.filter(s => {
      s.life -= dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= 0.97; s.vy = s.vy * 0.97 + 160 * dt;
      return s.life > 0;
    });
    this.debris = this.debris.filter(d => {
      d.life -= dt; d.x += d.vx * dt; d.y += d.vy * dt; d.vy += 300 * dt; d.rot += d.vr * dt;
      return d.life > 0 && d.y < this.groundY + 10;
    });
    this.embers = this.embers.filter(e => {
      e.life -= dt; e.x += e.vx * dt; e.y += e.vy * dt;
      return e.life > 0;
    });
    if (this.banner && (this.banner.t += dt) > 1.8) this.banner = null;

    // a shooting star every so often
    this.shootT -= dt;
    if (this.shootT <= 0 && !this.shooting) {
      this.shooting = { x: Math.random() * this.W * 0.6, y: Math.random() * this.H * 0.3, t: 0 };
      this.shootT = 5 + Math.random() * 6;
    }
    if (this.shooting && (this.shooting.t += dt) > 0.8) this.shooting = null;

    if (this.pauseT > 0) {
      this.pauseT -= dt;
      if (this.pauseT <= 0 && this.afterPause) {
        const f = this.afterPause;
        this.afterPause = null;
        f();
      }
      return;
    }

    const speed = 1 / Math.max(7, this.fallTime - (this.wave - 1) * 0.5);
    for (const m of [...this.meteors]) {
      m.y += speed * dt;
      m.spin += m.spinSpeed * dt;
      // embers drifting off the tail
      if (Math.random() < 0.5) {
        const mp = this.meteorPos(m);
        this.embers.push({
          x: mp.x + (Math.random() - 0.5) * this.R, y: mp.y - this.R * 0.6,
          vx: (Math.random() - 0.5) * 20, vy: -20 - Math.random() * 40,
          life: 0.4 + Math.random() * 0.5, max: 0.9
        });
      }
      if (m.y >= 1) { this.landed(m); if (this.pauseT > 0) return; }
    }

    this.spawnT -= dt;
    if (this.spawned < MR_PER_WAVE && this.meteors.length < this.maxLive && this.spawnT <= 0) {
      this.spawn();
      this.spawnT = App.age <= 5 ? 1.5 : 3;
    }

    if (this.spawned >= MR_PER_WAVE && !this.meteors.length) {
      Sound.win();
      Confetti.rain();
      toast(`Wave ${this.wave} cleared! 🎉`, 2000);
      this.pauseT = 2.2;
      this.afterPause = () => {
        this.wave++;
        this.spawned = 0;
        this.shields = Math.min(MR_SHIELDS, this.shields + 1); // a little repair between waves
        this.spawnT = 0.5;
        this.updateHud();
        this.showBanner(`Wave ${this.wave}`);
      };
    }
  },

  /* ---------- drawing ---------- */

  // Everything that never moves (sky, nebula, planet, hills, houses) is drawn
  // once into an off-screen canvas, then copied each frame.
  buildBackdrop(d) {
    const { W, H } = this;
    const gy = this.groundY;
    const c = document.createElement('canvas');
    c.width = W * d;
    c.height = H * d;
    const x = c.getContext('2d');
    x.scale(d, d);

    const sky = x.createLinearGradient(0, 0, 0, gy);
    sky.addColorStop(0, '#060a24');
    sky.addColorStop(0.6, '#1a1f5c');
    sky.addColorStop(1, '#43307a');
    x.fillStyle = sky;
    x.fillRect(0, 0, W, H);

    // soft nebula clouds
    for (const n of [
      { x: 0.18, y: 0.28, r: 0.55, c: '132, 94, 247', a: 0.28 },
      { x: 0.88, y: 0.12, r: 0.4, c: '32, 201, 151', a: 0.18 },
      { x: 0.62, y: 0.5, r: 0.5, c: '240, 101, 149', a: 0.16 }
    ]) {
      const g = x.createRadialGradient(n.x * W, n.y * H, 0, n.x * W, n.y * H, n.r * Math.max(W, H));
      g.addColorStop(0, `rgba(${n.c}, ${n.a})`);
      g.addColorStop(1, `rgba(${n.c}, 0)`);
      x.fillStyle = g;
      x.fillRect(0, 0, W, H);
    }

    // faint far-away stars
    for (let i = 0; i < 160; i++) {
      x.fillStyle = `rgba(255, 255, 255, ${0.2 + Math.random() * 0.5})`;
      x.fillRect(Math.random() * W, Math.random() * gy * 0.9, Math.random() < 0.85 ? 1 : 2, Math.random() < 0.85 ? 1 : 2);
    }

    // a ringed planet
    const pr = Math.min(W, H) * 0.07;
    const px = W * 0.87, py = H * 0.17;
    x.save();
    x.translate(px, py);
    x.rotate(-0.35);
    x.strokeStyle = 'rgba(255, 212, 59, .55)';
    x.lineWidth = pr * 0.18;
    x.beginPath();
    x.ellipse(0, 0, pr * 1.9, pr * 0.5, 0, Math.PI, Math.PI * 2); // back of the ring
    x.stroke();
    const pg = x.createRadialGradient(-pr * 0.4, -pr * 0.4, pr * 0.1, 0, 0, pr);
    pg.addColorStop(0, '#ffc078');
    pg.addColorStop(0.6, '#e8590c');
    pg.addColorStop(1, '#862e9c');
    x.fillStyle = pg;
    x.beginPath();
    x.arc(0, 0, pr, 0, Math.PI * 2);
    x.fill();
    x.beginPath();
    x.ellipse(0, 0, pr * 1.9, pr * 0.5, 0, 0, Math.PI); // front of the ring
    x.stroke();
    x.restore();

    // a little moon
    const mr = pr * 0.55, mx = W * 0.1, my = H * 0.1;
    const mg = x.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, mr * 0.1, mx, my, mr);
    mg.addColorStop(0, '#f8f9fa');
    mg.addColorStop(1, '#adb5bd');
    x.fillStyle = mg;
    x.beginPath();
    x.arc(mx, my, mr, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = 'rgba(134, 142, 150, .6)';
    for (const [cx, cy, cr] of [[-0.3, -0.1, 0.22], [0.25, 0.25, 0.16], [0.2, -0.35, 0.12]]) {
      x.beginPath();
      x.arc(mx + cx * mr, my + cy * mr, cr * mr, 0, Math.PI * 2);
      x.fill();
    }

    // far hills, then near hills
    const hills = (base, amp, freq, color, phase) => {
      x.fillStyle = color;
      x.beginPath();
      x.moveTo(0, H);
      for (let i = 0; i <= 40; i++) {
        const hx = (i / 40) * W;
        x.lineTo(hx, base - Math.sin(i / 40 * Math.PI * freq + phase) * amp - Math.sin(i / 40 * Math.PI * freq * 2.3) * amp * 0.4);
      }
      x.lineTo(W, H);
      x.fill();
    };
    hills(gy - this.R * 0.2, this.R * 0.6, 3, '#2b2a6b', 0.6);
    hills(gy + 4, this.R * 0.25, 5, '#1f6e43', 1.7);
    const ground = x.createLinearGradient(0, gy, 0, H);
    ground.addColorStop(0, '#2f9e44');
    ground.addColorStop(1, '#1b5e35');
    x.fillStyle = ground;
    x.fillRect(0, gy + 6, W, H - gy);

    // little houses with glowing windows
    const R = this.R;
    for (const h of MR_HOUSES) {
      const hw = R * 0.9 * h.w, hh = R * 0.6 * h.w;
      const hx = h.x * W - hw / 2, hy = gy + 6 - hh;
      x.fillStyle = h.body;
      x.fillRect(hx, hy, hw, hh);
      x.fillStyle = h.roof;
      x.beginPath();
      x.moveTo(hx - hw * 0.1, hy);
      x.lineTo(hx + hw / 2, hy - hh * 0.7);
      x.lineTo(hx + hw * 1.1, hy);
      x.fill();
      x.fillStyle = '#ffe066';
      const ws = hw * 0.2;
      x.fillRect(hx + hw * 0.18, hy + hh * 0.3, ws, ws);
      x.fillRect(hx + hw * 0.62, hy + hh * 0.3, ws, ws);
      x.fillStyle = '#5c3d2e';
      x.fillRect(hx + hw * 0.4, hy + hh * 0.5, hw * 0.2, hh * 0.5);
    }
    // a few round trees
    for (const tx of [0.14, 0.44, 0.56, 0.86]) {
      const r = R * 0.22;
      x.fillStyle = '#5c3d2e';
      x.fillRect(tx * W - r * 0.15, gy + 6 - r * 1.2, r * 0.3, r * 1.2);
      x.fillStyle = '#40c057';
      x.beginPath();
      x.arc(tx * W, gy + 6 - r * 1.5, r, 0, Math.PI * 2);
      x.fill();
    }
    this.backdrop = c;
  },

  draw() {
    // The play area can change size mid-game (answer buttons appearing, a long
    // question wrapping onto two lines, the window resizing). Re-measure so
    // the picture is never stretched or squished.
    if (this.wrap.clientWidth !== this.boxW || this.wrap.clientHeight !== this.boxH) this.resize();
    const { cx, W, H, R, t } = this;
    const gy = this.groundY;
    cx.clearRect(0, 0, W, H);
    cx.save();
    if (this.shakeT > 0) cx.translate((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);

    cx.drawImage(this.backdrop, 0, 0, W, H);

    // twinkling stars (the bright ones get a little sparkle cross)
    for (const s of this.twinkles) {
      const a = 0.45 + Math.sin(t * 2.2 + s.ph) * 0.4;
      const sx = s.x * W, sy = s.y * H;
      cx.fillStyle = `rgba(255, 255, 255, ${a})`;
      cx.beginPath();
      cx.arc(sx, sy, s.r, 0, Math.PI * 2);
      cx.fill();
      if (s.r > 2 && a > 0.7) {
        cx.fillRect(sx - s.r * 3, sy - 0.5, s.r * 6, 1);
        cx.fillRect(sx - 0.5, sy - s.r * 3, 1, s.r * 6);
      }
    }

    if (this.shooting) {
      const s = this.shooting, k = s.t / 0.8;
      const x1 = s.x + k * W * 0.35, y1 = s.y + k * H * 0.18;
      const g = cx.createLinearGradient(x1 - 80, y1 - 40, x1, y1);
      g.addColorStop(0, 'rgba(255, 255, 255, 0)');
      g.addColorStop(1, `rgba(255, 255, 255, ${1 - k})`);
      cx.strokeStyle = g;
      cx.lineWidth = 2;
      cx.beginPath();
      cx.moveTo(x1 - 80, y1 - 40);
      cx.lineTo(x1, y1);
      cx.stroke();
    }

    this.drawDome();

    // where each meteor will land (red and pulsing when it's close)
    for (const m of this.meteors) {
      const lx = m.lane * W;
      const danger = m.y > 0.7;
      const pulse = danger ? 0.5 + Math.sin(t * 12) * 0.5 : 0;
      cx.strokeStyle = danger ? `rgba(255, 107, 107, ${0.6 + pulse * 0.4})` : `rgba(255, 255, 255, ${0.15 + m.y * 0.35})`;
      cx.lineWidth = 2 + pulse * 2;
      cx.beginPath();
      cx.ellipse(lx, gy + 8, R * (0.6 + m.y * 0.4), R * 0.18, 0, 0, Math.PI * 2);
      cx.stroke();
    }

    this.drawTurret();

    // meteors, then everything glowing on top
    for (const m of this.meteors) this.drawMeteor(m);

    cx.globalCompositeOperation = 'lighter';
    for (const e of this.embers) {
      cx.fillStyle = `rgba(255, 169, 77, ${e.life / e.max})`;
      cx.beginPath();
      cx.arc(e.x, e.y, 2, 0, Math.PI * 2);
      cx.fill();
    }
    for (const l of this.lasers) {
      const a = 1 - l.t / 0.35;
      for (const [w, col] of [[16, `rgba(51, 154, 240, ${a * 0.35})`], [8, `rgba(102, 217, 232, ${a * 0.8})`], [3, `rgba(255, 255, 255, ${a})`]]) {
        cx.strokeStyle = col;
        cx.lineWidth = w;
        cx.lineCap = 'round';
        cx.beginPath();
        cx.moveTo(l.x1, l.y1);
        cx.lineTo(l.x2, l.y2);
        cx.stroke();
      }
    }
    for (const r of this.rings) {
      const k = r.t / r.dur;
      cx.strokeStyle = `rgba(255, 236, 153, ${1 - k})`;
      cx.lineWidth = 6 * (1 - k) + 1;
      cx.beginPath();
      cx.arc(r.x, r.y, r.max * k, 0, Math.PI * 2);
      cx.stroke();
    }
    for (const s of this.sparks) {
      cx.globalAlpha = Math.max(0, s.life / s.max);
      cx.fillStyle = s.color;
      cx.beginPath();
      cx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      cx.fill();
    }
    cx.globalAlpha = 1;
    cx.globalCompositeOperation = 'source-over';

    for (const d of this.debris) {
      cx.save();
      cx.translate(d.x, d.y);
      cx.rotate(d.rot);
      cx.globalAlpha = Math.min(1, d.life);
      cx.fillStyle = '#8d6e63';
      cx.fillRect(-d.size / 2, -d.size / 2, d.size, d.size * 0.8);
      cx.restore();
    }
    cx.globalAlpha = 1;

    if (this.banner) this.drawBanner();
    cx.restore();

    if (this.flashT > 0) {
      cx.fillStyle = `rgba(255, 80, 80, ${this.flashT * 0.8})`;
      cx.fillRect(0, 0, W, H);
    }
  },

  // The shield: a glowing bubble over the town that changes color as it weakens.
  drawDome() {
    const { cx, W, R, t } = this;
    const gy = this.groundY;
    const s = this.shields;
    const rgb = s >= 4 ? '102, 217, 232' : s >= 2 ? '255, 212, 59' : '255, 135, 135';
    const hit = Math.max(0, this.domeHitT) / 0.6;
    const flicker = hit > 0 ? 0.5 + Math.random() * 0.5 : 1;
    const rx = W * 0.52, ry = R * 2.6;
    const cxp = W / 2, cyp = gy + R * 0.2;

    const g = cx.createLinearGradient(0, cyp - ry, 0, cyp);
    g.addColorStop(0, `rgba(${rgb}, ${0.03 + 0.02 * s})`);
    g.addColorStop(1, `rgba(${rgb}, ${0.1 + 0.03 * s + hit * 0.3})`);
    cx.fillStyle = g;
    cx.beginPath();
    cx.ellipse(cxp, cyp, rx, ry, 0, Math.PI, 0);
    cx.fill();

    cx.save();
    cx.shadowColor = `rgba(${rgb}, .9)`;
    cx.shadowBlur = 14 + hit * 20;
    cx.strokeStyle = `rgba(${rgb}, ${(0.35 + 0.12 * s + hit) * flicker})`;
    cx.lineWidth = 3 + hit * 3;
    cx.beginPath();
    cx.ellipse(cxp, cyp, rx, ry, 0, Math.PI, 0);
    cx.stroke();
    cx.restore();

    // inner "energy" lines and a shimmer sweeping across
    cx.strokeStyle = `rgba(${rgb}, ${0.12 + 0.03 * s})`;
    cx.lineWidth = 1.5;
    for (const k of [0.75, 0.5]) {
      cx.beginPath();
      cx.ellipse(cxp, cyp, rx * k, ry * k, 0, Math.PI, 0);
      cx.stroke();
    }
    const sweep = Math.PI + ((t * 0.5) % 1) * Math.PI;
    cx.strokeStyle = `rgba(255, 255, 255, ${0.25 + 0.05 * s})`;
    cx.lineWidth = 3;
    cx.beginPath();
    cx.ellipse(cxp, cyp, rx, ry, 0, sweep, Math.min(Math.PI * 2, sweep + 0.25));
    cx.stroke();
  },

  // A friendly laser cannon: twin barrels on a blue dome (with a little
  // pilot in the window), sitting on a metal base with a glowing light strip.
  drawTurret() {
    const { cx, R, t } = this;
    const gy = this.groundY;
    const p = this.pivot();
    const kick = this.muzzleT > 0 ? (this.muzzleT / 0.15) * R * 0.3 : 0; // recoil
    const charge = this.charge;
    const glow = (0.35 + 0.65 * charge) * (0.85 + Math.sin(t * 5) * 0.15);

    // --- barrels (drawn first so the dome covers their roots) ---
    cx.save();
    cx.translate(p.x, p.y);
    cx.rotate(this.aim);
    const len = R * 1.5 - kick;
    for (const off of [-R * 0.13, R * 0.13]) {
      const g = cx.createLinearGradient(0, off - R * 0.08, 0, off + R * 0.08);
      g.addColorStop(0, '#f8f9fa');
      g.addColorStop(0.45, '#ced4da');
      g.addColorStop(1, '#495057');
      cx.fillStyle = g;
      cx.beginPath();
      cx.roundRect(R * 0.2, off - R * 0.08, len - R * 0.2, R * 0.16, R * 0.06);
      cx.fill();
      // glowing energy tip
      cx.fillStyle = `rgba(102, 217, 232, ${glow})`;
      cx.beginPath();
      cx.roundRect(len - R * 0.12, off - R * 0.09, R * 0.14, R * 0.18, R * 0.05);
      cx.fill();
    }
    // the block holding the barrels together, and cooling rings
    cx.fillStyle = '#3b5bdb';
    cx.beginPath();
    cx.roundRect(R * 0.35 - kick * 0.5, -R * 0.26, R * 0.42, R * 0.52, R * 0.1);
    cx.fill();
    cx.fillStyle = 'rgba(255, 255, 255, .35)';
    cx.fillRect(R * 0.4 - kick * 0.5, -R * 0.2, R * 0.32, R * 0.06);
    cx.fillStyle = '#364fc7';
    for (const k of [0.95, 1.18]) cx.fillRect(R * k - kick, -R * 0.24, R * 0.06, R * 0.48);

    // tips glow outward when charged
    cx.globalCompositeOperation = 'lighter';
    const tg = cx.createRadialGradient(len, 0, 0, len, 0, R * 0.45);
    tg.addColorStop(0, `rgba(102, 217, 232, ${0.55 * glow})`);
    tg.addColorStop(1, 'rgba(102, 217, 232, 0)');
    cx.fillStyle = tg;
    cx.beginPath();
    cx.arc(len, 0, R * 0.45, 0, Math.PI * 2);
    cx.fill();

    // muzzle flash: a bright star burst
    if (this.muzzleT > 0) {
      const f = this.muzzleT / 0.15;
      const fx = R * 1.55;
      const fg = cx.createRadialGradient(fx, 0, 0, fx, 0, R * 0.9 * f + R * 0.2);
      fg.addColorStop(0, 'rgba(255, 255, 255, 1)');
      fg.addColorStop(0.3, 'rgba(165, 216, 255, .8)');
      fg.addColorStop(1, 'rgba(102, 217, 232, 0)');
      cx.fillStyle = fg;
      cx.beginPath();
      cx.arc(fx, 0, R * 0.9 * f + R * 0.2, 0, Math.PI * 2);
      cx.fill();
      cx.strokeStyle = `rgba(255, 255, 255, ${f})`;
      cx.lineWidth = 3;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + t * 8;
        cx.beginPath();
        cx.moveTo(fx + Math.cos(a) * R * 0.15, Math.sin(a) * R * 0.15);
        cx.lineTo(fx + Math.cos(a) * R * 0.7 * f, Math.sin(a) * R * 0.7 * f);
        cx.stroke();
      }
    }
    cx.globalCompositeOperation = 'source-over';
    cx.restore();

    // --- dome ---
    const dr = R * 0.62;
    const dg = cx.createRadialGradient(p.x - dr * 0.4, p.y - dr * 0.5, dr * 0.1, p.x, p.y, dr * 1.1);
    dg.addColorStop(0, '#e7f5ff');
    dg.addColorStop(0.45, '#4dabf7');
    dg.addColorStop(1, '#1864ab');
    cx.fillStyle = dg;
    cx.beginPath();
    cx.arc(p.x, p.y + R * 0.1, dr, Math.PI, 0);
    cx.closePath();
    cx.fill();

    // cockpit window with a tiny pilot
    const wx = p.x, wy = p.y - dr * 0.25, wr = dr * 0.42;
    cx.save();
    cx.beginPath();
    cx.arc(wx, wy, wr, 0, Math.PI * 2);
    cx.clip();
    const wg = cx.createLinearGradient(0, wy - wr, 0, wy + wr);
    wg.addColorStop(0, '#1c2c5b');
    wg.addColorStop(1, '#3b5bdb');
    cx.fillStyle = wg;
    cx.fillRect(wx - wr, wy - wr, wr * 2, wr * 2);
    cx.textAlign = 'center';
    cx.textBaseline = 'middle';
    cx.font = `${wr * 1.5}px serif`;
    cx.fillText('🧑‍🚀', wx, wy + wr * 0.2 + (this.muzzleT > 0 ? 2 : 0));
    cx.fillStyle = 'rgba(255, 255, 255, .35)'; // glass shine
    cx.beginPath();
    cx.ellipse(wx - wr * 0.35, wy - wr * 0.45, wr * 0.35, wr * 0.18, -0.6, 0, Math.PI * 2);
    cx.fill();
    cx.restore();
    cx.strokeStyle = '#adb5bd';
    cx.lineWidth = 3;
    cx.beginPath();
    cx.arc(wx, wy, wr, 0, Math.PI * 2);
    cx.stroke();

    // --- base: a metal platform with rivets and a glowing light strip ---
    const top = p.y + R * 0.1, bottom = gy + 8;
    const bw = R * 1.05, tw = R * 0.8;
    const bg = cx.createLinearGradient(0, top, 0, bottom);
    bg.addColorStop(0, '#adb5bd');
    bg.addColorStop(1, '#495057');
    cx.fillStyle = bg;
    cx.beginPath();
    cx.moveTo(p.x - tw, top);
    cx.lineTo(p.x + tw, top);
    cx.lineTo(p.x + bw, bottom);
    cx.lineTo(p.x - bw, bottom);
    cx.closePath();
    cx.fill();
    cx.fillStyle = '#343a40';
    cx.fillRect(p.x - tw, top, tw * 2, R * 0.06);

    const sy = top + (bottom - top) * 0.45;
    cx.save();
    cx.shadowColor = '#66d9e8';
    cx.shadowBlur = 10 * charge;
    cx.fillStyle = `rgba(102, 217, 232, ${0.4 + 0.6 * charge})`;
    cx.beginPath();
    cx.roundRect(p.x - tw * 0.8, sy, tw * 1.6, R * 0.08, R * 0.04);
    cx.fill();
    cx.restore();

    cx.fillStyle = '#dee2e6';
    for (const k of [-0.75, -0.25, 0.25, 0.75]) {
      cx.beginPath();
      cx.arc(p.x + k * bw * 0.9, bottom - R * 0.1, R * 0.035, 0, Math.PI * 2);
      cx.fill();
    }
  },

  drawMeteor(m) {
    const { cx, R, t } = this;
    const { x, y } = this.meteorPos(m);
    const heat = m.y; // glows hotter as it gets closer

    // heat glow
    const halo = cx.createRadialGradient(x, y, R * 0.6, x, y, R * (1.6 + heat * 0.6));
    halo.addColorStop(0, `rgba(255, 146, 43, ${0.35 + heat * 0.3})`);
    halo.addColorStop(1, 'rgba(255, 146, 43, 0)');
    cx.fillStyle = halo;
    cx.beginPath();
    cx.arc(x, y, R * (1.6 + heat * 0.6), 0, Math.PI * 2);
    cx.fill();

    // flickering fire tail (drawn additively so it glows)
    cx.globalCompositeOperation = 'lighter';
    for (const [len, wid, col] of [[3.4, 0.95, '255, 107, 107'], [2.8, 0.7, '255, 169, 77'], [2, 0.45, '255, 236, 153']]) {
      const flick = Math.sin(t * 18 + len) * R * 0.15;
      const g = cx.createLinearGradient(x, y - R * len, x, y);
      g.addColorStop(0, `rgba(${col}, 0)`);
      g.addColorStop(1, `rgba(${col}, .75)`);
      cx.fillStyle = g;
      cx.beginPath();
      cx.moveTo(x - R * wid, y);
      cx.quadraticCurveTo(x - R * wid * 0.4 + flick, y - R * len * 0.6, x + flick, y - R * len);
      cx.quadraticCurveTo(x + R * wid * 0.4 + flick, y - R * len * 0.6, x + R * wid, y);
      cx.fill();
    }
    cx.globalCompositeOperation = 'source-over';

    // the lumpy rock, lit from the top left
    cx.save();
    cx.translate(x, y);
    cx.rotate(m.spin);
    const rock = cx.createRadialGradient(-R * 0.35, -R * 0.35, R * 0.1, 0, 0, R * 1.05);
    rock.addColorStop(0, '#bcaaa4');
    rock.addColorStop(0.55, '#8d6e63');
    rock.addColorStop(1, '#4e342e');
    cx.fillStyle = rock;
    cx.beginPath();
    m.shape.forEach((k, i) => {
      const a = (i / m.shape.length) * Math.PI * 2;
      const px = Math.cos(a) * R * k, py = Math.sin(a) * R * k;
      if (i === 0) cx.moveTo(px, py); else cx.lineTo(px, py);
    });
    cx.closePath();
    cx.fill();
    cx.strokeStyle = `rgba(255, 146, 43, ${0.4 + heat * 0.5})`; // hot rim
    cx.lineWidth = 2;
    cx.stroke();
    for (const c of m.craters) {
      const ccx = Math.cos(c.a) * R * c.d, ccy = Math.sin(c.a) * R * c.d;
      cx.fillStyle = 'rgba(62, 39, 35, .55)';
      cx.beginPath();
      cx.arc(ccx, ccy, R * c.r, 0, Math.PI * 2);
      cx.fill();
      cx.strokeStyle = 'rgba(215, 204, 200, .35)';
      cx.lineWidth = 1.5;
      cx.beginPath();
      cx.arc(ccx, ccy, R * c.r, Math.PI * 0.9, Math.PI * 1.9);
      cx.stroke();
    }
    cx.restore();

    // the problem, on a label so it's easy to read
    const text = m.p.text;
    cx.font = `800 ${R * 0.52}px 'Baloo 2', sans-serif`;
    cx.textAlign = 'center';
    cx.textBaseline = 'middle';
    const w = cx.measureText(text).width + R * 0.5;
    cx.save();
    cx.shadowColor = 'rgba(0, 0, 0, .4)';
    cx.shadowBlur = 8;
    cx.shadowOffsetY = 3;
    cx.fillStyle = 'rgba(255, 255, 255, .96)';
    cx.beginPath();
    cx.roundRect(x - w / 2, y - R * 0.38, w, R * 0.76, R * 0.38);
    cx.fill();
    cx.restore();
    cx.strokeStyle = m.y > 0.7 ? '#ff6b6b' : '#ffa94d';
    cx.lineWidth = 3;
    cx.beginPath();
    cx.roundRect(x - w / 2, y - R * 0.38, w, R * 0.76, R * 0.38);
    cx.stroke();
    cx.fillStyle = '#2b2d42';
    cx.fillText(text, x, y + R * 0.03);
  },

  drawBanner() {
    const { cx, W, H } = this;
    const b = this.banner;
    const k = b.t;
    const scale = k < 0.3 ? 0.5 + (k / 0.3) * 0.6 : k < 0.45 ? 1.1 - ((k - 0.3) / 0.15) * 0.1 : 1;
    const alpha = k > 1.4 ? Math.max(0, 1 - (k - 1.4) / 0.4) : 1;
    cx.save();
    cx.globalAlpha = alpha;
    cx.translate(W / 2, H * 0.38);
    cx.scale(scale, scale);
    cx.font = `800 ${Math.min(W * 0.14, 84)}px 'Baloo 2', sans-serif`;
    cx.textAlign = 'center';
    cx.textBaseline = 'middle';
    cx.lineWidth = 10;
    cx.strokeStyle = '#3b2470';
    cx.strokeText(b.text, 0, 0);
    const g = cx.createLinearGradient(0, -40, 0, 40);
    g.addColorStop(0, '#ffe066');
    g.addColorStop(1, '#ff922b');
    cx.fillStyle = g;
    cx.fillText(b.text, 0, 0);
    cx.restore();
  }
});
