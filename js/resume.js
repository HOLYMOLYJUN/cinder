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

/* 판 하나를 통째로 접어 객체 하나로 만든다.

   저장과 방송이 같은 것을 쓴다. 관전은 "이어하기 저장을 실시간으로 훔쳐보는 것"이라
   전송 포맷을 따로 만들 이유가 없었다 — 이미 판 전체가 몇 KB로 접히고 있었으므로.
   그래서 이 함수는 만들기만 하고, 어디에 쓸지는 부르는 쪽이 정한다. */
function packRun() {
  // running 을 기준으로 삼으면 층 진입 연출 중에는 저장이 걸리지 않는다.
  // 그 몇 초 사이에 탭이 닫히면 한 층을 통째로 잃으므로 별도 표시를 쓴다.
  if (!state.resumable || !state.map || !state.player || !state.player.alive) return null;
  // 남의 판을 보고 있는 중이라면 그것은 내 판이 아니다. 저장도 방송도 하지 않는다.
  if (state.spectating) return null;

  const m = state.map, p = state.player;
  return {
      v: 2,
      hero: currentHero().id,
      /* 기억을 함께 싣는다. 예전에는 복원할 때 그 브라우저 주인의 저장값에서 읽었는데,
         남의 판을 그렇게 복원하면 관전자의 기억으로 스탯을 세워 수치가 딴판이 된다. */
      memories: [...(state.memories || [])],
      // 이 판이 오르던 탑이 어느 날의 것인가. 없으면 자정을 넘겨 이어했을 때
      // 다음 층부터 다른 지형이 나오고, 흔적도 남의 날짜를 가리키게 된다
      day: state.day,
      depth: state.depth, gold: state.gold, potions: state.potions,
      kills: state.kills, turns: state.turns, ember: state.ember,
      level: state.level, xp: state.xp,
      hasKey: state.hasKey, chill: state.chill, burn: state.burn,
      ashHp: state.ashHp || 0,   // 스탯을 다시 세우므로 이게 없으면 최대 체력이 되돌아간다
      // 곁에 있는 것. 스탯과 불씨 반경이 여기 달려 있어서 빠뜨리면 조용히 약해진다
      pet: state.pet ? { id: state.pet.id, x: state.pet.x, y: state.pet.y } : null,
      regen: state.regen || 0,   // 걸음 눈금. 없으면 이어할 때마다 처음부터 센다
      campUses: state.campUses, revived: state.revived,
      hurt: state.hurtThisFloor, gotMemory: state.gotMemoryThisRun,
      seen: [...state.seenMonsters],
      tag: state.floorTag,
      shop: state.shopStock,

      player: { x: p.x, y: p.y, hp: p.hp, maxHp: p.maxHp, energy: p.energy,
                gear: p.gear, face: p.face },

      monsters: state.monsters.filter(x => x.alive).map(x => ({
        uid: x.uid, id: x.defId, x: x.x, y: x.y, hp: x.hp, energy: x.energy,
        casting: x.casting, hasKey: !!x.hasKey, boss: !!x.boss,
        pending: x.pending || null, marks: x.marks || null,
        seenBoss: !!x.seen,
        elite: x.elite || null,   // 접두사를 잃으면 이어할 때 갑자기 순해진다
      })),

      map: {
        w: m.w, h: m.h,
        tiles: packGrid(m.tiles, t => String(t)),
        explored: packGrid(m.explored, e => (e ? '1' : '0')),
        rooms: m.rooms, start: m.start, stairs: m.stairs,
        camp: m.camp || null, shop: m.shop || null,
        vault: m.vault || null, doors: m.doors || null, torches: m.torches || null,
        props: m.props || null,
        items: m.items,
      },
  };
}

function saveRun() {
  const d = packRun();
  if (!d) return;
  try {
    localStorage.setItem(RUN_KEY, JSON.stringify(d));
  } catch (e) { /* 저장 공간이 막혀 있어도 게임은 계속 돌아가야 한다 */ }
  // 방송 중이면 같은 것이 그대로 나간다. 아니면 아무 일도 일어나지 않는다.
  if (typeof Cast !== 'undefined') Cast.push(d);
}

