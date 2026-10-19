'use strict';

// A little toy shop. Pay with exactly the right coins, or (for big kids)
// work out the change from a dollar. Paying the wrong amount sends the
// coins back to your purse so you can count again.
const SHOP_TOYS = [
  ['🧸', 'teddy bear'], ['🪀', 'yo-yo'], ['⚽', 'ball'], ['🚂', 'train'], ['🪁', 'kite'], ['🦖', 'dinosaur'],
  ['🚗', 'car'], ['🎨', 'paint set'], ['🧩', 'puzzle'], ['🦄', 'unicorn'], ['🛹', 'skateboard'], ['🤖', 'robot']
];
const SHOP_COINS = { 4: [1], 5: [1, 5], 6: [1, 5, 10], 7: [1, 5, 10, 25], 8: [1, 5, 10, 25], 9: [1, 5, 10, 25] };
const SHOP_PRICES = { 4: [2, 6], 5: [5, 15], 6: [10, 40], 7: [25, 99], 8: [30, 99], 9: [50, 99] };
const money = (v) => (v >= 100 ? `$${(v / 100).toFixed(2)}` : `${v}¢`);

App.register({
  id: 'shop',
  name: 'Toy Shop',
  icon: '🛒',
  color: '#0c8599',
  desc: 'Pay for toys with coins and count your change!',

  start(stage) {
    this.stage = stage;
    this.next();
  },

  stop() {},

  next() {
    const age = App.age;
    const changeRound = age === 9 ? Math.random() < 0.7 : age === 8 ? Math.random() < 0.5 : false;
    if (changeRound) this.changeRound();
    else this.payRound();
  },

  /* ---------- pay with exact coins ---------- */

  payRound() {
    const age = App.age;
    const [toy, name] = pick(SHOP_TOYS);
    this.price = rand(...SHOP_PRICES[age]);
    this.tray = [];
    this.done = false;
    this.showTotal = age <= 5; // little ones see the running total; bigger kids count it themselves

    this.stage.innerHTML = `
      <div class="shop">
        <div class="shelf"><div class="toy" id="shToy">${toy}<span class="price-tag">${money(this.price)}</span></div></div>
        <div class="prompt">Pay exactly ${money(this.price)} for the ${name}</div>
        <div class="tray" id="shTray"></div>
        <div class="tray-total" id="shTotal"></div>
        <div class="purse" id="shPurse"></div>
        <button class="ans-btn pay-btn" id="shPay">Pay 💰</button>
      </div>`;
    this.toyEl = this.stage.querySelector('#shToy');
    this.trayEl = this.stage.querySelector('#shTray');
    this.totalEl = this.stage.querySelector('#shTotal');
    const purse = this.stage.querySelector('#shPurse');
    SHOP_COINS[age].forEach(c => purse.appendChild(this.coin(c, () => this.addCoin(c))));
    this.stage.querySelector('#shPay').addEventListener('click', e => this.pay(e.currentTarget));
    this.renderTray();
    App.setSay(`The ${name} costs ${this.price} ${this.price === 1 ? 'cent' : 'cents'}. Pay with coins.`);
  },

  coin(value, onClick) {
    const b = document.createElement('button');
    b.className = `coin c${value}`;
    b.textContent = money(value);
    b.setAttribute('aria-label', `${value} cent coin`);
    b.addEventListener('click', onClick);
    return b;
  },

  addCoin(c) {
    if (this.done || this.tray.length >= 20) return;
    this.tray.push(c);
    Sound.click(c >= 10 ? 4 : 0);
    this.renderTray();
  },

  renderTray() {
    this.trayEl.innerHTML = '';
    this.tray.forEach((c, i) => {
      // tap a coin in the tray to take it back
      this.trayEl.appendChild(this.coin(c, () => {
        if (this.done) return;
        this.tray.splice(i, 1);
        Sound.click();
        this.renderTray();
      }));
    });
    const sum = this.tray.reduce((a, b) => a + b, 0);
    if (this.showTotal) this.totalEl.textContent = `You put in ${money(sum)}`;
    else this.totalEl.textContent = this.tray.length ? 'Count your coins, then pay!' : '';
  },

  pay(btn) {
    if (this.done) return;
    const sum = this.tray.reduce((a, b) => a + b, 0);
    if (!this.tray.length) { toast('Put some coins in first!', 1200); return; }
    if (sum === this.price) {
      this.done = true;
      const r = btn.getBoundingClientRect();
      App.correct(r.left + r.width / 2, r.top);
      this.toyEl.classList.add('bought');
      App.later(() => this.next(), 1700);
    } else {
      // Wrong amount: the coins go back in your purse, count again.
      Sound.bad();
      toast(sum < this.price
        ? `Not enough! That's ${money(sum)}, it costs ${money(this.price)}`
        : `Too much! That's ${money(sum)}, it costs ${money(this.price)}`, 2400);
      shake(this.trayEl);
      this.tray = [];
      App.later(() => this.renderTray(), 400);
    }
  },

  /* ---------- work out the change ---------- */

  changeRound() {
    const age = App.age;
    const items = [];
    if (age === 9) {
      // two toys, pay with a dollar
      const a = rand(2, 10) * 5;
      const b = rand(1, Math.min(8, (95 - a) / 5)) * 5;
      const [t1, t2] = shuffle(SHOP_TOYS.slice()).slice(0, 2);
      items.push([t1, a], [t2, b]);
    } else {
      items.push([pick(SHOP_TOYS), rand(1, 19) * 5]);
    }
    const total = items.reduce((s, [, p]) => s + p, 0);
    const answer = 100 - total;
    this.done = false;

    const what = items.length === 1
      ? `The ${items[0][0][1]} costs ${money(total)}.`
      : `${money(items[0][1])} + ${money(items[1][1])} = ?`;
    this.stage.innerHTML = `
      <div class="shop">
        <div class="shelf">${items.map(([[e], p]) => `<div class="toy">${e}<span class="price-tag">${money(p)}</span></div>`).join('')}</div>
        <div class="prompt">${what} You pay with <span class="bill">💵 $1.00</span><br>How much change do you get?</div>
        <div class="answers" id="shAns"></div>
      </div>`;
    const box = this.stage.querySelector('#shAns');
    // near-miss choices, all real amounts of change (more than 0, less than $1)
    const choices = new Set([answer]);
    for (const d of shuffle([-15, -10, -5, 5, 10, 15, -1, 1])) {
      if (choices.size >= 4) break;
      if (answer + d > 0 && answer + d < 100) choices.add(answer + d);
    }
    shuffle([...choices]).forEach(v => {
      const b = document.createElement('button');
      b.className = 'ans-btn';
      b.textContent = money(v);
      b.addEventListener('click', () => {
        if (this.done) return;
        if (v === answer) {
          this.done = true;
          b.classList.add('right');
          const r = b.getBoundingClientRect();
          App.correct(r.left + r.width / 2, r.top + r.height / 2);
          this.stage.querySelectorAll('.toy').forEach(t => t.classList.add('bought'));
          App.later(() => this.next(), 1700);
        } else {
          shake(b);
          b.classList.add('nope');
          b.disabled = true;
          Sound.bad();
          toast(`Not quite! Try counting up from ${money(total)} to $1.00`, 2200);
        }
      });
      box.appendChild(b);
    });
    App.setSay(items.length === 1
      ? `The ${items[0][0][1]} costs ${total} cents. You pay one dollar. How much change do you get?`
      : `${items[0][1]} cents plus ${items[1][1]} cents. You pay one dollar. How much change?`);
  }
});
