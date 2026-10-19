'use strict';

// Shared look for the block games: every number is a buddy made of stacked
// cubes, with eyes on the top cube. Big numbers stack in columns of ten.
const BUDDY_COLORS = ['#20c997', '#ff922b', '#845ef7', '#f06595', '#339af0', '#fcc419', '#51cf66', '#ff6b6b', '#22b8cf', '#5c7cfa'];
const buddyColor = (v) => BUDDY_COLORS[(v - 1) % BUDDY_COLORS.length];

// parts: [[howMany, color], ...] stacked from the bottom up.
function buddyEl(parts, { label = true } = {}) {
  const total = parts.reduce((s, [v]) => s + v, 0);
  const cubes = [];
  parts.forEach(([v, color]) => { for (let i = 0; i < v; i++) cubes.push(color); });

  const el = document.createElement('div');
  el.className = 'bb';
  if (label) el.innerHTML = `<div class="bb-label">${total}</div>`;
  const cols = document.createElement('div');
  cols.className = 'bb-cols';
  for (let i = 0; i < cubes.length; i += 10) {
    const col = document.createElement('div');
    col.className = 'bb-col';
    cubes.slice(i, i + 10).forEach(color => {
      const q = document.createElement('i');
      q.className = 'cube';
      q.style.background = color;
      col.appendChild(q);
    });
    cols.appendChild(col);
  }
  cols.firstChild.lastChild.classList.add('face'); // eyes on top of the first column
  el.appendChild(cols);
  return el;
}

function heartsText(n, max = 3) {
  return '💙'.repeat(Math.max(0, n)) + '🤍'.repeat(Math.max(0, max - n));
}
