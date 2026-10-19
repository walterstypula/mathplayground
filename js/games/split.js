'use strict';

// Cut a block tower into the right pieces.
// Ages 4-6: "Split 7 to make a 4!", then "7 = 4 + ?".
// Ages 7-9: "Share 12 into 3 equal towers!" (choose how big each tower is).
// Choosing where to cut is free; pressing Cut commits. A wrong cut costs a heart.
const SPLIT_A = '#339af0';
const SPLIT_B = '#ff922b';
const SPLIT_LEFTOVER = '#adb5bd';

App.register({
  id: 'split',
  name: 'Split It!',
  icon: '✂️',
  color: '#7048e8',
  desc: 'Cut a block tower into just the right pieces!',

  start(stage) {
    stage.innerHTML = `
      <div class="fc-top">
        <div class="problem bb-goal" id="spGoal"></div>
        <div class="pill" id="spHearts"></div>
      </div>
      <div class="sp-area" id="spArea"></div>
      <div class="answers" id="spAns"></div>
      <div class="bb-bar"><button class="ans-btn sp-cut" id="spCut">Cut ✂️</button></div>
      <div class="hint">Tap a block to choose where to cut, then press Cut · Arrow keys + Space work too</div>`;
    this.goalEl = stage.querySelector('#spGoal');
    this.heartsEl = stage.querySelector('#spHearts');
    this.area = stage.querySelector('#spArea');
    this.ans = stage.querySelector('#spAns');
    this.cutBtn = stage.querySelector('#spCut');
    this.cutBtn.addEventListener('click', () => this.doCut());

    this.onKey = (e) => {
      if (this.phase !== 'cut') return;
      const k = e.key;
      if (k === ' ' || k === 'Enter') {
        e.preventDefault();
        if (!e.repeat) this.doCut();
      } else if (k === 'ArrowUp' || k === 'ArrowRight' || k === 'w' || k === 'd') {
        e.preventDefault();
        this.setCut(this.cut + 1);
      } else if (k === 'ArrowDown' || k === 'ArrowLeft' || k === 's' || k === 'a') {
        e.preventDefault();
        this.setCut(this.cut - 1);
      }
    };
    addEventListener('keydown', this.onKey);
    this.onResize = () => { if (this.phase === 'cut') this.render(); };
    addEventListener('resize', this.onResize);
    this.next();
  },

  stop() {
    removeEventListener('keydown', this.onKey);
    removeEventListener('resize', this.onResize);
  },

  next() {
    const age = App.age;
    this.hearts = 3;
    this.phase = 'cut';
    this.ans.innerHTML = '';
    this.cutBtn.hidden = false;

    if (age <= 6 || (age === 7 && Math.random() < 0.3)) {
      // number bonds: split N into "want" and the rest
      this.mode = 'bond';
      const max = { 4: 5, 5: 8, 6: 10, 7: 10 }[age];
      this.N = rand(age === 4 ? 3 : 4, max);
      this.want = rand(1, this.N - 1);
      this.cut = Math.ceil(this.N / 2);
      this.goalEl.textContent = `Split ${this.N} to make a ${this.want}!`;
      App.setSay(`Split ${this.N} to make a ${this.want}!`);
    } else {
      // sharing: N cubes into g equal towers of size s
      this.mode = 'share';
      this.groups = rand(2, age === 7 ? 3 : 5);
      this.size = rand(2, age === 7 ? 5 : age === 8 ? 6 : 8);
      this.N = this.groups * this.size;
      this.cut = 1;
      this.goalEl.textContent = `Share ${this.N} into ${this.groups} equal towers!`;
      App.setSay(`Share ${this.N} blocks into ${this.groups} equal towers!`);
    }
    this.render();
  },

  // Make the cubes as big as the play area allows.
  fitCubes(kind, pieces) {
    const W = this.area.clientWidth;
    const H = this.area.clientHeight;
    let c;
    if (kind === 'tower') {
      c = Math.min(W * 0.3, (H - 30) / this.N - 3);           // one column, plus the cut gap
    } else if (kind === 'row') {
      const rows = Math.ceil(this.N / 10);
      c = Math.min((W - 9 * 4) / 10, (H - 20) / rows - 4);     // rows of ten
    } else {
      const tallest = Math.min(10, Math.max(...pieces.sizes));
      const across = pieces.sizes.length;
      c = Math.min((H * 0.85 - (pieces.labels ? 50 : 10)) / tallest - 2, (W - (across - 1) * 24) / across - 4);
    }
    c = Math.max(18, Math.min(96, Math.floor(c)));
    this.area.style.setProperty('--cube', `${c}px`);
  },

  setCut(k) {
    const c = Math.max(1, Math.min(this.N - 1, k));
    if (c === this.cut) return;
    this.cut = c;
    Sound.click(c % 6);
    this.render();
  },

  render() {
    this.heartsEl.textContent = heartsText(this.hearts);
    this.area.innerHTML = ''; // empty first, so we measure the space, not the old tower
    if (this.mode === 'bond') { this.fitCubes('tower'); this.renderTower(); }
    else { this.fitCubes('row'); this.renderRow(); }
  },

  // One tall tower; the scissors sit in the gap above the bottom piece.
  renderTower() {
    const tower = document.createElement('div');
    tower.className = 'sp-tower';
    for (let i = 0; i < this.N; i++) {
      if (i === this.cut) {
        const gap = document.createElement('div');
        gap.className = 'sp-gap';
        gap.innerHTML = '<span>✂️</span>';
        tower.appendChild(gap);
      }
      const q = document.createElement('button');
      q.className = 'cube sp-cube' + (i === this.N - 1 ? ' face' : '');
      q.style.background = i < this.cut ? SPLIT_A : SPLIT_B;
      q.setAttribute('aria-label', `cut above block ${i + 1}`);
      q.addEventListener('click', () => this.phase === 'cut' && this.setCut(i + 1));
      tower.appendChild(q);
    }
    this.area.appendChild(tower);
  },

  // A row of cubes colored into groups of `cut`; leftovers are grey.
  renderRow() {
    const row = document.createElement('div');
    row.className = 'sp-row';
    const full = Math.floor(this.N / this.cut) * this.cut;
    for (let i = 0; i < this.N; i++) {
      const q = document.createElement('button');
      q.className = 'cube sp-cube';
      const group = Math.floor(i / this.cut);
      q.style.background = i >= full ? SPLIT_LEFTOVER : group % 2 ? SPLIT_B : SPLIT_A;
      if (i % this.cut === 0 && i > 0 && i < full + 1) q.classList.add('sp-newgroup');
      q.setAttribute('aria-label', `towers of ${i + 1}`);
      q.addEventListener('click', () => this.phase === 'cut' && this.setCut(i + 1));
      row.appendChild(q);
    }
    this.area.appendChild(row);
  },

  // Show the pieces standing up as separate buddies.
  showPieces(sizes, labels) {
    this.area.innerHTML = '';
    this.fitCubes('pieces', { sizes, labels });
    const box = document.createElement('div');
    box.className = 'sp-pieces';
    sizes.forEach((s, i) => {
      const color = this.mode === 'bond' ? (i === 0 ? SPLIT_A : SPLIT_B) : (i % 2 ? SPLIT_B : SPLIT_A);
      const el = buddyEl([[s, color]], { label: labels });
      el.classList.add('sp-piece');
      el.style.animationDelay = `${i * 0.08}s`;
      box.appendChild(el);
    });
    this.area.appendChild(box);
  },

  doCut() {
    if (this.phase !== 'cut') return;
    if (this.mode === 'bond') this.cutBond();
    else this.cutShare();
  },

  cutBond() {
    const bottom = this.cut, top = this.N - this.cut;
    if (bottom === this.want || top === this.want) {
      // Good cut! Now: N = want + ?
      Sound.pop();
      this.phase = 'answer';
      this.cutBtn.hidden = true;
      const other = this.N - this.want;
      this.showPieces(bottom === this.want ? [bottom, top] : [top, bottom], false);
      this.goalEl.textContent = `${this.N} = ${this.want} + ?`;
      App.setSay(`${this.N} is ${this.want} and how many more?`);
      const choices = new Set([other]);
      for (const d of [...shuffle([-1, 1, 2, -2]), 3, 4]) {
        if (choices.size >= 3) break;
        if (other + d >= 1) choices.add(other + d);
      }
      renderAnswers(this.ans, shuffle([...choices]), other, () => {
        this.phase = 'done';
        this.goalEl.textContent = `${this.N} = ${this.want} + ${other} 🎉`;
        App.later(() => this.next(), 1800);
      });
    } else {
      this.wrongCut(`That makes ${bottom} and ${top}. We need a ${this.want}!`);
    }
  },

  cutShare() {
    const k = this.cut;
    const towers = Math.floor(this.N / k), left = this.N % k;
    if (!left && towers === this.groups) {
      this.phase = 'done';
      this.cutBtn.hidden = true;
      Sound.pop();
      this.showPieces(Array(towers).fill(k), true);
      this.goalEl.textContent = `${this.N} ÷ ${this.groups} = ${k} 🎉`;
      const r = this.area.getBoundingClientRect();
      App.correct(r.left + r.width / 2, r.top + r.height / 2);
      App.later(() => this.next(), 2200);
    } else {
      this.wrongCut(left
        ? `That makes ${towers} towers of ${k} with ${left} left over!`
        : `That makes ${towers} towers. We need ${this.groups}!`);
    }
  },

  wrongCut(msg) {
    this.hearts--;
    Sound.bad();
    toast(msg, 2200);
    shake(this.area);
    this.heartsEl.textContent = heartsText(this.hearts);
    if (this.hearts > 0) return;

    // Out of hearts: show the right cut, then move on (no star).
    this.phase = 'done';
    this.cutBtn.hidden = true;
    App.later(() => {
      if (this.mode === 'bond') {
        this.showPieces([this.want, this.N - this.want], true);
        this.goalEl.textContent = `${this.N} = ${this.want} + ${this.N - this.want}`;
        say(`${this.N} is ${this.want} and ${this.N - this.want}`);
      } else {
        this.showPieces(Array(this.groups).fill(this.size), true);
        this.goalEl.textContent = `${this.N} ÷ ${this.groups} = ${this.size}`;
        say(`${this.N} shared into ${this.groups} is ${this.size} each`);
      }
    }, 900);
    App.later(() => this.next(), 3500);
  }
});
