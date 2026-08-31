/* =========================================================
   sim.js — 밸런싱 측정기

   실행:  node tools/sim.js [판수]

   게임 로직을 브라우저 없이 Node 에서 돌린다.
   화면·소리·저장은 껍데기로 대신하고, 판단만 봇이 대신한다.
   수백 판을 몇 초에 돌릴 수 있어서 "감"이 아니라 분포를 보고 숫자를 만질 수 있다.

   봇은 잘하는 사람이 아니라 "적당히 하는 사람"을 흉내낸다 —
   붙은 적은 때리고, 위험하면 물약을 마시고, 예고된 칸은 피하고,
   가까운 물건은 줍고, 없으면 계단으로 간다.
   ========================================================= */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const RUNS = Number(process.argv[2]) || 300;
// 잴 사람. 비우면 기본(기사). 클래스마다 싸움이 달라졌으므로 따로 재야 한다.
//   node tools/sim.js 120 elf
const HERO = (process.argv[3] || '').trim();

/* ---------- 껍데기 ---------- */

const timers = [];
function drainTimers() {
  let guard = 0;
  while (timers.length && guard++ < 10000) timers.shift()();
}

const store = {};
const ctx = {
  console, Math, JSON, Set, Map, Array, Object, String, Number, Boolean, Error, isNaN,
  performance: { now: () => Date.now() },
  setTimeout: (fn) => { timers.push(fn); return timers.length; },
  clearTimeout: () => {},
  requestAnimationFrame: () => {},
  localStorage: {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
  },
  window: { addEventListener: () => {}, innerWidth: 1280 },
  document: {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({ style: {}, classList: { add(){}, remove(){}, toggle(){} },
                            appendChild(){}, remove(){}, getContext: () => null }),
    addEventListener: () => {},
  },
  Image: function () { this.onload = null; },
  SPRITES: undefined,
};
ctx.globalThis = ctx;
vm.createContext(ctx);

// 화면 대신
const LOG = [];
ctx.UI = {
  log: (m, c) => LOG.push([c || '', m]),
  clearLog: () => { LOG.length = 0; },
  updateHud: () => {},
  updateGearStrip: () => {},
  updateBossBar: () => {},
  showGame: () => {}, showTitle: () => {},
  hideResult: () => {}, hideGearCompare: () => {}, hideShop: () => {}, hideCodex: () => {},
  gearOpen: () => false, shopOpen: () => false, codexOpen: () => false, campOpen: () => false,
  // 봇은 늘 몸을 녹인다 — 예전 모닥불과 같은 행동이라 이전 측정과 이어진다
  showCamp: (opts, pick) => { ctx.__campPick = pick; ctx.__campOpts = opts; }, hideCamp: () => {},
  intro: { active: false },
  setRecord: () => {},
  toast: (t) => { ctx.__lastToast = t; },
  showResult: (title) => { ctx.__result = title; },
  showEnding: () => { ctx.__ending = true; },
  // 층 진입 연출은 즉시 끝난 것으로
  showFloorIntro: (d, l, h, done) => done && done(),
  showCurtain: (t, l, h, done) => done && done(),
  closeIntro: () => {},
  // 장비 비교창 · 상점은 봇이 바로 결정한다
  showGearCompare: () => { ctx.__gearPending = true; },
  showShop: () => { ctx.__shopOpen = true; },
  setShopSay: () => {},
  showCodex: () => {},
  renderHeroPick: () => {},
};

ctx.Render = {
  init(){}, resize(){}, step(){}, draw(){},
  addFloater(){}, addShake(){}, addBeam(){}, addOrb(){}, addArrow(){}, addBlast(){},
  setBiome(){}, biomeKey: k => k,
  img: {}, ready: false,
};

/* ---------- 게임 코드 ---------- */

const FILES = ['js/config.js','js/util.js','js/sound.js','js/map.js','js/fov.js','js/actors.js',
               'js/heroes.js','js/levels.js','js/items.js','js/memories.js','js/pets.js','js/bosses.js','js/achievements.js','js/resume.js','js/game.js'];
for (const f of FILES) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
}
// 최상위 const 는 컨텍스트 객체에 안 붙으므로, 필요한 것만 꺼내 온다
const G = vm.runInContext(`({
  state, startRun, enterFloor, playerAction, drinkPotion, resolveGear, buyFromShop,
  monsterAt, isWalkable, blocksSight, DIRS, T, MONSTERS, GEAR, SLOTS, CFG,
  MEMORIES, ACHIEVEMENTS, BOSSES, isMagicAttack, chebyshev, compareRows, POTION_MAX, tileAt, LV,
  rangedTarget, canRanged, rangedReady, chooseHero, HEROES,
})`, ctx);

