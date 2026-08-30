/* =========================================================
   resume.js — 하던 판을 이어서

   한 판이 스무 남짓 걸리는데 탭을 닫으면 통째로 날아간다.
   폰에서 전화가 오거나 화면이 잠기면 그것으로 끝이다.
   "하다가 끊겨서 다시 안 하게 됐다"가 가장 흔한 이탈 이유라,
   재미를 더하는 기능이 아니라 잃는 것을 막는 장치다.

   기억·업적과는 다른 칸에 저장한다. 판은 끝나면 지워야 하고,
   기억은 판을 넘어 남아야 하므로 수명이 다르다.
   ========================================================= */

const RUN_KEY = 'jaetbul.run.v1';

/* 지도는 숫자가 수천 개라 그대로 넣으면 덩치가 커진다.
   타일 값이 0~5, 탐험 여부가 0/1 이므로 줄마다 문자열 하나로 접는다. */
function packGrid(rows, toChar) {
  return rows.map(r => r.map(toChar).join('')).join('|');
}
function unpackGrid(text, fromChar) {
  return text.split('|').map(line => [...line].map(fromChar));
}

function saveRun() {
  // running 을 기준으로 삼으면 층 진입 연출 중에는 저장이 걸리지 않는다.
  // 그 몇 초 사이에 탭이 닫히면 한 층을 통째로 잃으므로 별도 표시를 쓴다.
  if (!state.resumable || !state.map || !state.player || !state.player.alive) return;
  const m = state.map, p = state.player;
  try {
    localStorage.setItem(RUN_KEY, JSON.stringify({
      v: 1,
      hero: currentHero().id,
      depth: state.depth, gold: state.gold, potions: state.potions,
      kills: state.kills, turns: state.turns, ember: state.ember,
      level: state.level, xp: state.xp,
      hasKey: state.hasKey, chill: state.chill, burn: state.burn,
      campUses: state.campUses, revived: state.revived,
      hurt: state.hurtThisFloor, gotMemory: state.gotMemoryThisRun,
      seen: [...state.seenMonsters],
      tag: state.floorTag,
      shop: state.shopStock,

      player: { x: p.x, y: p.y, hp: p.hp, maxHp: p.maxHp, energy: p.energy,
                gear: p.gear, face: p.face },

      monsters: state.monsters.filter(x => x.alive).map(x => ({
        id: x.defId, x: x.x, y: x.y, hp: x.hp, energy: x.energy,
        casting: x.casting, hasKey: !!x.hasKey, boss: !!x.boss,
        pending: x.pending || null, marks: x.marks || null,
        seenBoss: !!x.seen,
      })),

      map: {
        w: m.w, h: m.h,
        tiles: packGrid(m.tiles, t => String(t)),
        explored: packGrid(m.explored, e => (e ? '1' : '0')),
        rooms: m.rooms, start: m.start, stairs: m.stairs,
        camp: m.camp || null, shop: m.shop || null,
        vault: m.vault || null, doors: m.doors || null, torches: m.torches || null,
        items: m.items,
      },
    }));
  } catch (e) { /* 저장 공간이 막혀 있어도 게임은 계속 돌아가야 한다 */ }
}

function savedRun() {
  try {
    const raw = localStorage.getItem(RUN_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    return d && d.v === 1 ? d : null;
  } catch (e) { return null; }
}

function clearRun() {
  try { localStorage.removeItem(RUN_KEY); } catch (e) {}
}

function resumeRun() {
  const d = savedRun();
  if (!d) return false;

  chooseHero(d.hero);

  state.depth = d.depth; state.gold = d.gold; state.potions = d.potions;
  state.kills = d.kills; state.turns = d.turns; state.ember = d.ember;
  // 레벨은 스탯을 다시 세우기 전에 넣어야 recalcStats 가 제대로 계산한다
  state.level = d.level || 1; state.xp = d.xp || 0;
  state.hasKey = d.hasKey; state.chill = d.chill || 0; state.burn = d.burn || 0;
  state.campUses = d.campUses; state.revived = d.revived;
  state.hurtThisFloor = d.hurt; state.gotMemoryThisRun = d.gotMemory;
  state.seenMonsters = new Set(d.seen || []);
  state.floorTag = d.tag || { id: null, hint: '', monsterMul: 1, fovAdd: 0 };
  state.shopStock = d.shop || [];
  state.pendingGear = null; state.pendingMemory = null;

  const save = loadData() || {};
  state.memories = new Set(save.memories || []);
  state.pity = save.pity || 0;

  // 사람
  const p = makePlayer();
  p.gear = d.player.gear;
  recalcStats(p);                       // 장비와 기억에서 스탯을 다시 만든다
  p.x = d.player.x; p.y = d.player.y;
  p.rx = p.x; p.ry = p.y;
  p.hp = clamp(d.player.hp, 1, p.maxHp);
  p.energy = d.player.energy;
  p.face = d.player.face || 1;
  state.player = p;

  // 지도
  const M = d.map;
  state.map = {
    w: M.w, h: M.h,
    tiles: unpackGrid(M.tiles, c => Number(c)),
    explored: unpackGrid(M.explored, c => c === '1'),
    rooms: M.rooms, start: M.start, stairs: M.stairs, depth: d.depth,
    camp: M.camp || undefined, shop: M.shop || undefined,
    vault: M.vault || undefined, doors: M.doors || undefined,
    torches: M.torches || [],
    items: M.items || [],
  };

  // 몬스터. 보스는 그 층의 정의에서 다시 세운다.
  state.monsters = [];
  state.boss = null;
  for (const s of d.monsters) {
    let mon;
    if (s.boss && BOSSES[d.depth]) {
      mon = makeBoss(BOSSES[d.depth], s.x, s.y);
      mon.seen = s.seenBoss;
      state.boss = mon;
    } else {
      const def = MONSTERS.find(x => x.id === s.id);
      if (!def) continue;
      mon = makeMonster(def, s.x, s.y);
    }
    mon.hp = s.hp; mon.energy = s.energy; mon.casting = s.casting;
    mon.hasKey = s.hasKey;
    mon.pending = s.pending; mon.marks = s.marks;
    state.monsters.push(mon);
  }

  applyFov();
  refreshFov();
  UI.clearLog();
  UI.hideGearCompare(); UI.hideShop(); UI.hideResult();
  UI.showGame();
  UI.updateHud(state);
  if (typeof paintTouch === 'function') paintTouch();

  state.running = true;
  state.awaitingInput = true;
  state.resumable = true;
  Sound.setFloor(d.depth);
  UI.log(d.depth + '층에서 이어 오릅니다.', 'sys');
  return true;
}
