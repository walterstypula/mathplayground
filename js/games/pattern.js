'use strict';

// What comes next? Picture patterns for little ones, number patterns for bigger kids.
const PATTERN_SETS = [
  ['🍎', '🍌', '🍇'], ['🐶', '🐱', '🐭'], ['🔴', '🔵', '🟡'], ['⭐', '🌙', '☀️'],
  ['🚗', '🚌', '🚲'], ['🟥', '🟩', '🟦'], ['🐸', '🐟', '🐢']
];

App.register({
  id: 'pattern',
  name: 'Pattern Train',
  icon: '🚂',
  color: '#845ef7',
  desc: 'What comes next? Finish the pattern!',

  start(stage) {
    stage.innerHTML = `
      <div class="prompt">What comes next?</div>
      <div class="train" id="ptTrain"></div>
      <div class="answers" id="ptAns"></div>`;
    this.train = stage.querySelector('#ptTrain');
    this.ans = stage.querySelector('#ptAns');
    this.next();
  },

  stop() {},

  picturePattern() {
    const types = App.age <= 4 ? ['AB', 'AAB', 'ABB'] : ['AB', 'AAB', 'ABB', 'ABC', 'AABB'];
    const set = shuffle(pick(PATTERN_SETS).slice());
    const unit = [...pick(types)].map(ch => set[ch.charCodeAt(0) - 65]);
    const len = unit.length * 2 + rand(0, unit.length - 1); // at least two full repeats
    const seq = Array.from({ length: len }, (_, i) => unit[i % unit.length]);
    return { seq, answer: unit[len % unit.length], options: set, numbers: false };
  },

  numberPattern() {
    const age = App.age;
    let start, step, double = false;
    if (age <= 6) { step = pick([1, 2]); start = rand(0, age === 6 ? 10 : 5); }
    else if (age === 7) { step = pick([2, 5, 10]); start = rand(0, 10) * step; }
    else if (age === 8) { step = rand(2, 10); start = rand(0, 50); }
    else if (Math.random() < 0.3) { double = true; start = rand(1, 5); }
    else { step = rand(3, 12); start = rand(0, 100); }

    // Older kids sometimes count backwards (only when it stays above zero).
    if (!double && age >= 7 && Math.random() < 0.3 && start - step * 5 >= 0) step = -step;

    const seq = [start];
    for (let i = 1; i < 6; i++) seq.push(double ? seq[i - 1] * 2 : seq[i - 1] + step);
    const answer = seq.pop();
    return { seq, answer, options: makeChoices(answer, App.age <= 5 ? 3 : 4), numbers: true };
  },

  next() {
    const age = App.age;
    const useNumbers = age >= 7 || (age === 6 && Math.random() < 0.5) || (age === 5 && Math.random() < 0.25);
    const p = useNumbers ? this.numberPattern() : this.picturePattern();

    this.train.className = 'train';
    this.train.innerHTML = '<div class="engine">🚂</div>';
    p.seq.forEach((item, i) => {
      const car = document.createElement('div');
      car.className = 'car' + (p.numbers ? ' numcar' : '');
      car.style.setProperty('--c', COLORS[i % COLORS.length]);
      car.textContent = item;
      this.train.appendChild(car);
    });
    const mystery = document.createElement('div');
    mystery.className = 'car mystery' + (p.numbers ? ' numcar' : '');
    mystery.textContent = '?';
    this.train.appendChild(mystery);

    App.setSay(p.numbers ? `${p.seq.join(', ')}. What comes next?` : 'What comes next?');

    renderAnswers(this.ans, p.options, p.answer, () => {
      mystery.textContent = p.answer;
      mystery.className = 'car reveal' + (p.numbers ? ' numcar' : '');
      mystery.style.setProperty('--c', COLORS[p.seq.length % COLORS.length]);
      App.later(() => { Sound.tone(330, 0.3, 'sawtooth', 0, 0.05); this.train.classList.add('go'); }, 600);
      App.later(() => this.next(), 1800);
    });
  }
});
