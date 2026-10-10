// Мафия 18+: экраны и связь. Хозяин ведёт партию (game.js) и отвечает гостям через сервер оболочки (window.Android);
// гости держат длинный опрос состояния — экран обновляется сам, без перезагрузок.
'use strict';
(() => {
  const A = window.Android, M = window.Mafia;
  const app = document.getElementById('app'), toastEl = document.getElementById('toast');
  const ROLES = {
    mafia: ['🔪', 'Мафия', '#ff6b6b', 'Ночью вместе с семьёй выбираете, кого убрать. Днём притворяйтесь приличным человеком.'],
    don: ['🎩', 'Дон мафии', '#ffb547', 'Голосуете с семьёй за убийство, при равенстве решает ваш голос. Ночью проверяете: не комиссар ли игрок.'],
    doctor: ['💉', 'Доктор', '#3ddc97', 'Ночью лечите одного игрока. Одного и того же два раза подряд нельзя, себя — один раз за игру.'],
    sheriff: ['🚓', 'Комиссар', '#2aabee', 'Каждую ночь проверяете одного игрока: мафия он или нет.'],
    lover: ['💋', 'Путана', '#ff4fa3', 'Ночью «обслуживаете» игрока — его ночное действие срывается. Мужа Ревнивой жены лучше не трогать.'],
    voyeur: ['👀', 'Вуайерист', '#5ed6d6', 'Ночью подглядываете за игроком и узнаёте, кто к нему приходил.'],
    stripper: ['💃', 'Стриптизёрша', '#f06292', 'Ночью танцуете для игрока — днём он не может голосовать.'],
    wife: ['💍', 'Ревнивая жена', '#ffd666', 'У вас тайный муж. Путана у мужа — вы с ней расправитесь. Играете за себя.'],
    bartender: ['🍸', 'Бармен', '#e65050', 'Вы в мафии. Подпаиваете: у пьяного Комиссара проверка лжёт, пьяный Доктор не лечит.'],
    maniac: ['🪓', 'Маньяк', '#ff7a45', 'Играете сам за себя: каждую ночь убиваете. Побеждаете один на один с мирным.'],
    civil: ['🙂', 'Мирный житель', '#b388ff', 'Ночью спите. Днём ищете мафию и голосуете с умом.'],
  };
  const MAFIA_TEAM = ['mafia', 'don', 'bartender'];
  const GOALS = { maniac: 'Цель: остаться последним, не считая одного мирного.', wife: 'Цель: дожить до конца вместе с мужем.' };
  const TASKS = { kill: '🔪 Кого семья убирает?', doncheck: '🎩 Кого проверить: не комиссар ли?', heal: '💉 Кого лечите?',
    check: '🚓 Кого проверяете?', visit: '💋 К кому заглянете?', maniac: '🪓 К кому зайти с топором?',
    watch: '👀 За кем подглядываете?', dance: '💃 Для кого танцуете?', booze: '🍸 Кого подпаиваете?' };
  const WIN = { town: ['🎉', 'Победили мирные', '#3ddc97'], mafia: ['🔪', 'Победила мафия', '#ff6b6b'],
    maniac: ['🪓', 'Победил маньяк', '#ff7a45'], draw: ['🌫', 'Ничья', '#a99cc6'], stop: ['⛔', 'Игра остановлена', '#a99cc6'] };
  const COLORS = ['#ff4fa3', '#ffb547', '#2aabee', '#3ddc97', '#b388ff', '#ff7a45', '#5ed6d6', '#f06292'];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const buzz = ms => { try { A && A.vibrate(ms); } catch { /* */ } };

  let me = localStorage.getItem('pid');
  if (!me) { me = 'p' + Math.random().toString(36).slice(2, 10); localStorage.setItem('pid', me); }
  let name = localStorage.getItem('name') || '';
  let mode = null, S = null, V = null, addr = '', timers = [], parked = [], chosen = {}, vote = null, deadline = 0, netBad = false;

  function toast(t) {
    if (!t) return;
    toastEl.textContent = t; toastEl.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => { toastEl.hidden = true; }, 2600);
  }
  function clearTimers() { timers.forEach(clearInterval); timers = []; }

  // ---------- меню и поиск ----------
  function menu() {
    clearTimers(); mode = null; S = null; V = null;
    if (A) { A.scanStop(); A.hostStop(); A.awake(false); }
    app.innerHTML = `<div class="eyebrow">Игра для компании 18+</div><h1 style="font-size:34px">🎭 Мафия</h1>
      <p class="muted">У каждого свой телефон, все — в одной Wi-Fi (или в раздаче с телефона создателя). Не хватает людей — добавьте ботов.</p>
      <input id="nm" placeholder="Ваше имя" maxlength="20" value="${esc(name)}">
      <button class="send" id="host">▶️ Создать игру</button>
      <button class="send ghost" id="find">🔍 Найти игру</button>
      ${rules()}
      <p class="hint">Разработчик: Ромашко Игорь Николаевич</p>`;
    const take = () => { name = document.getElementById('nm').value.trim() || 'Игрок'; localStorage.setItem('name', name); };
    document.getElementById('host').onclick = () => { take(); host(); };
    document.getElementById('find').onclick = () => { take(); find(); };
  }
  const rules = () => `<details class="role"><summary><span class="ic">📜</span><span><b>Как играть</b></span><small>открыть</small></summary>
    <div class="body"><ol class="steps" style="margin:0;padding-left:20px;line-height:1.6;color:var(--muted)">
    <li>Один создаёт игру, остальные жмут «Найти игру». Создатель добавляет ботов и жмёт «Начать».</li>
    <li>Каждый тайно получает роль: мафия, мирный, доктор, комиссар и пикантные роли 18+.</li>
    <li>Ночью роли делают ход. Утром — кто погиб. Днём обсуждаете вслух и тайно голосуете, кого казнить.</li>
    <li>Мирные побеждают, казнив всю мафию; мафия — когда её не меньше, чем остальных.</li></ol></div></details>`;

  function find() {
    if (!A) { toast('Поиск работает только в приложении'); return; }
    clearTimers(); A.scanStart();
    app.innerHTML = `<h1>Ищем игры…</h1><p class="muted">Создатель должен нажать «Создать игру». Телефоны — в одной Wi-Fi.</p>
      <div class="games" id="list"><p class="note">Пока ничего не нашли…</p></div><button class="send ghost" id="back">Назад</button>`;
    document.getElementById('back').onclick = menu;
    timers.push(setInterval(() => {
      const games = JSON.parse(A.games());
      if (!games.length) return;
      const el = document.getElementById('list');
      el.innerHTML = games.map((g, i) => `<button class="send" data-i="${i}">${esc(g.name)}</button>`).join('');
      el.onclick = e => { const b = e.target.closest('[data-i]'); if (b) join(games[b.dataset.i]); };
    }, 700));
  }

  // ---------- хозяин ----------
  function host() {
    clearTimers(); mode = 'host'; S = M.newGame(me, name); parked = [];
    if (A) { if (!A.hostStart('Мафия · ' + name)) toast('Не удалось открыть игру в Wi-Fi — можно играть с ботами'); A.awake(true); }
    show(M.view(S, me));
    timers.push(setInterval(hostLoop, 100), setInterval(() => { M.tick(S); }, 1000));
  }
  function hostLoop() {
    if (A) {
      for (const r of JSON.parse(A.take())) {
        let b = {}; try { b = JSON.parse(r.body); } catch { /* */ }
        if (b.op === 'act') { const t = M.act(S, b.pid, b); A.reply(r.id, JSON.stringify({ v: M.view(S, b.pid), t })); }
        else if (b.ver === S.ver) parked.push({ id: r.id, pid: b.pid, ver: b.ver, at: Date.now() });
        else A.reply(r.id, JSON.stringify({ v: M.view(S, b.pid) }));
      }
      const t = Date.now();
      parked = parked.filter(p => {
        if (p.ver !== S.ver || t - p.at > 12000) { A.reply(p.id, JSON.stringify({ v: M.view(S, p.pid) })); return false; }
        return true;
      });
    }
    if (V && V.ver !== S.ver) show(M.view(S, me));
  }

  // ---------- гость ----------
  async function post(m) {
    const r = await fetch(addr, { method: 'POST', body: JSON.stringify({ pid: me, ...m }) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }
  async function join(g) {
    clearTimers(); if (A) A.scanStop();
    mode = 'guest'; addr = `http://${g.host}:${g.port}/api`;
    app.innerHTML = `<h1>Подключаемся…</h1><p class="muted">${esc(g.name)}</p>`;
    try {
      const r = await post({ op: 'act', a: 'join', name });
      if (r.t) { toast(r.t); }
      if (!r.v.pl.some(p => p[0] === me)) { menu(); toast(r.t || 'Не получилось войти'); return; }
      if (A) A.awake(true);
      show(r.v); poll();
    } catch { menu(); toast('Нет связи с игрой. Проверьте, что вы в одной Wi-Fi.'); }
  }
  async function poll() {
    while (mode === 'guest') {
      try {
        const r = await post({ op: 'state', ver: V ? V.ver : 0 });
        if (mode !== 'guest') return;
        if (netBad) { netBad = false; render(); }
        if (r.v.ver !== V.ver) show(r.v);
      } catch {
        if (mode !== 'guest') return;
        if (!netBad) { netBad = true; render(); }
        await new Promise(res => setTimeout(res, 1500));
      }
    }
  }

  // ---------- действия ----------
  async function act(a, extra = {}) {
    if (mode === 'host') { toast(M.act(S, me, { a, ...extra })); show(M.view(S, me)); return; }
    try { const r = await post({ op: 'act', a, ...extra }); toast(r.t); show(r.v); }
    catch { toast('Нет связи с игрой — попробуйте ещё раз'); }
  }
  function leave() {
    const ask = mode === 'host' && V && V.phase !== 'end' ? 'Вы создатель: если выйти, игра закончится у всех. Выйти?' : 'Выйти из игры?';
    if (!confirm(ask)) return;
    if (mode === 'guest') post({ op: 'act', a: V && V.phase === 'lobby' ? 'leave' : 'quit' }).catch(() => {});
    menu();
  }
  window.onBack = () => { if (mode) { leave(); return true; } return false; };

  // ---------- отрисовка ----------
  function show(v) {
    const was = V;
    if (!was || was.phase !== v.phase || was.n !== v.n || was.d !== v.d) {
      chosen = {}; vote = null;
      if (was && was.phase !== 'lobby') buzz(v.phase === 'end' ? 300 : 120);
      window.scrollTo(0, 0);
    }
    V = v; deadline = Date.now() / 1000 + (v.left || 0);
    render();
  }
  const P = () => Object.fromEntries(V.pl.map(p => [p[0], p]));
  const nameOf = u => (P()[u] || [0, '?'])[1];
  const roleOf = u => (P()[u] || [])[4];
  const colorOf = u => COLORS[Math.max(0, V.pl.findIndex(p => p[0] === u)) % COLORS.length];
  const initial = u => esc((nameOf(u).match(/[\p{L}\p{N}]/u) || ['?'])[0].toUpperCase());
  const av = u => `<span class="av" style="background:${colorOf(u)}">${initial(u)}</span>`;
  const left = () => Math.max(0, Math.round(deadline - Date.now() / 1000));
  const mmss = s => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');

  function render() {
    if (!V) return;
    const isHost = mode === 'host', net = netBad ? '<p class="net">Нет связи с создателем игры — переподключаемся…</p>' : '';
    if (V.phase === 'lobby') {
      const lack = Math.max(0, M.MIN - V.pl.length);
      app.innerHTML = `${net}<div class="eyebrow">Мафия 18+</div><div class="top"><h1>Набор игроков</h1></div>
        <section class="panel"><h2>Игроки: ${V.pl.length}</h2><div class="list">${V.pl.map(p =>
          `<div>${av(p[0])}<span>${p[2] ? '🤖 ' : ''}${esc(p[1])}${p[0] === me ? ' <span class="muted">(вы)</span>' : ''}${p[0] === V.host ? ' 👑' : ''}</span></div>`).join('')}</div>
          <p class="small ${lack ? 'muted' : 'ok'}">${lack ? `Не хватает ${lack} — при старте добавим ботов 🤖` : 'Можно начинать ✅'}</p></section>
        ${isHost ? `<div class="actions"><button class="send" data-a="begin">${lack ? `▶️ Начать (+${lack} 🤖)` : '▶️ Начать игру'}</button>
          <div class="row2"><button class="chip" data-a="addbot">🤖 + бот</button><button class="chip" data-a="delbot">🤖 − бот</button></div></div>
          <p class="hint">Друзья жмут «Найти игру» и выбирают «Мафия · ${esc(name)}». ${A ? 'Адрес: ' + esc(A.ip()) : ''}</p>`
          : '<p class="note">Ждём, когда создатель 👑 начнёт игру.</p>'}
        <button class="chip quit" id="leave">🚪 Выйти</button>`;
      return;
    }
    const me0 = P()[me] || [], alive = V.alive !== false && V.phase !== 'end' ? !!me0[3] : false;
    const [icon, roleName, color, about] = ROLES[V.role] || ['🎭', '', '#ff4fa3', ''];
    document.documentElement.style.setProperty('--role', color);
    const out = [net, `<div class="eyebrow">Мафия 18+</div>
      <div class="top"><h1>${{ night: `Ночь ${V.n}`, day: `День ${V.d}`, vote: `День ${V.d} · голосование`, end: 'Игра окончена' }[V.phase]}</h1>
      ${V.phase !== 'end' ? `<span class="timer" id="left">${mmss(left())}</span>` : ''}</div>`];
    if (!me0[3] && V.phase !== 'end') out.push('<p class="note dead">💀 Вы выбыли и теперь зритель.</p>');
    const evN = (V.ev || []).filter(e => e.k === 'n').pop(), evV = (V.ev || []).filter(e => e.k === 'v').pop();
    if (V.phase === 'end') out.push(finalCard());
    if (V.phase === 'night') { if (evV && evV.d === V.d && V.n > 1) out.push(verdictCard(evV)); if (me0[3]) out.push(nightPanel()); }
    if (V.phase === 'day') {
      if (evN && evN.n === V.n) out.push(morningCard(evN));
      if (V.tv && V.tv[3]) out.push(`<section class="panel"><h2>💬 Обсуждайте вслух, кто тут мафия</h2>
        <p class="small muted">Голосование — по таймеру или раньше, если половина нажмёт кнопку.</p>
        ${V.tv[2] ? `<p class="ok">✅ Вы за голосование (${V.tv[0]} из ${V.tv[1]})</p>` : `<button class="send" data-a="tv">🗳 К голосованию (${V.tv[0]} из ${V.tv[1]})</button>`}</section>`);
    }
    if (V.phase === 'vote') out.push(votePanel());
    if (V.nt && V.nt.length && V.phase !== 'night') out.push(`<p class="note me">${V.nt.map(esc).join('<br>')}</p>`);
    if ((V.phase === 'day' || V.phase === 'vote') && V.fd && V.fd.length) out.push(`<section><div class="eyebrow" style="margin-bottom:8px">Что говорят в городе</div>
      <div class="feed">${V.fd.map(([w, t]) => `<div>${w ? `<b>${String(w).startsWith('b') ? '🤖 ' : ''}${esc(nameOf(w))}:</b> ` : ''}${esc(t)}</div>`).join('')}</div></section>`);
    out.push(`<details class="role" ${V.phase === 'night' && V.n === 1 ? 'open' : ''}>
      <summary><span class="ic">${icon}</span><span><span class="eyebrow">Ваша роль</span><br><b>${roleName}</b></span><small>подробнее</small></summary>
      <div class="body"><p>${about}</p><p class="goal">${GOALS[V.role] || (MAFIA_TEAM.includes(V.role) ? 'Цель: мафии должно стать не меньше, чем остальных.' : 'Цель: вычислить и казнить всю мафию и маньяка.')}</p>
      ${V.mates && V.mates.length ? `<p class="mates">Ваша семья: ${V.mates.map(esc).join(', ')}</p>` : ''}${V.hb ? `<p class="mates">💍 Ваш муж: ${esc(V.hb)}</p>` : ''}</div></details>`);
    out.push(town());
    out.push(`<div class="actions">${V.phase === 'end' && isHost ? '<button class="send" data-a="again">▶️ Ещё партию</button>' : ''}
      ${alive ? '<button class="chip quit" id="quitg">🚪 Выйти из игры</button>' : ''}
      ${isHost && V.phase !== 'end' ? '<button class="chip quit" data-a="stop">⛔ Остановить игру для всех</button>' : ''}
      <button class="chip" id="leave">↩️ В меню</button></div>`);
    app.innerHTML = out.join('');
  }

  function nightPanel() {
    const tasks = V.tasks || {}, todo = Object.keys(tasks).filter(k => !(V.done || []).includes(k));
    if (!Object.keys(tasks).length) return '<p class="note">😴 Вы спите. Утром — новости здесь.</p>';
    if (!todo.length) return '<p class="note"><span class="ok">✅ Ход принят.</span> Ждём остальных.</p>';
    const ready = todo.every(k => chosen[k]);
    return `<section class="panel">${todo.map(k => `<h2>${TASKS[k] || k}</h2><div class="targets">${tasks[k].map(u =>
      `<button class="target ${chosen[k] === u ? 'on' : ''}" data-k="${k}" data-t="${esc(u)}">${av(u)}<span class="nm">${esc(nameOf(u))}</span></button>`).join('')}</div>`).join('')}
      <button class="send" id="send" ${ready ? '' : 'disabled'}>${ready ? 'Отправить ход' : 'Выберите цель'}</button></section>`;
  }
  function votePanel() {
    if (!V.vt) return `<p class="note">${V.alive ? '💃 Сегодня вы не голосуете.' : '👻 Голосуют живые.'}</p>`;
    if (V.my) return `<p class="note"><span class="ok">✅ Ваш голос: ${V.my === 'skip' ? 'пропустить' : esc(nameOf(V.my))}.</span> Проголосовали ${V.vc[0]} из ${V.vc[1]}.</p>`;
    return `<section class="panel"><h2>🗳 Кого казним? Голос тайный</h2><div class="targets">${V.vt.concat('skip').map(u =>
      `<button class="target ${vote === u ? 'on' : ''}" data-vote="${esc(u)}">${u === 'skip' ? '<span class="av" style="background:#3a2d5c">🤷</span>' : av(u)}
      <span class="nm">${u === 'skip' ? 'Пропустить' : esc(nameOf(u))}</span></button>`).join('')}</div>
      <button class="send" id="sendVote" ${vote ? '' : 'disabled'}>${vote ? 'Проголосовать' : 'Выберите, за кого'}</button>
      <p class="small muted">Проголосовали ${V.vc[0]} из ${V.vc[1]}</p></section>`;
  }
  const roleLabel = u => { const r = ROLES[roleOf(u)]; return r ? `<span style="color:${r[2]}">${r[1]}</span>` : ''; };
  function morningCard(e) {
    document.documentElement.style.setProperty('--hero', e.dead.length ? '#ff6b6b' : '#ffb547');
    return `<section class="hero"><div class="big">${e.dead.length ? '🌅' : '☀️'}</div><h2>Утро ${e.n}</h2>
      ${e.dead.length ? `<p>Этой ночью ${e.dead.length > 1 ? 'погибли' : 'погиб(ла)'}:</p><div class="people">${e.dead.map(u =>
        `<div class="person">${av(u)}<b>${esc(nameOf(u))}</b><span>${roleLabel(u)}${u === e.jl ? ' · 💍 ревность' : ''}</span></div>`).join('')}</div>`
        : `<p>${e.sv ? '💉 Доктор успел — все живы!' : 'Ночь прошла спокойно — все живы.'}</p>`}
      ${e.sl ? `<p class="small muted">💃 ${esc(nameOf(e.sl))} сегодня не голосует.</p>` : ''}</section>`;
  }
  function verdictCard(e) {
    const total = e.ty.reduce((a, [, c]) => a + c, 0) || 1;
    document.documentElement.style.setProperty('--hero', e.x ? '#ff6b6b' : '#2aabee');
    return `<section class="hero"><div class="big">${e.x ? '⚖️' : '🤷'}</div><h2>Приговор, день ${e.d}</h2>
      ${e.x ? `<div class="people"><div class="person">${av(e.x)}<b>${esc(nameOf(e.x))}</b><span>${roleLabel(e.x)}</span></div></div>` : '<p>Город не договорился — никого не казнили.</p>'}
      <div class="tally">${e.ty.map(([t, c]) => `<div class="bar"><i style="width:${Math.round(c / total * 100)}%"></i>
        <span>${t === 'skip' ? '🤷 Пропустить' : esc(nameOf(t))}</span><b>${c}</b></div>`).join('')}</div></section>`;
  }
  function finalCard() {
    const [ic, title, c] = WIN[V.result] || WIN.stop;
    const r = V.role, mine = V.result === 'town' ? !MAFIA_TEAM.includes(r) && !['maniac', 'wife'].includes(r)
      : V.result === 'mafia' ? MAFIA_TEAM.includes(r) : V.result === 'maniac' ? r === 'maniac' : false;
    const lastE = (V.ev || []).slice(-1)[0];
    const extra = lastE ? (lastE.k === 'n' ? morningCard(lastE) : verdictCard(lastE)) : '';
    document.documentElement.style.setProperty('--hero', c);
    return `<section class="hero"><div class="big">${ic}</div><h2>${title}</h2>
      ${!['stop', 'draw'].includes(V.result) ? `<p><b>${mine || (V.ww && r === 'wife') ? '🏆 Вы в команде победителей!' : 'В этот раз не ваша победа.'}</b></p>` : ''}
      ${V.ww ? '<p class="small">💍 Ревнивая жена дожила до конца с мужем — она тоже победила.</p>' : ''}
      <p class="small muted">Все роли раскрыты — смотрите табло ниже.</p></section>${extra}`;
  }
  function town() {
    const n = V.pl.filter(p => p[3]).length;
    return `<section><div class="eyebrow" style="margin-bottom:8px">Город · живых ${n} из ${V.pl.length}</div><div class="town">${V.pl.map(p => {
      const r = ROLES[p[4]], dead = !p[3];
      return `<div class="${dead ? 'dead' : ''} ${p[0] === me ? 'self' : ''}">${av(p[0])}<span class="who"><b>${dead ? '💀 ' : ''}${p[2] ? '🤖 ' : ''}${esc(p[1])}${p[0] === me ? ' (вы)' : ''}</b>
        ${r && (dead || V.phase === 'end') ? `<small style="color:${r[2]}">${r[0]} ${r[1]}</small>` : `<small class="muted">${dead ? '' : 'в игре'}</small>`}</span></div>`;
    }).join('')}</div></section>`;
  }

  // ---------- нажатия ----------
  app.addEventListener('click', e => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.id === 'leave') return leave();
    if (t.id === 'quitg') { if (confirm('Выйти из игры? Вы выбываете, ваша роль откроется всем.')) act('quit'); return; }
    if (t.dataset.a) { if (t.dataset.a === 'stop' && !confirm('Остановить игру для всех?')) return; return act(t.dataset.a); }
    if (t.dataset.vote) { vote = t.dataset.vote; return render(); }
    if (t.dataset.k) { chosen[t.dataset.k] = t.dataset.t; return render(); }
    if (t.id === 'send') { const acts = {}; Object.keys(chosen).forEach(k => { if (!(V.done || []).includes(k)) acts[k] = chosen[k]; }); return act('n', { acts }); }
    if (t.id === 'sendVote') return act('v', { t: vote });
  });
  setInterval(() => {
    const el = document.getElementById('left');
    if (el) el.textContent = mmss(left());
  }, 1000);

  menu();
})();