/* ---------- 봇 ---------- */

const DIRNAME = [[1,0,'right'],[-1,0,'left'],[0,1,'down'],[0,-1,'up']];
let declined = new Set();   // 이번 판에 거절한 장비

// 예고된 칸 전부
function markedTiles() {
  const out = new Set();
  for (const m of G.state.monsters) {
    if (!m.alive || !m.marks) continue;
    for (const [x, y] of m.marks) out.add(y * G.state.map.w + x);
  }
  return out;
}

function bfs(from, avoid) {
  const m = G.state.map;
  const prev = new Map(), dist = new Map([[from.y * m.w + from.x, 0]]);
  const q = [[from.x, from.y]];
  while (q.length) {
    const [x, y] = q.shift();
    const d = dist.get(y * m.w + x);
    for (const [dx, dy, name] of DIRNAME) {
      const nx = x + dx, ny = y + dy, k = ny * m.w + nx;
      if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h || dist.has(k)) continue;
      if (m.tiles[ny][nx] === G.T.WALL || m.tiles[ny][nx] === G.T.DOOR) continue;   // 잠긴 문은 못 지나간다
      if (avoid && G.monsterAt(nx, ny)) continue;
      dist.set(k, d + 1); prev.set(k, [x, y, name]); q.push([nx, ny]);
    }
  }
  return { dist, prev };
}

function stepToward(goal, avoid) {
  const p = G.state.player, m = G.state.map;
  const { dist, prev } = bfs(p, avoid);
  if (!goal || !dist.has(goal.y * m.w + goal.x)) return null;
  let cx = goal.x, cy = goal.y, dir = null;
  while (!(cx === p.x && cy === p.y)) {
    const e = prev.get(cy * m.w + cx);
    if (!e) return null;
    dir = e[2]; cx = e[0]; cy = e[1];
  }
  return dir;
}

// 장비를 바꿀지 — 대충의 값어치로 비교한다
function gearScore(g) {
  if (!g) return 0;
  const w = { atk: 3, sp: 3, def: 3.4, md: 2.2, spd: 2.6, maxHp: 0.9 };
  let v = 0;
  for (const [k, n] of Object.entries(g.mod)) v += n * (w[k] || 1);
  // 활은 스탯 밖의 값어치가 있다 — 들고 있는 것 자체가 원거리를 연다.
  // 이걸 안 치면 봇 엘프가 활을 검으로 바꿔 들고 정체성을 버린다.
  if (g.bow) v += 6;
  return v;
}

function botTurn() {
  const s = G.state, p = s.player, m = s.map;

  // 예고된 칸에 서 있으면 무조건 벗어난다 — 이게 보스전의 전부다
  const marks = markedTiles();
  if (marks.has(p.y * m.w + p.x)) {
    for (const [dx, dy, name] of DIRNAME) {
      const nx = p.x + dx, ny = p.y + dy;
      if (!G.isWalkable(m, nx, ny) || G.monsterAt(nx, ny)) continue;
      if (marks.has(ny * m.w + nx)) continue;
      return { dir: name, intent: 'move' };
    }
  }

  // 위험하면 물약
  if (p.hp <= p.maxHp * 0.42 && s.potions > 0) return { potion: true };

  // 붙어 있는 적은 때린다 (예고 칸으로 들어가면서까지는 아니고)
  for (const [dx, dy, name] of DIRNAME) {
    const t = G.monsterAt(p.x + dx, p.y + dy);
    if (t) return { dir: name, intent: 'move' };
  }

  // 원거리를 쏠 수 있는 턴이면 쏜다. 쓸 줄 아는지(기사 제외·활·기억)도,
  // 손이 돌아왔는지(재사용 간격)도 게임이 알아서 하므로
  // 봇도 사람과 똑같이 물어보기만 하면 된다.
  if (G.rangedReady() && G.rangedTarget(null)) {
    return { dir: null, intent: 'ranged' };
  }

  // 모닥불 · 상인 · 물건 · 계단
  const here = t => t && t.x === p.x && t.y === p.y;
  const { dist } = bfs(p, true);
  const reach = t => t && dist.has(t.y * m.w + t.x);

  if (m.camp && !here(m.camp) && p.hp < p.maxHp * 0.8 && reach(m.camp)) {
    const d = stepToward(m.camp, true); if (d) return { dir: d, intent: 'move' };
  }
  // 열쇠를 들고 있으면 금고부터 턴다. 안에 층수보다 앞선 장비가 있다.
  if (s.hasKey && m.vault && reach({ x: m.vault.cx, y: m.vault.cy })) {
    const d = stepToward({ x: m.vault.cx, y: m.vault.cy }, true);
    if (d) return { dir: d, intent: 'move' };
  }
  if (m.shop && !here(m.shop) && s.gold > 20 && reach(m.shop) && !s.__shopped) {
    const d = stepToward(m.shop, true); if (d) return { dir: d, intent: 'move' };
  }
  // 한 번 거절한 장비는 다시 주우러 가지 않는다.
  // (거절하면 바닥에 남으므로, 안 그러면 같은 자리를 영원히 오간다)
  // 이미 가득 찬 물약은 주우러 가지 않는다 (바닥에 남으므로 계속 왕복하게 된다)
  const items = m.items.filter(it => reach(it) && !here(it) &&
                                     !(it.type === 'gear' && declined.has(it.gear)) &&
                                     !(it.type === 'potion' && s.potions >= G.POTION_MAX))
    .map(it => ({ it, d: dist.get(it.y * m.w + it.x) }))
    .sort((a, b) => a.d - b.d);
  if (items.length && items[0].d <= 14) {
    const d = stepToward(items[0].it, true); if (d) return { dir: d, intent: 'move' };
  }
  // 보스층에서 계단은 보스 자리다 — 결국 보스를 치러 간다
  const d = stepToward(m.stairs, true) || stepToward(m.stairs, false);
  return d ? { dir: d, intent: 'move' } : { wait: true };
}

