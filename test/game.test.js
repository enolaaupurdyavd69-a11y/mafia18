// Тесты логики: node test/game.test.js
require('../app/src/main/assets/game.js');
const M = globalThis.Mafia, assert = require('assert');
let t = 1e6; M.setNow(() => t);
const wins = {};
for (let g = 0; g < 300; g++) {
  const S = M.newGame('h', 'Игорь');
  assert.strictEqual(M.act(S, 'g', { a: 'join', name: 'Маша' }), '');
  for (let i = 0; i < g % 9; i++) M.act(S, 'h', { a: 'addbot' });
  M.act(S, 'g', { a: 'begin' });
  assert.strictEqual(S.phase, 'lobby', 'начинает только создатель');
  M.act(S, 'h', { a: 'begin' });
  assert(S.order.length >= M.MIN, 'добор ботами');
  for (let step = 0; step < 400 && S.phase !== 'end'; step++) {
    for (const u of ['h', 'g']) {
      const v = M.view(S, u);
      if (v.phase === 'night' && v.tasks) {
        const acts = {}; Object.entries(v.tasks).forEach(([k, ts]) => { if (!v.done.includes(k)) acts[k] = ts[0]; });
        if (Object.keys(acts).length) M.act(S, u, { a: 'n', acts });
      } else if (v.phase === 'day' && v.tv[3] && !v.tv[2]) M.act(S, u, { a: 'tv' });
      else if (v.phase === 'vote' && v.vt && !v.my) M.act(S, u, { a: 'v', t: v.vt[0] });
    }
    t += 7; M.tick(S);
  }
  assert.strictEqual(S.phase, 'end', 'партия заканчивается');
  wins[S.result] = (wins[S.result] || 0) + 1;
  const v = M.view(S, 'g');
  assert(v.pl.every(p => p[4]), 'в финале роли открыты');
  M.act(S, 'h', { a: 'again' });
  assert.strictEqual(S.phase, 'lobby');
}
// роли скрыты при игре
const S = M.newGame('h', 'И'); for (let i = 0; i < 6; i++) M.act(S, 'h', { a: 'addbot' }); M.act(S, 'h', { a: 'begin' });
const v = M.view(S, 'h'); assert(v.pl.filter(p => p[0] !== 'h').every(p => !p[4]), 'чужие роли скрыты');
assert(v.role && v.phase === 'night');
console.log('OK', JSON.stringify(wins));
