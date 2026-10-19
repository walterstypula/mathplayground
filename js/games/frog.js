'use strict';

// A number line of lily pads. Guess where the frog lands, then watch it hop.
const FROG_STEP = { 4: 1, 5: 1, 6: 1, 7: 2, 8: 5, 9: 10 };

App.register({
  id: 'frog',
  name: 'Frog Hop',
  icon: '🐸',
  color: '#40c057',
  desc: 'Where will the frog land on the number line?',

  start(stage) {
    stage.innerHTML = `
      <div class="problem" id="fhEq"></div>
      <div class="prompt" id="fhQ"></div>
      <div class="pond">
        <div class="frog" id="fhFrog">🐸</div>
        <div class="pads" id="fhPads"></div>
      </div>`;
    this.eq = stage.querySelector('#fhEq');
    this.q = stage.querySelector('#fhQ');
    this.frog = stage.querySelector('#fhFrog');
    this.pads = stage.querySelector('#fhPads');
    this.onResize = () => this.place(this.pos);
    addEventListener('resize', this.onResize);
    this.next();
  },

  stop() {
    removeEventListener('resize', this.onResize);
  },

  next() {
    const step = FROG_STEP[App.age];
    const forward = App.age === 4 || Math.random() < 0.6;
    const hops = rand(1, App.age === 4 ? 3 : App.age === 5 ? 4 : 6);
    const startAt = forward ? rand(0, 10 - hops) : rand(hops, 10);
    this.step = step;
    this.target = forward ? startAt + hops : startAt - hops;
    this.pos = startAt;
    this.busy = false;
    this.misses = 0;

    const sv = startAt * step;
    const kv = hops * step;
    this.eqText = `${sv} ${forward ? '+' : '−'} ${kv}`;
    this.eq.textContent = `${this.eqText} = ?`;
    const how = step === 1 ? `${hops} ${hops === 1 ? 'hop' : 'hops'}` : `${kv} (${hops} hops of ${step})`;
    const sentence = `Frog is on ${sv}. Hop ${forward ? 'forward' : 'back'} ${how}. Where will Frog land?`;
    this.q.textContent = sentence;
    App.setSay(sentence);

    this.pads.innerHTML = '';
    for (let i = 0; i <= 10; i++) {
      const p = document.createElement('button');
      p.className = 'pad' + (i === startAt ? ' start' : '');
      p.textContent = i * step;
      p.addEventListener('click', () => this.tap(i, p));
      this.pads.appendChild(p);
    }
    this.place(startAt);
  },

  frogX(i) {
    const p = this.pads.children[i];
    return p.offsetLeft + p.offsetWidth / 2 - this.frog.offsetWidth / 2;
  },

  place(i) {
    this.x = this.frogX(i);
    this.frog.style.top = (this.pads.offsetTop - this.frog.offsetHeight + 10) + 'px';
    this.frog.style.transform = `translate(${this.x}px, 0px)`;
  },

  hop(to) {
    const x1 = this.x;
    const x2 = this.frogX(to);
    Sound.hop();
    this.frog.animate([
      { transform: `translate(${x1}px, 0px)` },
      { transform: `translate(${(x1 + x2) / 2}px, -50px)` },
      { transform: `translate(${x2}px, 0px)` }
    ], { duration: 360, easing: 'ease-in-out' });
    this.frog.style.transform = `translate(${x2}px, 0px)`;
    this.x = x2;
    this.pos = to;
    return new Promise(r => setTimeout(r, 400));
  },

  // Hop one pad at a time. Returns false if the player left the game mid-hop.
  async hopTo(to) {
    const s = App.session;
    while (this.pos !== to) {
      await this.hop(this.pos + (to > this.pos ? 1 : -1));
      if (s !== App.session) return false;
    }
    return true;
  },

  async tap(i, pad) {
    if (this.busy) return;
    if (i === this.target) {
      this.busy = true;
      pad.classList.add('goal');
      if (!(await this.hopTo(i))) return;
      const r = pad.getBoundingClientRect();
      App.correct(r.left + r.width / 2, r.top);
      this.eq.textContent = `${this.eqText} = ${i * this.step}`;
      App.later(() => this.next(), 1300);
    } else {
      shake(pad);
      App.wrong();
      this.misses++;
      if (this.misses >= 2) {
        // Show how it's done, then move on.
        this.busy = true;
        App.later(() => toast('Watch Frog hop! 👀', 1500), 900);
        this.pads.children[this.target].classList.add('goal');
        if (!(await this.hopTo(this.target))) return;
        const answer = this.target * this.step;
        this.eq.textContent = `${this.eqText} = ${answer}`;
        say(`Frog lands on ${answer}`);
        App.later(() => this.next(), 2200);
      }
    }
  }
});