/* ---------- 한 판 ---------- */

function playRun() {
  ctx.__result = null; ctx.__ending = false; ctx.__gearPending = false; ctx.__shopOpen = false;
  declined = new Set();
  if (HERO) G.chooseHero(HERO);   // localStorage 를 매 판 비우므로 매 판 다시 고른다
  G.startRun();
  drainTimers();

  const perFloor = [];      // 층 진입 시점의 체력 비율
  let lastDepth = 0;
  let steps = 0;

  for (; steps < 6000; steps++) {
    drainTimers();
    const s = G.state;

    if (!s.player.alive || ctx.__result || ctx.__ending) break;

    if (s.depth !== lastDepth) {
      perFloor.push({ depth: s.depth, hpPct: s.player.hp / s.player.maxHp });
      lastDepth = s.depth;
      s.__shopped = false;
    }

    // 장비 비교창이 떴으면 결정
    if (ctx.__gearPending) {
      ctx.__gearPending = false;
      const g = s.pendingGear;
      const take = g && gearScore(g) > gearScore(s.player.gear[g.slot]);
      if (!take && g) declined.add(g);
      G.resolveGear(!!take);
      continue;
    }
    /* 모닥불 앞이거나 동행을 고르는 자리. 같은 창을 쓰므로 여기서 함께 받는다.
       모닥불은 늘 몸을 녹이고(예전과 같은 행동이라 이전 측정과 이어진다),
       동행은 먼저 나온 것을 고른다. */
    if (ctx.__campPick) {
      const pick = ctx.__campPick;
      const opts = ctx.__campOpts || [];
      ctx.__campPick = null; ctx.__campOpts = null;
      pick(opts.some(o => o.id === 'warm') ? 'warm' : (opts[0] && opts[0].id));
      continue;
    }
    // 상점이 열렸으면 살 수 있는 것을 산다
    if (ctx.__shopOpen) {
      ctx.__shopOpen = false;
      s.__shopped = true;
      s.shopStock.forEach((e, i) => {
        if (e.sold || s.gold < e.price) return;
        if (e.kind === 'gear' && gearScore(e.gear) <= gearScore(s.player.gear[e.gear.slot])) return;
        G.buyFromShop(i);
      });
      // 남은 골드로 물약 — 재고가 있으니 살 수 있는 만큼 산다
      for (let guard = 0; guard < 12; guard++) {
        const i = s.shopStock.findIndex(e => !e.sold && e.kind === 'potion' && s.gold >= e.price);
        if (i < 0) break;
        G.buyFromShop(i);
      }
      continue;
    }

    if (!s.running || !s.awaitingInput) { drainTimers(); continue; }

    const act = botTurn();
    if (act.potion) G.drinkPotion();
    else if (act.wait) G.playerAction(null, 'wait');
    else G.playerAction(act.dir, act.intent);
  }

  drainTimers();
  const s = G.state;
  return {
    depth: s.depth,
    cleared: !!ctx.__ending,
    alive: s.player.alive,
    kills: s.kills,
    gold: s.gold,
    turns: s.turns,
    steps,
    memories: s.memories.size,
    level: s.level,
    magic: G.isMagicAttack(s.player),
    gear: G.SLOTS.map(sl => s.player.gear[sl] ? s.player.gear[sl].name : null),
    perFloor,
  };
}

