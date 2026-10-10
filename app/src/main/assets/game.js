// Мафия 18+: правила, роли, хитрые боты и ведение партии. Работает на телефоне-хозяине (и в Node для тестов).
// Перенос bot/mafia_engine.py и ботов из bot/mafia_bot.py проекта krokodil.
(function (root) {
  'use strict';
  const MAFIA = 'mafia', DON = 'don', BARTENDER = 'bartender', DOCTOR = 'doctor', SHERIFF = 'sheriff', LOVER = 'lover',
    VOYEUR = 'voyeur', STRIPPER = 'stripper', CIVIL = 'civil', MANIAC = 'maniac', WIFE = 'wife';
  const TEAM = [MAFIA, DON, BARTENDER];
  const KILL = 'kill', DON_CHECK = 'doncheck', HEAL = 'heal', CHECK = 'check', VISIT = 'visit', MANIAC_KILL = 'maniac',
    WATCH = 'watch', DANCE = 'dance', BOOZE = 'booze', SKIP = 'skip';
  const MIN = 5, MAX = 15, NIGHT = 60, DAY = 120, VOTE = 45;
  const NAMES = { mafia: 'Мафия', don: 'Дон мафии', bartender: 'Бармен', doctor: 'Доктор', sheriff: 'Комиссар', lover: 'Путана',
    voyeur: 'Вуайерист', stripper: 'Стриптизёрша', maniac: 'Маньяк', wife: 'Ревнивая жена', civil: 'Мирный житель' };
  const BOT_NAMES = ['Валера', 'Жанна', 'Аркадий', 'Снежана', 'Геннадий', 'Кристина', 'Эдуард', 'Анжела', 'Борис', 'Изольда',
    'Тимофей', 'Лариса', 'Гоша', 'Милана'];
  const FEMALE = ['Жанна', 'Снежана', 'Кристина', 'Анжела', 'Изольда', 'Лариса', 'Милана'];
  let rnd = Math.random;
  const pick = a => a[Math.floor(rnd() * a.length)];
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  let now = () => Date.now() / 1000;

  // ---------- правила ----------
  function rolePlan(n) {
    const m = n <= 6 ? 1 : n <= 9 ? 2 : n <= 12 ? 3 : 4;
    let r = m === 1 ? [MAFIA] : [DON].concat(n >= 12 ? [BARTENDER] : []);
    while (r.length < m) r.push(MAFIA);
    r.push(DOCTOR, SHERIFF);
    [[7, LOVER], [8, VOYEUR], [9, MANIAC], [10, STRIPPER], [11, WIFE]].forEach(([k, x]) => { if (n >= k) r.push(x); });
    while (r.length < n) r.push(CIVIL);
    return r;
  }
  const alive = S => S.order.filter(u => S.players[u].alive);
  const role = (S, u) => S.players[u].role;
  const isMafia = (S, u) => TEAM.includes(role(S, u));
  const aliveWith = (S, rs) => alive(S).filter(u => rs.includes(role(S, u)));

  function nightTasks(S) {
    const mem = S.memory, a = alive(S), civ = a.filter(t => !isMafia(S, t)), out = [];
    for (const u of a) {
      const r = role(S, u), others = a.filter(t => t !== u);
      if (TEAM.includes(r)) out.push([u, KILL, civ]);
      if (r === DON) out.push([u, DON_CHECK, civ]);
      else if (r === BARTENDER) out.push([u, BOOZE, civ]);
      else if (r === DOCTOR) out.push([u, HEAL, a.filter(t => t !== mem.lastHeal && (t !== u || !mem.selfHealed))]);
      else if (r === SHERIFF) out.push([u, CHECK, others]);
      else if (r === LOVER) out.push([u, VISIT, others.filter(t => t !== mem.lastVisit)]);
      else if (r === VOYEUR) out.push([u, WATCH, others]);
      else if (r === STRIPPER) out.push([u, DANCE, others.filter(t => t !== mem.lastDance)]);
      else if (r === MANIAC) out.push([u, MANIAC_KILL, others]);
    }
    return out.filter(t => t[2].length);
  }
  function recordAction(S, u, kind, t) {
    const task = nightTasks(S).find(x => x[0] === u && x[1] === kind);
    if (!task || !task[2].includes(t) || S.night[u + ':' + kind]) return false;
    S.night[u + ':' + kind] = t;
    return true;
  }
  const nightDone = S => nightTasks(S).every(([u, k]) => S.night[u + ':' + k]);
  function single(S, kind) {
    for (const [k, t] of Object.entries(S.night)) { const [u, kk] = k.split(':'); if (kk === kind) return [u, t]; }
    return [null, null];
  }
  function resolveNight(S) {
    const acts = S.night, mem = S.memory;
    const [lover, guest] = single(S, VISIT);
    const works = x => x && x !== guest;
    let [bartender, boozed] = single(S, BOOZE); if (!works(bartender)) boozed = null;
    const votes = Object.entries(acts).filter(([k]) => k.endsWith(':' + KILL) && works(k.split(':')[0])).map(([k, t]) => [k.split(':')[0], t]);
    let kill = null;
    if (votes.length) {
      const c = {}; votes.forEach(([, t]) => { c[t] = (c[t] || 0) + 1; });
      const top = Math.max(...Object.values(c)), leaders = Object.keys(c).filter(t => c[t] === top);
      const don = votes.filter(([u]) => role(S, u) === DON).map(([, t]) => t);
      kill = leaders.length > 1 && don.length && leaders.includes(don[0]) ? don[0] : leaders[0];
    }
    let [maniac, mt] = single(S, MANIAC_KILL); if (!works(maniac)) mt = null;
    const jealous = lover && guest && aliveWith(S, [WIFE]).length && guest === S.husband ? lover : null;
    let [doctor, heal] = single(S, HEAL); if (!works(doctor) || doctor === boozed) heal = null;
    const dead = [], saved = [];
    [...new Set([kill, mt, jealous].filter(Boolean))].forEach(t => (t === heal ? saved : dead).push(t));
    const checks = [];
    const [don, dt] = single(S, DON_CHECK);
    if (works(don)) checks.push([don, dt, DON_CHECK, role(S, dt) === SHERIFF]);
    const [sh, st] = single(S, CHECK);
    if (works(sh)) { const truth = isMafia(S, st); checks.push([sh, st, CHECK, sh === boozed ? !truth : truth]); }
    let watch = null;
    const [voy, w] = single(S, WATCH);
    if (works(voy)) watch = [voy, w, [...new Set(Object.entries(acts).filter(([k, t]) => t === w && ![voy, w].includes(k.split(':')[0])).map(([k]) => k.split(':')[0]))]];
    const [strip, dg] = single(S, DANCE);
    const silenced = works(strip) && !dead.includes(dg) ? dg : null;
    dead.forEach(d => { S.players[d].alive = false; });
    if (doctor) { mem.lastHeal = acts[doctor + ':' + HEAL]; if (mem.lastHeal === doctor) mem.selfHealed = true; } else mem.lastHeal = null;
    mem.lastVisit = guest; mem.lastDance = dg; mem.silenced = silenced;
    return { dead, saved, blocked: guest, checks, watch, silenced, jealous: dead.includes(jealous) ? jealous : null };
  }
  const voters = S => alive(S).filter(u => u !== S.memory.silenced);
  function recordVote(S, v, t) {
    if (!voters(S).includes(v) || (t !== SKIP && (!alive(S).includes(t) || t === v))) return false;
    S.votes[v] = t; return true;
  }
  const tally = S => { const c = {}; Object.values(S.votes).forEach(t => { c[t] = (c[t] || 0) + 1; }); return c; };
  function resolveVote(S) {
    const c = tally(S), skips = c[SKIP] || 0; delete c[SKIP];
    const ks = Object.keys(c); if (!ks.length) return null;
    const top = Math.max(...Object.values(c)), leaders = ks.filter(t => c[t] === top);
    if (leaders.length > 1 || top <= skips) return null;
    S.players[leaders[0]].alive = false; return leaders[0];
  }
  function winner(S) {
    const a = alive(S), m = aliveWith(S, TEAM).length, man = aliveWith(S, [MANIAC]).length;
    if (!a.length) return 'draw';
    if (!m && !man) return 'town';
    if (m && m >= a.length - m) return 'mafia';
    if (man && !m && a.length <= 2) return 'maniac';
    return null;
  }
  function wifeWon(S) {
    const w = S.order.find(u => role(S, u) === WIFE);
    return !!(w && S.husband && S.players[w].alive && S.players[S.husband].alive);
  }

  // ---------- хитрые боты: открытые сведения + знание своей роли ----------
  const nm = (S, u) => S.players[u].name;
  const fem = (S, b) => FEMALE.includes(nm(S, b));
  const say = (S, b, s) => s.replace(/\{a\}/g, fem(S, b) ? 'а' : '').replace(/\{yi\}/g, fem(S, b) ? 'ая' : 'ый');
  const mem = (S, b) => (S.botmem[b] = S.botmem[b] || {});
  const accuse = (S, a, t, w, k) => { if (a !== t) S.intel.acc.push({ a, t, w, k, d: S.day_no }); };
  const claim = (S, u) => { if (!(u in S.intel.claims)) S.intel.claims[u] = S.day_no; };
  const revealed = (S, u) => (S.players[u].alive ? null : role(S, u));
  const bad = r => TEAM.includes(r) || r === MANIAC;
  function trust(S, a) {
    const r = revealed(S, a);
    if (r === SHERIFF) return 3; if (r && bad(r)) return -1;
    let t = 1;
    if (a in S.intel.claims) t += Object.keys(S.intel.claims).some(c => c !== a && [null, SHERIFF].includes(revealed(S, c))) ? 0.3 : 1.5;
    S.intel.acc.forEach(x => { if (x.a === a && revealed(S, x.t)) t += bad(revealed(S, x.t)) ? 1 : x.k === 'claim' ? -1.5 : -0.5; });
    return Math.max(t, -1);
  }
  function suspicion(S) {
    const s = {}; alive(S).forEach(u => { s[u] = 0; });
    S.intel.acc.forEach(x => {
      if (x.t in s) s[x.t] += x.w * trust(S, x.a);
      else if (x.a in s && revealed(S, x.t) && !bad(revealed(S, x.t))) s[x.a] += x.k === 'claim' ? 2.5 : 0.8;
    });
    const cl = Object.keys(S.intel.claims).filter(c => c in s);
    if (cl.length > 1) cl.forEach(c => { s[c] += 1; });
    return s;
  }
  function townPick(S, b, pool) {
    const m = mem(S, b);
    pool = pool.filter(t => !(m.clean || []).includes(t) && !(role(S, b) === WIFE && t === S.husband));
    if (!pool.length) return null;
    const s = suspicion(S), best = Math.max(...pool.map(t => s[t] || 0));
    return best < 1 ? null : pick(pool.filter(t => (s[t] || 0) >= best - 0.3));
  }
  const townAlive = S => alive(S).filter(u => !isMafia(S, u));
  function mafiaVoteTarget(S) {
    const mm = mem(S, '_maf');
    if (mm.vote && mm.vote[0] === S.day_no && alive(S).includes(mm.vote[1])) return mm.vote[1];
    const town = townAlive(S); if (!town.length) return SKIP;
    const danger = S.intel.acc.filter(x => town.includes(x.a) && alive(S).includes(x.t) && isMafia(S, x.t)).map(x => x.a);
    const s = suspicion(S), best = Math.max(...town.map(u => s[u] || 0));
    const t = danger.length ? danger[danger.length - 1] : town.includes(mm.framed) ? mm.framed
      : best >= 0.5 ? pick(town.filter(u => (s[u] || 0) >= best - 0.3)) : pick(town);
    mm.vote = [S.day_no, t]; return t;
  }
  function botTarget(S, b, kind, targets) {
    const m = mem(S, b), s = suspicion(S), claimers = Object.keys(S.intel.claims).filter(c => targets.includes(c));
    const trusted = () => pick(targets.slice().sort((x, y) => (s[x] || 0) - (s[y] || 0)).slice(0, Math.max(1, targets.length >> 1)));
    const top = targets.reduce((x, y) => ((s[y] || 0) > (s[x] || 0) ? y : x));
    if (kind === KILL) {
      const fam = Object.entries(S.night).filter(([k, t]) => k.endsWith(':' + KILL) && targets.includes(t)).map(([, t]) => t);
      if (fam.length) return fam[0];
      const mm = mem(S, '_maf'); if (targets.includes(mm.sheriff)) return mm.sheriff;
      if (claimers.length) return pick(claimers);
      const danger = S.intel.acc.filter(x => targets.includes(x.a) && alive(S).includes(x.t) && isMafia(S, x.t)).map(x => x.a);
      return danger.length ? danger[0] : trusted();
    }
    if (kind === CHECK || kind === DON_CHECK) {
      const fresh = targets.filter(t => !(m.checked || []).includes(t)); const f = fresh.length ? fresh : targets;
      const t = kind === CHECK && (s[top] || 0) >= 1 && f.includes(top) && rnd() < 0.7 ? top
        : kind === DON_CHECK && claimers.some(c => f.includes(c)) && rnd() < 0.7 ? pick(claimers.filter(c => f.includes(c))) : pick(f);
      (m.checked = m.checked || []).push(t); return t;
    }
    if (kind === HEAL) {
      const oc = claimers.filter(c => c !== b);
      if (oc.length && rnd() < 0.7) return pick(oc);
      if (targets.includes(b) && ((s[b] || 0) >= 1.5 || rnd() < 0.25)) return b;
      return trusted();
    }
    if (kind === VISIT || kind === DANCE) return (s[top] || 0) >= 1 && rnd() < 0.75 ? top : pick(targets);
    if (kind === BOOZE) { const sh = mem(S, '_maf').sheriff; return targets.includes(sh) ? sh : claimers.length ? pick(claimers) : pick(targets); }
    if (kind === WATCH) return claimers.length && rnd() < 0.5 ? pick(claimers) : trusted();
    if (kind === MANIAC_KILL && claimers.length && rnd() < 0.5) return pick(claimers);
    return pick(targets);
  }
  function botVote(S, b) {
    const a = alive(S).filter(t => t !== b);
    if (isMafia(S, b)) { const t = mafiaVoteTarget(S); return a.includes(t) ? t : pick(a.filter(u => !isMafia(S, u)).concat(a)); }
    const m = mem(S, b); if (a.includes(m.found)) return m.found;
    const t = townPick(S, b, a); if (t) return t;
    const c = {}; Object.values(S.votes).forEach(v => { if (a.includes(v) && !(m.clean || []).includes(v)) c[v] = (c[v] || 0) + 1; });
    const lead = Object.keys(c).sort((x, y) => c[y] - c[x])[0], r = rnd();
    if (lead && r < 0.45) return lead;
    return r < 0.75 ? SKIP : pick(a);
  }
  const CHATTER = ['Я мирн{yi}, честно-честно.', 'Что-то {x} подозрительно молчит…', '{x}, а где ты был(а) ночью?',
    'Мне кажется, мафия среди тех, кто громче всех шутит.', 'Давайте не торопиться, у меня алиби: я спал{a}.',
    '{x} слишком хорошо всё объясняет. Не верю.', 'Кто сегодня ещё ни разу не высказался? Вот там и ищите.'];
  const CLAIM_FOUND = ['Скрываться больше нет смысла: я комиссар. {x} — мафия, проверено этой ночью!', 'Я комиссар. Ночная проверка: {x} — мафия. Доктор, прикрой меня.'];
  const CLAIM_COUNTER = ['Стоп! Комиссар — это я. А {x} нагло врёт: по моей проверке {x} — мафия.', 'Не верьте! {x} — не комиссар, а мафия. Настоящий комиссар — я.'];
  const SUSPECT = ['{x} мне не нравится. Голосую.', 'Мой кандидат — {x}.', 'Подозреваю: {x}.'];
  const SEEN = ['Раскроюсь: я вуайерист. К жертве ({t}) этой ночью заходили: {y}. Думайте.'];
  function botTalk(S) {
    const bots = shuffle(alive(S).filter(u => S.players[u].bot)), mm = mem(S, '_maf'), lines = [];
    const sayLine = (b, tpl, v) => { lines.push([b, say(S, b, tpl).replace(/\{x\}/g, v.x || '').replace(/\{t\}/g, v.t || '').replace(/\{y\}/g, v.y || '')]); };
    for (const b of bots) {
      const m = mem(S, b), r = role(S, b);
      if (r === SHERIFF && alive(S).includes(m.found) && m.told !== m.found) {
        claim(S, b); accuse(S, b, m.found, 1, 'claim'); m.told = m.found; sayLine(b, pick(CLAIM_FOUND), { x: nm(S, m.found) });
      } else if (r === VOYEUR && m.seen && m.seen[0] === S.night_no && !S.players[m.seen[1]].alive) {
        const seen = m.seen[2].filter(v => v !== b && alive(S).includes(v));
        if (seen.length) { seen.forEach(v => accuse(S, b, v, 0.8, 'seen')); sayLine(b, pick(SEEN), { t: nm(S, m.seen[1]), y: seen.map(v => nm(S, v)).join(', ') }); }
      }
    }
    const liars = bots.filter(b => isMafia(S, b) && !lines.some(l => l[0] === b));
    if (liars.length && !mm.faked) {
      const real = S.intel.acc.filter(x => x.k === 'claim' && alive(S).includes(x.a) && !isMafia(S, x.a) && alive(S).includes(x.t) && isMafia(S, x.t));
      let x = null;
      if (real.length && rnd() < 0.8) x = real[real.length - 1].a;
      else if (!Object.keys(S.intel.claims).length && S.day_no >= 2 && rnd() < 0.35) x = pick(townAlive(S));
      if (x) { const b = liars[0]; claim(S, b); accuse(S, b, x, 1, 'claim'); mm.faked = b; mm.framed = x; sayLine(b, pick(real.length ? CLAIM_COUNTER : CLAIM_FOUND), { x: nm(S, x) }); }
    }
    for (const b of bots) {
      if (lines.length >= 3) break;
      if (lines.some(l => l[0] === b) || rnd() < 0.4) continue;
      const others = alive(S).filter(t => t !== b);
      const t = isMafia(S, b) ? mafiaVoteTarget(S) : (others.includes(mem(S, b).found) ? mem(S, b).found : townPick(S, b, others));
      if (others.includes(t)) { accuse(S, b, t, 0.4, 'talk'); sayLine(b, pick(SUSPECT), { x: nm(S, t) }); }
      else sayLine(b, pick(CHATTER), { x: nm(S, pick(isMafia(S, b) ? townAlive(S).filter(u => u !== b) : others) || others[0]) });
    }
    lines.forEach(([b, t]) => feed(S, b, t));
  }

  // ---------- ведение партии (телефон-хозяин) ----------
  function feed(S, who, text) { S.feed.push([who, text]); S.feed = S.feed.slice(-12); }
  function newGame(hostId, hostName) {
    return { phase: 'lobby', host: hostId, players: { [hostId]: { name: hostName, bot: false } }, order: [hostId], ver: 1,
      night_no: 0, day_no: 0, deadline: 0, events: [], feed: [], notes: {}, votes: {}, night: {}, tovote: [], botAt: 0 };
  }
  const changed = S => { S.ver++; };
  const humans = S => S.order.filter(u => !S.players[u].bot);

  function addBot(S) {
    const used = S.order.map(u => S.players[u].name);
    const name = (BOT_NAMES.find(n => !used.includes(n + ' (бот)')) || 'Бот') + ' (бот)';
    let i = 1; while (S.players['b' + i]) i++;
    S.players['b' + i] = { name, bot: true }; S.order.push('b' + i);
  }
  function begin(S) {
    while (S.order.length < MIN) addBot(S);
    const roles = shuffle(rolePlan(S.order.length));
    S.order.forEach((u, i) => Object.assign(S.players[u], { role: roles[i], alive: true }));
    S.memory = { lastHeal: null, selfHealed: false, lastVisit: null, lastDance: null, silenced: null };
    const wife = S.order.find(u => role(S, u) === WIFE);
    S.husband = wife ? pick(S.order.filter(u => u !== wife)) : null;
    Object.assign(S, { intel: { acc: [], claims: {} }, botmem: {}, events: [], feed: [], notes: {}, night_no: 0, day_no: 0, result: null });
    startNight(S);
  }
  function startNight(S) {
    S.phase = 'night'; S.night_no++; S.night = {}; S.memory.silenced = null;
    S.deadline = now() + NIGHT; S.botAt = now() + 8 + rnd() * 15; changed(S);
  }
  function botsNight(S) {
    S.botAt = 0;
    nightTasks(S).forEach(([u, k, ts]) => { if (S.players[u].bot && !S.night[u + ':' + k]) recordAction(S, u, k, botTarget(S, u, k, ts)); });
  }
  function note(S, u, t) { if (!S.players[u].bot) (S.notes[u] = S.notes[u] || []).push(t); }
  function finishNight(S) {
    const res = resolveNight(S);
    S.notes = {};
    res.checks.forEach(([a, t, k, ok]) => {
      if (k === DON_CHECK && ok) mem(S, '_maf').sheriff = t;
      if (k === CHECK && S.players[a].bot) { if (ok) mem(S, a).found = t; else (mem(S, a).clean = mem(S, a).clean || []).push(t); }
      note(S, a, k === CHECK ? `🕵️ Проверка: ${nm(S, t)} — ${ok ? 'МАФИЯ!' : 'не мафия.'}` : `🎩 Проверка: ${nm(S, t)} — ${ok ? 'КОМИССАР!' : 'не комиссар.'}`);
    });
    if (res.blocked && S.players[res.blocked].alive) note(S, res.blocked, '💋 Ночью к вам заглянула Путана — если у вас был ход, он сорвался.');
    if (res.watch) {
      const [v, t, seen] = res.watch;
      if (S.players[v].bot) mem(S, v).seen = [S.night_no, t, seen];
      note(S, v, `👀 Подглядывая за ${nm(S, t)}, вы видели: ${seen.length ? seen.map(x => nm(S, x)).join(', ') : 'никто не приходил.'}`);
    }
    if (res.silenced) note(S, res.silenced, '💃 Вам станцевала Стриптизёрша — сегодня вы не голосуете.');
    S.events.push({ k: 'n', n: S.night_no, dead: res.dead, jl: res.jealous, sv: !!res.saved.length, sl: res.silenced });
    if (!checkWin(S)) startDay(S);
  }
  function startDay(S) {
    S.phase = 'day'; S.day_no++; S.tovote = []; S.deadline = now() + DAY; S.botAt = now() + 6 + rnd() * 10; S.talked = 0; changed(S);
  }
  function startVote(S) {
    if (!S.talked) botTalk(S);
    S.phase = 'vote'; S.votes = {}; S.deadline = now() + VOTE; S.botAt = now() + 6 + rnd() * 10; changed(S);
  }
  function botsVote(S) {
    S.botAt = 0;
    voters(S).forEach(b => { if (S.players[b].bot && !(b in S.votes)) recordVote(S, b, botVote(S, b)); });
  }
  function finishVote(S) {
    const c = tally(S), ty = Object.entries(c).sort((x, y) => y[1] - x[1]);
    const x = resolveVote(S);
    S.events.push({ k: 'v', d: S.day_no, x, ty });
    if (!checkWin(S)) startNight(S);
  }
  function checkWin(S) {
    const w = winner(S);
    if (w) end(S, w);
    return !!w;
  }
  function end(S, w) { S.phase = 'end'; S.result = w; S.ww = w !== 'stop' && wifeWon(S); S.deadline = 0; changed(S); }
  const humansDone = S => nightTasks(S).filter(([u]) => !S.players[u].bot).every(([u, k]) => S.night[u + ':' + k]);

  /** Таймеры: ходы ботов и конец фаз. Зовётся раз в секунду. */
  function tick(S) {
    if (S.phase === 'lobby' || S.phase === 'end') return;
    const t = now();
    if (S.botAt && t >= S.botAt) {
      if (S.phase === 'night') { botsNight(S); if (nightDone(S)) return finishNight(S); }
      else if (S.phase === 'day' && !S.talked) { S.talked = 1; S.botAt = 0; botTalk(S); changed(S); }
      else if (S.phase === 'vote') { botsVote(S); changed(S); if (voters(S).every(u => u in S.votes)) return finishVote(S); }
    }
    if (t < S.deadline) return;
    if (S.phase === 'night') { botsNight(S); finishNight(S); }
    else if (S.phase === 'day') startVote(S);
    else if (S.phase === 'vote') { botsVote(S); finishVote(S); }
  }

  /** Действие игрока. Возвращает текст-подсказку (или '' — молча). */
  function act(S, u, m) {
    const p = S.players[u], a = m.a, isHost = u === S.host;
    if (a === 'join') {
      if (p) { p.name = m.name || p.name; changed(S); return ''; }
      if (S.phase !== 'lobby') return 'Игра уже идёт — дождитесь конца';
      if (S.order.length >= MAX) return `Мест нет: уже ${MAX} игроков`;
      S.players[u] = { name: String(m.name || 'Игрок').slice(0, 20), bot: false }; S.order.push(u); changed(S); return '';
    }
    if (!p) return 'Вы не в игре';
    if (a === 'addbot' || a === 'delbot') {
      if (S.phase !== 'lobby') return '';
      if (a === 'addbot') { if (S.order.length >= MAX) return `Уже ${MAX} игроков`; addBot(S); }
      else { const b = S.order.filter(x => S.players[x].bot).pop(); if (!b) return 'Ботов нет'; S.order = S.order.filter(x => x !== b); delete S.players[b]; }
      changed(S); return '';
    }
    if (a === 'leave') {
      if (S.phase === 'lobby' && !isHost) { S.order = S.order.filter(x => x !== u); delete S.players[u]; changed(S); }
      return '';
    }
    if (a === 'begin') { if (!isHost) return 'Начинает создатель игры'; if (S.phase !== 'lobby') return ''; begin(S); return ''; }
    if (a === 'again') {
      if (!isHost || S.phase !== 'end') return '';
      S.phase = 'lobby'; S.order.forEach(x => { delete S.players[x].role; delete S.players[x].alive; }); changed(S); return '';
    }
    if (a === 'stop') { if (!isHost) return ''; if (!['lobby', 'end'].includes(S.phase)) end(S, 'stop'); return ''; }
    if (a === 'n' && S.phase === 'night') {
      let ok = false;
      Object.entries(m.acts || {}).forEach(([k, t]) => { ok = recordAction(S, u, k, t) || ok; });
      if (!ok) return 'Ход не принят';
      if (humansDone(S)) botsNight(S);
      changed(S);
      if (nightDone(S)) finishNight(S);
      return '✅ Ход принят';
    }
    if (a === 'v' && S.phase === 'vote') {
      if (!recordVote(S, u, m.t)) return 'Голос не принят';
      if (voters(S).filter(x => !S.players[x].bot).every(x => x in S.votes)) botsVote(S);
      changed(S);
      if (voters(S).every(x => x in S.votes)) finishVote(S);
      return '✅ Голос принят — его никто не увидит';
    }
    if (a === 'tv' && S.phase === 'day') {
      if (!voters(S).includes(u)) return 'Сегодня вы не голосуете';
      if (!S.tovote.includes(u)) S.tovote.push(u);
      voters(S).forEach(b => { if (S.players[b].bot && !S.tovote.includes(b)) S.tovote.push(b); });
      changed(S);
      if (S.tovote.length >= (voters(S).length >> 1) + 1) startVote(S);
      return '';
    }
    if (a === 'quit' && p.alive && !['lobby', 'end'].includes(S.phase)) {
      p.alive = false; delete S.votes[u];
      Object.keys(S.votes).forEach(v => { if (S.votes[v] === u) delete S.votes[v]; });
      feed(S, null, `🚪 ${p.name} вышел(ла) из игры. Роль: ${NAMES[p.role]}.`);
      changed(S);
      if (!checkWin(S) && S.phase === 'night' && nightDone(S)) finishNight(S);
      return 'Вы вышли из игры';
    }
    return '';
  }

  /** Что видит игрок u. */
  function view(S, u) {
    const p = S.players[u] || null, open = S.phase === 'end';
    const v = { ver: S.ver, phase: S.phase, me: u, host: S.host, n: S.night_no, d: S.day_no,
      left: S.deadline ? Math.max(0, Math.round(S.deadline - now())) : 0,
      pl: S.order.map(x => { const q = S.players[x]; return [x, q.name, q.bot ? 1 : 0, q.alive === false ? 0 : 1, (open || q.alive === false || x === u) ? q.role || '' : '']; }) };
    if (!p || S.phase === 'lobby') return v;
    v.role = p.role; v.alive = p.alive;
    if (isMafia(S, u)) v.mates = aliveWith(S, TEAM).filter(x => x !== u).map(x => nm(S, x));
    if (p.role === WIFE && S.husband) v.hb = nm(S, S.husband);
    v.ev = S.events.slice(-2); v.nt = S.notes[u] || []; v.fd = S.feed.slice(-8);
    if (S.phase === 'night' && p.alive) {
      v.tasks = {}; nightTasks(S).forEach(([x, k, ts]) => { if (x === u) v.tasks[k] = ts; });
      v.done = Object.keys(S.night).filter(k => k.split(':')[0] === u).map(k => k.split(':')[1]);
    }
    if (S.phase === 'day') v.tv = [S.tovote.length, (voters(S).length >> 1) + 1, S.tovote.includes(u) ? 1 : 0, voters(S).includes(u) ? 1 : 0];
    if (S.phase === 'vote') { v.vt = voters(S).includes(u) ? alive(S).filter(x => x !== u) : null; v.my = S.votes[u] || null; v.vc = [Object.keys(S.votes).length, voters(S).length]; }
    if (open) { v.result = S.result; v.ww = S.ww ? 1 : 0; }
    return v;
  }

  root.Mafia = { rolePlan, newGame, act, tick, view, NAMES, MIN, MAX, SKIP, seed: f => { rnd = f; }, setNow: f => { now = f; },
    _: { resolveNight, nightTasks, recordAction, winner, alive, begin } };
})(typeof window !== 'undefined' ? window : globalThis);
