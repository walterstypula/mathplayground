'use strict';

// Count the critters (tap each one to help count), then pick the number.
const COUNT_THINGS = [
  ['🐞', 'ladybugs'], ['🍎', 'apples'], ['🐟', 'fish'], ['⭐', 'stars'], ['🦆', 'ducks'],
  ['🍓', 'strawberries'], ['🐝', 'bees'], ['🌸', 'flowers'], ['🚗', 'cars'], ['🧁', 'cupcakes'],
  ['🐢', 'turtles'], ['🎈', 'balloons']
];
const COUNT_RANGE = { 4: [1, 5], 5: [3, 10], 6: [5, 15], 7: [8, 20], 8: [12, 30], 9: [15, 40] };

App.register({
  id: 'count',
  name: 'Count It!',
  icon: '🐞',
  color: '#ff922b',
  desc: 'Count the critters and pick the number.',

  start(stage) {
    stage.innerHTML = `
      <div class="prompt" id="ctQ"></div>
      <div class="count-field" id="ctField"></div>
      <div class="answers" id="ctAns"></div>`;
    this.q = stage.querySelector('#ctQ');
    this.field = stage.querySelector('#ctField');
    this.ans = stage.querySelector('#ctAns');
    this.next();
  },

  stop() {},

  next() {
    const n = rand(...COUNT_RANGE[App.age]);
    const [emoji, name] = pick(COUNT_THINGS);
    this.tapped = 0;
    this.q.textContent = `How many ${name}? Tap each one to count!`;
    App.setSay(`How many ${name}?`);

    this.field.innerHTML = '';
    this.field.style.setProperty('--ts', n <= 10 ? '3rem' : n <= 20 ? '2.4rem' : '1.9rem');
    let group;
    for (let i = 0; i < n; i++) {
      // groups of 5 make big numbers easier (count by fives!)
      if (i % 5 === 0) {
        group = document.createElement('div');
        group.className = 'group';
        this.field.appendChild(group);
      }
      const t = document.createElement('button');
      t.className = 'thing';
      t.textContent = emoji;
      t.addEventListener('click', () => this.mark(t));
      group.appendChild(t);
    }

    renderAnswers(this.ans, makeChoices(n, App.age <= 5 ? 3 : 4), n, () => {
      App.later(() => this.next(), 1300);
    });
  },

  mark(t) {
    if (t.classList.contains('counted')) return;
    this.tapped++;
    t.classList.add('counted');
    const badge = document.createElement('span');
    badge.className = 'num';
    badge.textContent = this.tapped;
    t.appendChild(badge);
    Sound.click(this.tapped);
    if (App.age <= 6) say(String(this.tapped));
  }
});