/* ---------- 돌리고 정리 ---------- */

/* 두 집단을 따로 잰다.
   기억은 판을 넘어 쌓이므로, 그냥 이어서 돌리면 뒤로 갈수록 쉬워진다.
   "처음 잡는 사람"과 "다 모은 사람"의 난이도는 완전히 다른 숫자다. */

function runCohort(n, fresh) {
  const out = [];
  if (fresh) {
    for (let i = 0; i < n; i++) {
      ctx.localStorage.clear();          // 매 판 기억 0에서 시작
      out.push(playRun());
    }
  } else {
    ctx.localStorage.clear();
    // 기억을 다 모을 때까지 예열한 뒤 측정한다
    for (let i = 0; i < 40 && vm.runInContext('(loadData()||{}).memories||[]', ctx).length < 9; i++) {
      playRun();
    }
    for (let i = 0; i < n; i++) out.push(playRun());
  }
  return out;
}

function report(label, runs) {
  const RUNS = runs.length;
  const deaths = new Array(17).fill(0);
  for (const r of runs) deaths[Math.min(16, r.depth)]++;
  const reached = d => runs.filter(r => r.depth >= d).length;
  const cleared = runs.filter(r => r.cleared).length;

  console.log(`\n=== ${label} (${RUNS}판) ===`);
  console.log('층   도달률   여기서 끝    진입 체력');
  for (let d = 1; d <= 15; d++) {
    const rc = reached(d);
    const hps = runs.flatMap(r => r.perFloor.filter(f => f.depth === d).map(f => f.hpPct));
    const avg = hps.length ? (hps.reduce((a, b) => a + b, 0) / hps.length * 100).toFixed(0) + '%' : '—';
    const bar = '█'.repeat(Math.round(rc / RUNS * 24));
    const mark = [5,10,15].includes(d) ? ' ← 보스' : (G.CFG.REST_FLOORS.includes(d) ? ' ← 안식처' : '');
    console.log(String(d).padStart(2) + '   ' + (rc / RUNS * 100).toFixed(0).padStart(3) + '%   ' +
      String(deaths[d]).padStart(3) + '판   ' + avg.padStart(4) + '   ' + bar + mark);
  }
  const avgOf = f => (runs.reduce((a, r) => a + f(r), 0) / RUNS).toFixed(1);
  console.log(`클리어 ${cleared}판 (${(cleared / RUNS * 100).toFixed(1)}%) · ` +
              `평균 도달 ${avgOf(r => r.depth)}층 · 처치 ${avgOf(r => r.kills)} · ` +
              `걸음 ${avgOf(r => r.turns)} · 기억 ${avgOf(r => r.memories)} · ` +
              `레벨 ${avgOf(r => r.level)} · ` +
              `마법 빌드 ${(runs.filter(r => r.magic).length / RUNS * 100).toFixed(0)}%`);
  for (const d of [5, 10, 15]) {
    const at = reached(d), past = d === 15 ? cleared : reached(d + 1);
    console.log(`  ${d}층 보스 — 도달 ${at}판 중 ${past}판 통과 (${at ? (past / at * 100).toFixed(0) : 0}%)`);
  }
}

// --fresh: 처음 집단만 잰다. 숫자를 반복해서 만질 때는 이것부터 본다.
const FRESH_ONLY = process.argv.includes('--fresh');

console.log(`${RUNS}판씩 ${FRESH_ONLY ? '처음 집단만' : '두 집단'} 시뮬레이션...` + (HERO ? ` (${HERO})` : ''));
const t0 = Date.now();
const freshRuns = runCohort(RUNS, true);
if (FRESH_ONLY) {
  report('처음 오르는 사람 — 기억 0개' + (HERO ? ` · ${HERO}` : ''), freshRuns);
  console.log(`\n(${((Date.now() - t0) / 1000).toFixed(1)}초)`);
  process.exit(0);
}
const fullRuns  = runCohort(RUNS, false);
const secs = ((Date.now() - t0) / 1000).toFixed(1);
report('처음 오르는 사람 — 기억 0개', freshRuns);
report('다 되찾은 사람 — 기억 9개', fullRuns);
/* 이어서 하는 사람 — 기억이 몇 판 만에 모이고 언제 처음 끝을 보는가.
   한 번만 재면 운에 휘둘리므로 여러 번 돌려 중앙값을 본다.
   메타 진행의 속도가 이 게임의 수명을 정한다. */
