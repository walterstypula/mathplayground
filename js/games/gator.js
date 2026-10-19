'use strict';

// The gator always eats the bigger number — then turns into > or <.
const GATOR_RANGE = { 4: [1, 5], 5: [1, 10], 6: [1, 20], 7: [10, 99], 8: [100, 999] };

App.register({
  id: 'gator',
  name: 'Hungry Gator',
  icon: '🐊',
  color: '#12b886',
  desc: 'The gator always eats the BIGGER number!',

  start(stage) {
    stage.innerHTML = `
      <div class="prompt">Feed the gator the <b>BIGGER</b> one!</div>
      <div class="gator-row">
        <button class="num-card" id="gL"></button>
        <div class="gator" id="gG">🐊</div>
        <button class="num-card" id="gR"></button>
      </div>`;
    this.cards = { L: stage.querySelector('#gL'), R: stage.querySelector('#gR') };
    this.gator = stage.querySelector('#gG');
    this.cards.L.addEventListener('click', () => this.choose('L'));
    this.cards.R.addEventListener('click', () => this.choose('R'));
    this.next();
  },

  stop() {},

  makePair() {
    const age = App.age;
    if (age === 9) {
      // Compare two little math problems.
      let p, q;
      do { p = makeProblem(9); q = makeProblem(9); } while (p.answer === q.answer);
      return [p, q].map(x => ({ label: x.text, v: x.answer, speech: problemSpeech(x) }));
    }
    const [lo, hi] = GATOR_RANGE[age];
    const a = rand(lo, hi);
    let b;
    if (age >= 7 && Math.random() < 0.5) {
      // close numbers are trickier
      do { b = a + rand(-9, 9); } while (b === a || b < lo || b > hi);
    } else {
      do { b = rand(lo, hi); } while (b === a);
    }
    return [a, b].map(v => ({ label: String(v), v, speech: String(v), dots: age <= 5 }));
  },

  next() {
    this.done = false;
    const [L, R] = this.makePair();
    this.vals = { L, R };
    for (const side of ['L', 'R']) {
      const d = this.vals[side];
      const card = this.cards[side];
      card.className = 'num-card' + (d.label.length > 5 ? ' small-text' : '');
      card.innerHTML = `<span>${d.label}</span>` +
        (d.dots ? `<span class="dots">${'<i class="dot"></i>'.repeat(d.v)}</span>` : '');
    }
    this.gator.className = 'gator';
    this.gator.textContent = '🐊';
    App.setSay(`Which is bigger? ${L.speech}, or ${R.speech}?`);
  },

  choose(side) {
    if (this.done) return;
    const me = this.vals[side];
    const other = this.vals[side === 'L' ? 'R' : 'L'];
    const card = this.cards[side];
    if (me.v > other.v) {
      this.done = true;
      this.gator.classList.add(side === 'L' ? 'eat-left' : 'eat-right');
      Sound.chomp();
      card.classList.add('bitten');
      const r = card.getBoundingClientRect();
      App.correct(r.left + r.width / 2, r.top + r.height / 2);
      // The open mouth points at the bigger number: 7 > 3
      App.later(() => {
        this.gator.className = 'gator sym';
        this.gator.textContent = side === 'L' ? '>' : '<';
      }, 450);
      App.later(() => this.next(), 2000);
    } else {
      shake(card);
      App.wrong();
    }
  }
});