function savedRun() {
  try {
    const raw = localStorage.getItem(RUN_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    // v1 도 받는다. 기억이 빠져 있을 뿐이고, 그건 아래에서 내 저장값으로 메운다.
    return d && (d.v === 1 || d.v === 2) ? d : null;
  } catch (e) { return null; }
}

function clearRun() {
  try { localStorage.removeItem(RUN_KEY); } catch (e) {}
}

/* 접어 둔 판을 펼친다.

   ── opts ──
   spectate : 남의 판이다. 내 저장값(고른 사람·기억)을 건드리지 않고,
              끝나고 나면 되돌릴 수 있게 덮어쓰기만 한다.
   quiet    : 이어지는 스냅샷이다. 로그를 비우거나 창을 여닫지 않고,
              그려지던 좌표(rx·ry)를 이어받아 미끄러지듯 움직이게 한다. */
function loadRun(d, opts) {
  if (!d) return false;
  opts = opts || {};

  /* 이전 프레임에서 그려지던 자리를 표로 들고 있는다.
     이걸 안 이어받으면 스냅샷마다 엔티티가 새로 태어나서,
     이 게임이 공들인 보간이 관전에서만 죽고 순간이동하는 것처럼 보인다. */
  const prevMon = new Map();
  let prevPlayer = null;
  const prevDepth = state.depth;
  if (opts.quiet) {
    for (const m of state.monsters || []) if (m.uid != null) prevMon.set(m.uid, m);
    prevPlayer = state.player;
  }

  if (opts.spectate) setHeroOverride(d.hero);
  else { setHeroOverride(null); chooseHero(d.hero); }

  state.day = d.day || towerDay();      // 옛날 저장에는 없다 — 오늘 것으로 본다
  state.depth = d.depth; state.gold = d.gold; state.potions = d.potions;
  state.kills = d.kills; state.turns = d.turns; state.ember = d.ember;
  // 레벨은 스탯을 다시 세우기 전에 넣어야 recalcStats 가 제대로 계산한다
  state.level = d.level || 1; state.xp = d.xp || 0;
  state.hasKey = d.hasKey; state.chill = d.chill || 0; state.burn = d.burn || 0;
  state.rangedCd = 0;   // 한 턴짜리 상태라 저장하지 않는다 — 켜자마자 쏠 수 있으면 된다
  state.regen = d.regen || 0;
  // 배경은 층에서 정해지므로 따로 저장하지 않는다. 다만 다시 세워 주지 않으면
  // 이어하기나 관전으로 11층에 들어갔을 때 1층 돌벽으로 그려진다.
  Render.setBiome(d.depth);
  state.campUses = d.campUses; state.revived = d.revived;
  state.hurtThisFloor = d.hurt; state.gotMemoryThisRun = d.gotMemory;
  state.seenMonsters = new Set(d.seen || []);
  state.floorTag = d.tag || { id: null, hint: '', monsterMul: 1, fovAdd: 0 };
  state.shopStock = d.shop || [];
  state.pendingGear = null; state.pendingMemory = null;

  /* 기억은 블롭에서 온다. 여기서 내 저장값을 읽으면 남의 판을 내 기억으로
     계산하게 되어 관전 화면의 체력과 공격력이 실제와 달라진다.
     기억이 없는 옛 저장(v1)만 내 것으로 메운다 — 그건 어차피 내 판이다. */
  const save = loadData() || {};
  state.memories = new Set(d.memories || save.memories || []);
  state.pity = save.pity || 0;

  // 사람
  const p = makePlayer();
  p.gear = d.player.gear;
  state.ashHp = d.ashHp || 0;           // recalcStats 가 이걸 보므로 그 전에 넣는다
  // 곁에 있는 것도 스탯에 얹히므로 역시 그 전에 (그려지는 자리는 아래에서 이어받는다)
  const prevPet = state.pet;
  state.pet = d.pet ? { ...d.pet, rx: d.pet.x, ry: d.pet.y, face: 1 } : null;
  if (state.pet && prevPet && prevPet.id === state.pet.id) {
    state.pet.rx = prevPet.rx; state.pet.ry = prevPet.ry; state.pet.face = prevPet.face;
  }
  recalcStats(p);                       // 장비와 기억에서 스탯을 다시 만든다
  p.x = d.player.x; p.y = d.player.y;
  p.rx = p.x; p.ry = p.y;
  p.hp = clamp(d.player.hp, 1, p.maxHp);
  p.energy = d.player.energy;
  p.face = d.player.face || 1;
  if (prevPlayer) { p.rx = prevPlayer.rx; p.ry = prevPlayer.ry; }
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
    props: M.props || [],
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
      mon = makeMonster(def, s.x, s.y, s.elite || null);
    }
    mon.hp = s.hp; mon.energy = s.energy; mon.casting = s.casting;
    mon.hasKey = s.hasKey;
    mon.pending = s.pending; mon.marks = s.marks;
    if (s.uid != null) {
      mon.uid = s.uid;                       // 표를 그대로 물려받는다
      const was = prevMon.get(s.uid);
      if (was) { mon.rx = was.rx; mon.ry = was.ry; mon.face = was.face; }
    }
    state.monsters.push(mon);
  }

  applyFov();
  refreshFov();

  if (!opts.quiet) {
    UI.clearLog();
    UI.hideGearCompare(); UI.hideShop(); UI.hideCamp(); UI.hideResult();
    UI.showGame();
  }
  UI.updateHud(state);
  if (typeof paintTouch === 'function') paintTouch();

  state.running = true;
  /* 관전은 보는 것이지 두는 것이 아니다. 입력을 기다리지 않고,
     이어하기로 저장되지도 않는다 — 남의 판이 내 이어하기를 덮어쓰면 안 된다. */
  state.awaitingInput = !opts.spectate;
  state.resumable = !opts.spectate;

  // 층이 바뀔 때만 배경음을 옮긴다. 매 턴 다시 걸면 드론이 끊긴다.
  if (!opts.quiet || prevDepth !== d.depth) Sound.setFloor(d.depth);
  if (!opts.quiet && !opts.spectate) UI.log(d.depth + '층에서 이어 오릅니다.', 'sys');
  return true;
}

function resumeRun() {
  return loadRun(savedRun());
}