const JOURNEYS = 10, MAXRUN = 40;
const firstClears = [], fullMems = [], firstMems = [];
let sample = null;
for (let t = 0; t < JOURNEYS; t++) {
  ctx.localStorage.clear();
  const j = [];
  for (let i = 1; i <= MAXRUN; i++) {
    const r = playRun();
    const got = vm.runInContext('(loadData()||{}).memories||[]', ctx).length;
    j.push({ run: i, depth: r.depth, mem: got, cleared: r.cleared });
    if (got >= 9 && j.some(x => x.cleared)) break;
  }
  const fc = j.find(x => x.cleared), fm = j.find(x => x.mem >= 9), f1 = j.find(x => x.mem >= 1);
  firstClears.push(fc ? fc.run : MAXRUN + 1);
  fullMems.push(fm ? fm.run : MAXRUN + 1);
  firstMems.push(f1 ? f1.run : MAXRUN + 1);
  if (t === 0) sample = j;
}
const med = arr => [...arr].sort((a, b) => a - b)[Math.floor(arr.length / 2)];
console.log('\n=== 이어서 하는 사람 (' + JOURNEYS + '명) ===');
console.log('첫 판 예시: ' +
  sample.slice(0, 14).map(j => `${j.run}판 ${j.depth}층/기억${j.mem}${j.cleared ? '★' : ''}`).join('  '));
console.log(`첫 기억까지      중앙값 ${med(firstMems)}판   (${firstMems.join(',')})`);
console.log(`첫 클리어까지    중앙값 ${med(firstClears)}판   (${firstClears.join(',')})`);
console.log(`기억 아홉 개까지 중앙값 ${med(fullMems)}판   (${fullMems.join(',')})`);
console.log(`\n(${secs}초)`);
process.exit(0);

const runs = freshRuns;

const deaths = new Array(17).fill(0);
for (const r of runs) deaths[Math.min(16, r.depth)]++;

const reached = d => runs.filter(r => r.depth >= d).length;

console.log(`=== 어디까지 갔나 (${RUNS}판, ${secs}초) ===`);
console.log('층   도달률   그 층에서 끝난 판   진입 시 평균 체력');
for (let d = 1; d <= 15; d++) {
  const rc = reached(d);
  const hps = runs.flatMap(r => r.perFloor.filter(f => f.depth === d).map(f => f.hpPct));
  const avg = hps.length ? (hps.reduce((a, b) => a + b, 0) / hps.length * 100).toFixed(0) + '%' : '—';
  const bar = '█'.repeat(Math.round(rc / RUNS * 30));
  const mark = [5,10,15].includes(d) ? ' ← 보스' : (CFGREST(d) ? ' ← 안식처' : '');
  console.log(
    String(d).padStart(2) + '   ' +
    (rc / RUNS * 100).toFixed(0).padStart(3) + '%   ' +
    String(deaths[d]).padStart(3) + '판              ' +
    avg.padStart(4) + '   ' + bar + mark);
}
function CFGREST(d) { return G.CFG.REST_FLOORS.includes(d); }

const cleared = runs.filter(r => r.cleared).length;
console.log(`\n클리어 ${cleared}판 (${(cleared / RUNS * 100).toFixed(1)}%)`);

const avgOf = f => (runs.reduce((a, r) => a + f(r), 0) / RUNS).toFixed(1);
console.log(`평균 — 도달 ${avgOf(r => r.depth)}층 · 처치 ${avgOf(r => r.kills)} · ` +
            `걸음 ${avgOf(r => r.turns)} · 기억 ${avgOf(r => r.memories)}`);
console.log(`마법 빌드로 끝난 판: ${(runs.filter(r => r.magic).length / RUNS * 100).toFixed(0)}%`);

// 보스 관문 통과율
console.log('\n=== 관문 ===');
for (const d of [5, 10, 15]) {
  const at = reached(d), past = reached(d + 1) + (d === 15 ? cleared : 0);
  console.log(`  ${d}층 보스 — 도달 ${at}판 중 ${d === 15 ? cleared : reached(d + 1)}판 통과 ` +
              `(${at ? ((d === 15 ? cleared : reached(d + 1)) / at * 100).toFixed(0) : 0}%)`);
}
