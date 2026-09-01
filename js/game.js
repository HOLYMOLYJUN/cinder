/* =========================================================
   game.js — 상태, 턴 루프, 입력

   턴 루프는 처음부터 "속도 = 한 턴의 행동 횟수"를 전제로 짰다.
   나중에 얹으려면 전투 코드를 통째로 헤집게 되기 때문이다.

   모든 행동자는 매 틱 자기 속도만큼 에너지를 모으고,
   100이 차면 한 번 행동하고 100을 쓴다.
   속도 20인 박쥐는 속도 10인 플레이어의 두 배로 움직인다.
   ========================================================= */

const state = {
  running: false,
  depth: 1,
  map: null,
  player: null,
  monsters: [],
  boss: null,
  visible: new Set(),
  fovRadius: CFG.FOV_RADIUS,
  gold: 0,
  potions: 1,
  pouches: 0,              // 산 물약 주머니 수 — 소지 한도를 늘린다
  kills: 0,
  turns: 0,
  awaitingInput: false,
  floorTag: null,
  pendingGear: null,      // 밟았지만 아직 비교창을 못 띄운 장비
  shopStock: [],

  memories: new Set(),    // 되찾은 기억 — 죽어도 남는다
  pity: 0,                // 기억 없이 끝난 판 수 (누적 확률 보정)
  pendingMemory: null,
  gotMemoryThisRun: false,
  campUses: 0,
  revived: false,
  seenMonsters: new Set(),
  ember: 0,               // 불씨 밝기 -1 / 0 / +1
  hasKey: false,          // 보물방 열쇠를 들고 있는가
  chill: 0,               // 몸이 굳은 턴 수
  burn: 0,                // 불이 붙은 턴 수
  rangedCd: 0,            // 던진 손이 돌아오기까지 남은 턴
  ashHp: 0,               // 모닥불에서 재를 삼켜 늘린 최대 체력 (판이 끝나면 사라진다)
  campSpot: null,         // 지금 고르고 있는 모닥불 자리
  pet: null,              // 따라오는 것 — 5층 문지기를 넘으면 붙는다 (js/pets.js)
  lastKiller: '',         // 마지막으로 나를 때린 것 — 쓰러진 자리에 남는다
  resumable: false,       // 지금 상태를 이어할 수 있는가
  spectating: false,      // 남의 판을 보고 있는가 — 그러면 저장도 입력도 멈춘다

  level: 1,               // 이번 판의 레벨 — 죽으면 사라진다
  xp: 0,                  // 다음 레벨까지 모은 경험치
};

/* 물약. 예전에는 한 병에 18을 채우고 열 병까지 들었다 — 합쳐서 180이라
   웬만한 사람의 그릇 세 배였고, 그래서 「위험하다」가 「물약 마신다」로 끝났다.
   회복량과 한도를 같이 줄인다. 둘 중 하나만 줄이면 나머지가 메운다. */
const POTION_HEAL = 8;      // 한 병이 채우는 체력
const POTION_MAX_BASE = 5;  // 맨몸으로 들 수 있는 병 수

/* 주머니를 사면 더 들 수 있다. 한도를 그냥 낮춰만 두면 후반에 골드를 쓸 데가
   장비뿐이라 상점이 「살 게 없는 층」이 되는데, 여기가 그 자리를 메운다 —
   물약을 더 드는 것과 장비를 하나 더 두드리는 것이 경쟁하게 된다. */
const POUCH_GAIN = 2;       // 주머니 하나에 늘어나는 병 수
const POUCH_MAX  = 2;       // 주머니 상한 — 5 → 9 까지만

function potionMax() {
  return POTION_MAX_BASE + (state.pouches || 0) * POUCH_GAIN;
}
function pouchPrice() {
  // 두 번째가 눈에 띄게 비싸야 「하나로 족한가」를 한 번 묻게 된다
  return [60, 130][state.pouches || 0] || 999;
}

const held = new Set();     // 지금 눌려 있는 모디파이어 키
const modUsed = new Set();  // 그 키가 방향과 함께 쓰였는가

/* =========================================================
   판 시작 / 층 이동
   ========================================================= */

function startRun() {
  // 새 판을 시작하는 것은 관전을 그만두는 것이기도 하다.
  // 안 풀면 남의 사람(setHeroOverride)으로 내 판의 스탯을 세우게 된다.
  if (state.spectating) {
    state.spectating = false;
    setHeroOverride(null);
    if (typeof Cast !== 'undefined') { Cast.watching = null; Cast.paint(); }
  }
  clearRun();
  state.resumable = false;
  /* 이 판이 오르는 탑은 「시작한 날」의 탑이다. 매 층 새로 물으면
     자정(UTC)을 넘기는 순간 오르던 탑이 발밑에서 바뀐다. */
  state.day = towerDay();
  state.depth = 1;
  state.gold = 0;
  state.potions = 2;
  state.pouches = 0;
  state.kills = 0;
  state.turns = 0;
  state.pendingGear = null;
  state.pendingMemory = null;
  state.gotMemoryThisRun = false;
  state.revived = false;
  /* 「어떻게 올랐는가」를 세는 눈금들. 판이 끝날 때 업적이 이걸 본다.
     층마다 리셋되는 campUses 와 달리 이건 판 하나를 통째로 산다. */
  state.usedCamp = false;
  state.traded = false;
  state.usedMelee = false;
  state.usedRanged = false;
  state.couldRanged = false;     // 쏠 수 있는 상태가 한 번이라도 됐는가
  state.seenMonsters = new Set();
  state.ember = 0;
  state.hasKey = false;
  state.chill = 0;
  state.burn = 0;
  state.rangedCd = 0;
  state.ashHp = 0;
  state.campSpot = null;
  state.pet = null;       // 판을 넘어 남지 않는다 — 이번 판의 동행이다
  state.level = 1;
  state.xp = 0;
  Render.dawnAt = 0;      // 다시 밤부터

  // 되찾은 기억은 판을 넘어 남는다
  const save = loadData() || {};
  state.memories = new Set(save.memories || []);
  state.pity = save.pity || 0;

  state.player = makePlayer();
  // 시작 무기가 정해진 사람은 들고 내려온다 (엘프의 활)
  const startW = currentHero().startWeapon;
  if (startW) {
    const def = GEAR.find(g => g.name === startW);
    if (def) state.player.gear.weapon = makeGear(def);
  }
  recalcStats(state.player);
  state.player.hp = state.player.maxHp;
  UI.clearLog();
  UI.hideGearCompare();
  UI.hideShop();
  UI.showGame();
  UI.hideResult();
  enterFloor(1);
}

function enterFloor(depth) {
  state.depth = depth;
  state.running = false;
  state.awaitingInput = false;

  // 한 층을 올라선 것 자체가 성장이다. 싸움을 피해 다니는 사람도
  // 아주 멈춰 있으면 안 된다 — 위층에서 벽에 부딪혀 되돌아올 뿐이다.
  if (depth > 1 && state.player) gainXp(LV.ofFloor(depth - 1));

  const isRest = CFG.REST_FLOORS.includes(depth);

  // 층 속성 — 진입 문장이 이걸 흘린다.
  // 초반 층은 튜토리얼을 겸하므로 플레이어를 몰아붙이는 속성을 뽑지 않는다.
  const harsh = ['dense', 'dark'];
  const pool = depth <= 2 ? FLOOR_TAGS.filter(t => !harsh.includes(t.id)) : FLOOR_TAGS;
  const isRoof = depth >= CFG.TOP_FLOOR;

  /* 여기서부터 지형이 만들어질 때까지만 씨앗 달린 난수를 쓴다.
     오늘 오르는 사람은 모두 같은 탑을 본다 — 그래야 남이 좌표로 남긴 흔적이
     내 지도에서도 같은 자리를 가리킨다. (지형이 판마다 달랐을 때는
     남의 쪽지를 실제로 읽을 수 있는 확률이 14% 였다.)

     층 속성과 보물방 여부도 여기 넣는다. 보물방은 방 하나가 통째로 생기는
     일이라 지형이고, 층 속성은 보물방 확률을 흔들기 때문이다.
     몬스터와 전리품은 이 밖에서 뽑히므로 판마다 그대로 다르다. */
  const { tag, wantVault, map } = withSeed(floorSeed(depth, state.day), () => {
    const tag = isRest ? { id: null, hint: '', monsterMul: 0, fovAdd: 1 } : choice(pool);
    // 보물방. 열쇠를 든 몬스터가 있어야 하므로 몬스터가 없는 안식처에는 두지 않는다.
    // '쇠붙이 냄새가 나는' 층에는 반드시 있다 — 그 문장이 예고가 된다.
    // 맨 위층만 옥상이다. 보물방도 층 속성도 여기서는 의미가 없다.
    const wantVault = !isRoof && !isRest && depth >= 2 && (tag.id === 'treasure' || chance(0.4));
    return { tag, wantVault, map: isRoof ? makeRoof(depth) : makeFloor(depth, wantVault) };
  });
  state.floorTag = tag;
  Render.setBiome(depth);        // 배경을 이 층 것으로 갈아 끼운다
  Marks.enterFloor(depth);       // 남이 지나간 자리를 받아 온다 (없어도 그냥 돈다)
  state.noteHinted = false;      // 벽에 부딪혔을 때의 귀띔은 층마다 한 번
  state.noteReady = false;
  state.wallBump = null;
  state.campUses = 0;
  state.shopRerolls = 0;         // 매대 값은 층마다 처음으로 돌아간다
  state.restFloor = isRest;      // 「스치지 않고」가 안식처를 세지 않게
  state.floorEntryHp = state.player ? state.player.hp : 0;
  state.hurtThisFloor = false;
  applyFov();
  // 열네 층을 일곱 칸짜리 불빛으로 올라온 끝에, 처음으로 끝까지 보인다.
  // 이게 도착했다는 신호 노릇을 한다 — 문장보다 먼저 몸이 안다.
  if (isRoof) state.fovRadius = 40;

  // 플레이어 배치
  const p = state.player;
  p.x = map.start.x; p.y = map.start.y;
  p.rx = p.x; p.ry = p.y;
  p.energy = CFG.ENERGY_COST;
  p.bump = null; p.flash = 0;
  PET.onFloor();          // 계단을 같이 내려온다

  // 바닥의 물건 목록은 몬스터보다 먼저 만들어 둔다 —
  // findSpawnSpot 이 "이미 물건이 놓인 칸"을 피하려면 목록이 있어야 한다
  map.items = [];

  // 보스 — 계단을 잠그고 그 층의 주인 자리에 앉힌다
  state.boss = null;
  const bossDef = BOSSES[depth];
  if (bossDef) {
    map.tiles[map.stairs.y][map.stairs.x] = T.FLOOR;   // 쓰러뜨려야 열린다
    state.boss = makeBoss(bossDef, map.stairs.x, map.stairs.y);
  }

  // 몬스터
  state.monsters = [];
  if (state.boss) state.monsters.push(state.boss);
  if (!isRest) {
    const table = spawnTable(depth);
    // 1층은 조작을 익히는 층이라 눈에 띄게 적게 넣는다
    let base = depth === 1 ? 3 : 3 + Math.floor(depth * 0.62);
    if (bossDef) base = Math.round(base * 0.45);        // 보스층은 잡몹을 줄인다
    if (isRoof)  base = Math.round(base * 0.28);        // 옥상은 주인과의 자리다
    const count = Math.max(2, Math.round(base * (tag.monsterMul || 1)));
    const ec = eliteChance(depth);
    for (let i = 0; i < count; i++) {
      const spot = findSpawnSpot(map, p);
      if (!spot) break;
      // 익숙한 몬스터를 다시 낯설게 만드는 자리 — 층이 오를수록 자주 붙는다
      const elite = chance(ec) ? choice(ELITES).id : null;
      state.monsters.push(makeMonster(choice(table), spot.x, spot.y, elite));
    }
  }

  // 열쇠는 이 층의 몬스터 하나가 들고 있다. 찾아서 쓰러뜨려야 문이 열린다.
  state.hasKey = false;
  if (map.vault) {
    const carriers = state.monsters.filter(m => !m.boss);
    if (carriers.length) choice(carriers).hasKey = true;
    else map.vault = null;                       // 들 사람이 없으면 금고도 없던 일로
  }

  // 금고 안 — 층수보다 앞선 장비와 두둑한 금
  if (map.vault) {
    const v = map.vault;
    const spots = [];
    for (let y = v.y; y < v.y + v.h; y++)
      for (let x = v.x; x < v.x + v.w; x++)
        if (map.tiles[y][x] === T.FLOOR) spots.push({ x, y });
    const take = () => spots.length ? spots.splice(randInt(0, spots.length - 1), 1)[0] : null;

    for (let i = 0; i < 2; i++) {
      const s = take(), gr = rollGear(depth + 3, ancientLuck() + 1);
      if (s && gr) map.items.push({ x: s.x, y: s.y, type: 'gear', gear: gr });
    }
    const s = take();
    if (s) map.items.push({ x: s.x, y: s.y, type: 'gold', amount: 40 + depth * 8 });
    const s2 = take();
    if (s2) map.items.push({ x: s2.x, y: s2.y, type: 'potion' });
  }

  const goldPiles = Math.round((2 + Math.floor(depth / 2)) * (tag.goldMul || 1));
  for (let i = 0; i < goldPiles; i++) {
    const s = findSpawnSpot(map, p);
    if (s) map.items.push({ x: s.x, y: s.y, type: 'gold', amount: randInt(3, 8) + depth });
  }
  for (let i = 0; i < randInt(1, 2); i++) {
    const s = findSpawnSpot(map, p);
    if (s) map.items.push({ x: s.x, y: s.y, type: 'potion' });
  }

  // 장비 — 층에 남을 이유를 만드는 쪽이라 안식처에는 두지 않는다
  if (!isRest) {
    const gearCount = randInt(1, 2) + (tag.id === 'treasure' ? 2 : 0);
    for (let i = 0; i < gearCount; i++) {
      const s = findSpawnSpot(map, p);
      // 3층부터 다섯에 하나쯤은 무엇인지 모르는 채로 놓인다.
      // 앞선 두 층은 아직 장비가 무엇인지도 익히는 중이라 섞지 않는다.
      const g = (depth >= 3 && chance(0.22))
        ? rollUnknown(depth, ancientLuck())
        : rollGear(depth, ancientLuck());
      if (s && g) map.items.push({ x: s.x, y: s.y, type: 'gear', gear: g });
    }
  }

  // 상인의 물건 — 층수보다 조금 앞선 물건을 판다
  state.shopStock = [];
  if (isRest) {
    state.shopStock = rollShopStock(depth + 2, state.player, 3);
    // 물약은 여러 개 사 갈 수 있어야 한다. 한 병만 파는 상인은 상인이 아니다.
    state.shopStock.push({ kind: 'potion', price: 14 + depth, stock: 8, sold: false });
    /* 물약 주머니 — 소지 한도를 늘린다. 상한까지 샀으면 아예 안 내놓는다,
       살 수 없는 줄이 매대에 남아 있으면 그건 물건이 아니라 잔소리다. */
    if ((state.pouches || 0) < POUCH_MAX) {
      state.shopStock.push({ kind: 'pouch', price: priceFor(pouchPrice()), stock: 1, sold: false });
    }
  }

  state.map = map;
  state.resumable = true;
  refreshFov();
  UI.updateHud(state);
  saveRun();

  // 「당신의 얼굴」을 되찾았으면 분위기 문장 아래에 실제 수치가 붙는다.
  // 분위기 문장 자체는 기억과 무관하게 늘 나온다 — 그게 이 게임의 기본 화법이라서.
  let hint = tag.hint || '';
  if (MEM.has('face')) {
    const gearHere = map.items.filter(it => it.type === 'gear').length;
    hint += (hint ? '\n' : '') +
      `몬스터 ${state.monsters.length} · 장비 ${gearHere} · 시야 ${state.fovRadius}` +
      (bossDef ? ' · 주인이 있다' : '') + (map.vault ? ' · 잠긴 문이 있다' : '');
  }

  grantThrowIfDue(depth);

  UI.showFloorIntro(depth, FLOOR_LINES[depth] || '', hint, () => {
    state.running = true;
    state.awaitingInput = true;
    Sound.setFloor(depth);
    checkFloorAchievements(depth);
    saveRun();
    if (isRest) UI.log('이 층에는 아무것도 없습니다. 모닥불(C)이 어딘가에 있습니다.', 'sys');
    if (state.boss) {
      UI.log(bossDef.intro, 'hurt');
      UI.log('이 층의 계단은 그것을 쓰러뜨려야 열립니다.', 'sys');
    }
  });
}

function findSpawnSpot(map, player) {
  for (let tries = 0; tries < 260; tries++) {
    const r = choice(map.rooms);
    const x = randInt(r.x + 1, r.x + r.w - 2);
    const y = randInt(r.y + 1, r.y + r.h - 2);
    if (map.tiles[y][x] !== T.FLOOR) continue;
    if (chebyshev(x, y, player.x, player.y) < 6) continue;   // 시작 지점 바로 옆은 피한다
    if (monsterAt(x, y)) continue;
    // 이미 물건이 놓인 칸은 피한다 — 겹쳐 놓으면 하나가 가려져 보이지 않는다
    if (map.items && map.items.some(it => it.x === x && it.y === y)) continue;
    return { x, y };
  }
  return null;
}

/* =========================================================
   조회
   ========================================================= */

function monsterAt(x, y) {
  return state.monsters.find(m => m.alive && m.x === x && m.y === y) || null;
}

function refreshFov() {
  state.visible = computeFov(state.map, state.player.x, state.player.y, state.fovRadius);
}

// 불씨의 이중성 — 밝히면 멀리 보이지만 몬스터도 당신을 더 멀리서 알아챈다.
// 「끄던 손」을 되찾아야 조절할 수 있다.
function applyFov() {
  if (state.map && state.map.roof) { state.fovRadius = 40; return; }
  const tagAdd = (state.floorTag && state.floorTag.fovAdd) || 0;
  state.fovRadius = clamp(CFG.FOV_RADIUS + tagAdd + state.ember * 2 + PET.fovBonus(), 3, 12);
}

function monsterSight() {
  return CFG.MONSTER_SIGHT + state.ember * 3;
}

function toggleEmber() {
  if (!MEM.has('douse')) return;
  state.ember = state.ember === 1 ? -1 : state.ember + 1;
  Sound.play('ember');
  applyFov();
  refreshFov();
  UI.log(state.ember === 1 ? '불씨를 키웁니다. 멀리까지 보이지만, 멀리서도 보입니다.'
       : state.ember === 0 ? '불씨를 원래대로 되돌립니다.'
       : '불씨를 줄입니다. 눈앞만 보이지만, 발소리가 멀어집니다.', 'sys');
}

/* =========================================================
   플레이어 행동
   ========================================================= */

// 입력을 { 방향, 의도 } 하나로 감싼다.
// 그 뒤 처리 로직은 의도에 따라 갈리기만 하고 나머지는 공유된다.
function playerAction(dir, intent) {
  if (!state.running || !state.awaitingInput || !state.player.alive) return;
  if (UI.gearOpen() || UI.shopOpen() || UI.campOpen()) return;   // 창이 떠 있는 동안은 움직이지 않는다

  const p = state.player;

  if (intent === 'wait') {
    // 상인·대장장이 앞에서 대기하면 다시 말을 건다.
    // 창을 실수로 닫았을 때 타일을 벗어났다 돌아올 필요가 없도록.
    const here = state.map.tiles[p.y][p.x];
    if (here === T.SHOP) { openShop(); return; }
    if (here === T.FORGE) { openForge(); return; }
    spendPlayerTurn();
    return;
  }

  // 원거리는 방향이 없어도 된다 — 스스로 겨눈다.
  // 그래서 방향 검사보다 앞에 둔다.
  if (intent === 'ranged') {
    if (rangedAttack(dir)) spendPlayerTurn();
    return;
  }

  const d = DIRS[dir];
  if (!d) return;
  const tx = p.x + d.dx, ty = p.y + d.dy;

  const target = monsterAt(tx, ty);

  if (target) {
    if (intent === 'pass') {
      // 도망치려다 실수로 때리는 것을 막는 장치. 턴도 쓰지 않는다.
      UI.log(target.name + ' 때문에 그쪽으로 지나갈 수 없습니다.', 'sys');
      return;
    }
    meleeSwing(d);
    spendPlayerTurn();
    return;
  }

  /* 앞 칸이 비었어도 무기가 더 멀리 닿으면 거기서 친다 — 창이다.
     두 칸 밖에서 찌를 수 있다는 것이 창의 전부이므로, 여기서 걸어 들어가 버리면
     그 무기는 없는 것과 같다. 지나가려면 pass 로 지나간다. */
  if (intent !== 'pass' && meleeReachTarget(d)) {
    meleeSwing(d);
    spendPlayerTurn();
    return;
  }

  // 잠긴 문. 열쇠가 있으면 열고, 없으면 턴도 쓰지 않는다.
  if (tileAt(state.map, tx, ty) === T.DOOR) {
    if (!state.hasKey) {
      Sound.play('ui');
      UI.log('잠겨 있습니다. 열쇠를 든 것이 이 층 어딘가에 있습니다.', 'sys');
      return;
    }
    state.hasKey = false;
    state.map.tiles[ty][tx] = T.FLOOR;
    Sound.play('unlock');
    Render.addBlast(tx, ty);
    UI.log('열쇠가 맞습니다. 문이 열립니다.', 'good');
    spendPlayerTurn();
    return;
  }

  if (!isWalkable(state.map, tx, ty)) {        // 벽 — 턴 낭비 없음
    /* 같은 벽을 몇 번 밀었는지 센다. 두 번이면 그 벽에 볼일이 있는 것으로 본다.
       창을 띄우지는 않는다: 길 찾다 벽에 부딪히는 일은 너무 잦아서,
       그때마다 모달이 뜨면 남기는 재미가 아니라 치우는 일이 된다.
       한 층에 한 번씩만 말한다. */
    if (tileAt(state.map, tx, ty) === T.WALL) {
      const b = state.wallBump;
      if (b && b.x === tx && b.y === ty) b.n++;
      else state.wallBump = { x: tx, y: ty, n: 1 };

      const canWrite = Marks.on() && !Marks.wroteThisFloor && !Marks.noteNear(p.x, p.y);
      if (canWrite && state.wallBump.n === 1 && !state.noteHinted) {
        state.noteHinted = true;
        UI.log('벽이 손에 닿습니다. 한 번 더 밀면 여기에 남길 수 있습니다.', 'sys');
      } else if (canWrite && state.wallBump.n === 2 && !state.noteReady) {
        state.noteReady = true;
        UI.log((touchMode() ? '「남기기」' : 'N') +
               ' — 다음 사람에게 한 마디 남깁니다.', 'good');
      }
      paintTouch();                            // 턴을 안 쓰므로 버튼은 여기서 직접 켠다
    }
    return;
  }

  // 자리를 옮기면 밀던 벽은 잊는다 — 「두 번」은 잇달아 민 것이어야 뜻이 있다
  state.wallBump = null;
  p.x = tx; p.y = ty;
  Sound.play('step');
  onPlayerEnter(tx, ty);
  spendPlayerTurn();
}

function onPlayerEnter(x, y) {
  const map = state.map;

  // 바닥의 물건
  // 한 칸에 여러 개가 놓일 수 있으므로 전부 줍는다.
  // 하나만 주우면 나머지가 발밑에 영원히 남는다.
  const here = map.items.filter(it => it.x === x && it.y === y);
  for (const it of here) {
    if (it.type === 'gold') {
      state.gold += it.amount;
      Sound.play('gold');
      UI.log('골드 ' + josa(it.amount, '을', '를') + ' 주웠습니다.', 'good');
      if (state.gold >= 200) unlockAch('rich');
    } else if (it.type === 'potion') {
      if (state.potions >= potionMax()) {
        UI.log('물약을 더 들 수 없습니다. 그대로 두고 갑니다.', 'sys');
        continue;                       // 바닥에 남겨 둔다
      }
      state.potions++;
      Sound.play('potion');
      UI.log('물약을 주웠습니다.', 'good');
    } else if (it.type === 'key') {
      state.hasKey = true;
      Sound.play('key');
      UI.log('열쇠를 주웠습니다. 잠긴 문을 열 수 있습니다.', 'good');
    } else if (it.type === 'gear') {
      // 비교창은 몬스터가 움직인 뒤, 다시 내 차례가 왔을 때 띄운다.
      // 창을 읽는 동안 맞아 죽는 일이 없도록.
      if (state.pendingGear) continue;      // 한 번에 하나만
      state.pendingGear = it.gear;
      rememberGear(it.gear);
      if (it.gear.rarity === 'ancient') tryRecallMemory();
    }
    map.items.splice(map.items.indexOf(it), 1);
  }

  /* 남이 쓰러진 자리. 밟으면 누구였는지 알려주고, 그 사람이 갖고 있던 것을 준다.
     골드로 정한 이유 — 밟을 이유는 생기고 밸런스는 거의 안 건드린다.
     장비를 주면 8층에서 남이 쓰던 고대의 것이 나와 판이 통째로 뒤집힌다. */
  readNoteHere();               // 앞 벽에 남의 말이 있으면 읽는다

  const grave = Marks.at(x, y);
  if (grave && grave.kind === 'grave' && !grave.taken) {
    grave.taken = true;
    const gold = 8 + state.depth * 3;
    state.gold += gold;
    Sound.play('gold');
    Render.addFloater(x, y, '+' + gold, COLORS.gold);
    UI.log('여기서 ' + josa(grave.by, '이', '가') + ' ' +
           (grave.killer ? josa(grave.killer, '에게', '에게') + ' ' : '') +
           '쓰러졌습니다. 남은 것을 주웠습니다.', 'sys');
    UI.updateHud(state);
  }

  /* 이끼를 밟았다. 막지는 않고 아프기만 하다 —
     막으면 길이 사라져서 갈 수 있느냐를 묻게 되고,
     아프기만 하면 갈 값어치가 있느냐를 묻게 된다. 후자가 판단이다. */
  if (map.props) {
    const pr = map.props.find(v => v.x === x && v.y === y && isPoisonProp(v.kind));
    if (pr) poisonStep();
  }

  const t = map.tiles[y][x];

  if (t === T.SHOP) openShop();

  if (t === T.FORGE) openForge();

  if (t === T.CAMP) openCamp(x, y);

  if (t === T.STAIRS) {
    Sound.play('stairs');
    /* 안식처는 몬스터가 아예 없다. 그냥 지나가기만 해도 「스치지 않고」가
       달성되므로 세지 않는다 — 피할 것이 없는 곳에서 피했다고 하면
       업적이 아니라 통과 도장이 된다. */
    if (!state.hurtThisFloor && !state.restFloor && state.depth >= 2) unlockAch('unhurt');
    if (state.depth >= CFG.TOP_FLOOR) {
      endRun(true);
    } else {
      state.running = false;
      setTimeout(() => enterFloor(state.depth + 1), 220);
    }
  }
}

function drinkPotion() {
  if (!state.running || !state.awaitingInput) return;
  if (state.potions <= 0) { UI.log('물약이 없습니다.', 'sys'); return; }
  const p = state.player;
  if (p.hp >= p.maxHp) { UI.log('아직 다치지 않았습니다.', 'sys'); return; }

  state.potions--;
  const heal = Math.min(POTION_HEAL, p.maxHp - p.hp);
  p.hp += heal;
  Sound.play('potion');
  Render.addFloater(p.x, p.y, '+' + heal, COLORS.heal);
  UI.log('물약을 마셨습니다. 체력 ' + heal + ' 회복.', 'good');
  spendPlayerTurn();
}

/* 결말까지 건너뛰기 (개발용, `]`).
   누를 때마다 다음 단으로 간다. 한 번에 결말 화면까지 보내지 않는 것은
   옥상에 올라서는 순간과 주인이 무너지는 순간이 각각 봐야 할 연출이기 때문이다. */
function jumpToEnding() {
  if (!state.player || !state.player.alive) { startRun(); return; }
  if (state.depth !== CFG.TOP_FLOOR) {
    UI.hideResult(); UI.hideEnding(); UI.hideGearCompare(); UI.hideShop();
    enterFloor(CFG.TOP_FLOOR);
    return;
  }
  if (state.boss && state.boss.alive) {
    UI.log('[개발용] 주인을 건너뜁니다.', 'sys');
    hurtMonster(state.boss, state.boss.hp + 999, COLORS.ember);
    return;
  }
  UI.showEnding();
}

/* =========================================================
   기억
   ========================================================= */

function tryRecallMemory() {
  if (state.gotMemoryThisRun) return;          // 한 판에 하나까지
  const cand = MEM.nextCandidate();
  if (!cand) return;                            // 전부 되찾았다
  if (!chance(memoryChance(ancientLuck()))) return;

  state.memories.add(cand.id);
  state.gotMemoryThisRun = true;
  state.pity = 0;
  recalcStats(state.player);
  state.pendingMemory = cand;                   // 다음 차례에 연출로 띄운다
  persist();
  checkCollectionAchievements();
}

/* 「던지던 손」만은 확률에 맡기지 않는다.

   다른 기억은 세지는 것이지만 이건 조작 하나를 여는 것이다.
   운이 나쁘면 원거리를 한 번도 못 써보고 판이 끝나는데,
   그러면 게임의 절반을 못 본 채로 "이거 그냥 부딪히는 게임이네"가 된다.
   그래서 3층에 닿으면 무조건 준다.

   한 판에 하나라는 제한과 pity 는 건드리지 않는다 —
   이건 보상이 아니라 조작이므로 기억의 경제와 따로 논다. */
function grantThrowIfDue(depth) {
  // 기사에겐 열어줄 조작이 없다 — 보장은 조작을 위한 것이므로 기사는 건너뛴다.
  // 기억 자체는 여전히 확률로 얻을 수 있고, 그때는 완력(공격)으로 붙는다.
  if (currentHero().melee) return;
  if (depth < CFG.THROW_FLOOR) return;
  if (MEM.has('throw')) return;
  const def = MEM.def('throw');
  state.memories.add('throw');
  recalcStats(state.player);
  state.pendingMemory = def;
  persist();
  checkCollectionAchievements();
}

/* =========================================================
   원거리 — 「던지던 손」
   ========================================================= */

/* 무엇이 날아가는지는 손에 든 것이 정한다.
   지팡이를 들어 마법으로 싸우는 중이면 던지는 대신 불덩이가 나간다 —
   더 멀리 날아가고, 맞은 자리 주변까지 태운다.
   물리 무기를 든 사람은 그냥 던진다. 하나만 맞히지만 위력이 안정적이다. */
/* 겨눌 것을 스스로 고른다.

   방향을 맞춰 서야만 던질 수 있으면, 대각선에 선 몬스터를 두고
   줄을 맞추려 한 칸 옮기는 동안 두 대를 맞는다. 그 한 칸이 재미있는 판단이었으면
   모르겠는데, 실제로는 그냥 손해만 보는 절차였다.
   그래서 방향은 힌트로만 쓰고, 맞힐 수 있는 것 중 가장 가까운 것을 고른다. */
/* 원거리를 쓸 수 있는가.
   기사는 못 쓴다 — 근거리만 남긴 사람이다.
   활을 들었으면 기억 없이도 쏜다. 활이 곧 그 조작이므로.
   나머지는 「던지던 손」을 되찾아야 한다. */
function canRanged() {
  if (!state.player) return false;               // 판 밖(타이틀)에서도 불릴 수 있다
  if (currentHero().melee) return false;
  const w = state.player.gear.weapon;
  const ok = !!(w && w.bow) || MEM.has('throw');
  // 「손으로만」은 쓸 수 있었는데 안 쓴 사람에게만 준다 (achievements.js 참고)
  if (ok && state.running) state.couldRanged = true;
  return ok;
}

// 지금 이 턴에 쏠 수 있는가 — 쓸 줄 아는 것(canRanged)과 손이 돌아왔는가는 다른 물음이다
function rangedReady() {
  return canRanged() && !(state.rangedCd > 0);
}

/* 사람의 사거리. 원거리 몬스터(CFG.MONSTER_RANGE)보다 길어야
   "먼저 쏘고 물러선다"가 성립한다 — 자세한 이유는 config.js 의 사거리 절에.
   활은 한 칸 더 간다. */
function rangedRange() {
  const w = state.player.gear.weapon;
  return CFG.RANGED_RANGE + ((w && w.bow) ? CFG.BOW_BONUS : 0);
}

function rangedTarget(dir) {
  const p = state.player;
  const range = rangedRange();
  const d = dir ? DIRS[dir] : null;

  let best = null, bestScore = Infinity;
  for (const m of state.monsters) {
    if (!m.alive) continue;
    const dist = chebyshev(m.x, m.y, p.x, p.y);
    if (dist === 0 || dist > range) continue;
    if (!isVisible(state.visible, state.map, m.x, m.y)) continue;   // 안 보이는 것은 못 겨눈다
    if (!clearShot(p.x, p.y, m.x, m.y)) continue;                   // 벽 너머도 못 겨눈다

    // 방향키를 같이 눌렀으면 그쪽 것을 먼저 본다. 그쪽에 아무것도 없으면 나머지에서 고른다.
    const wrongWay = d && ((m.x - p.x) * d.dx + (m.y - p.y) * d.dy) <= 0;
    // 같은 거리면 약한 쪽부터 — 마무리가 되는 쪽이 대개 이득이다
    const score = dist + (wrongWay ? 100 : 0) + m.hp / 10000;
    if (score < bestScore) { bestScore = score; best = m; }
  }
  return best;
}

// 두 칸 사이에 벽이 없는가. 양 끝은 빼고 본다.
function clearShot(x0, y0, x1, y1) {
  const line = lineTiles(x0, y0, x1, y1);
  for (let i = 1; i < line.length - 1; i++) {
    if (blocksSight(state.map, line[i][0], line[i][1])) return false;
  }
  return true;
}

function rangedAttack(dir) {
  const p = state.player;
  if (currentHero().melee) {
    UI.log('몸이 기억하는 싸움은 하나뿐입니다 — 붙어서.', 'sys');
    return false;
  }
  if (!canRanged()) {
    UI.log('멀리 있는 것을 맞히는 법이 기억나지 않습니다.', 'sys');
    return false;
  }
  /* 한 번 던지면 다음 한 턴은 못 던진다.
     겨누는 수고가 사라지자 매 턴 던지는 게 언제나 최선이 되어
     몬스터가 닿기도 전에 판이 끝났다. 위력을 깎는 것으로는 안 잡혔고
     (30%를 깎아도 클리어율이 1%p 밖에 안 움직였다), 빈도가 실제 레버다. */
  if (state.rangedCd > 0) {
    UI.log('던진 손이 아직 돌아오지 않았습니다.', 'sys');
    return false;
  }

  let target = rangedTarget(dir);

  /* 겨눌 것이 없어도 그냥 날려 보낸다.
     예전에는 아무 일도 없이 돌아섰는데, 그러면 "안 보이는 쪽에 대고 쏜다"는
     선택지가 통째로 없어진다. 어둠 속이나 모퉁이 너머에 선 것이 맞을 수도 있어야
     불씨를 줄여 놓고 싸우는 판에서 원거리가 제 노릇을 한다. */
  let blindEnd = null;
  if (!target) {
    const d = DIRS[dir] || DIRS[p.face < 0 ? 'left' : 'right'];
    const range = rangedRange();
    for (let i = 1; i <= range; i++) {
      const x = p.x + d.dx * i, y = p.y + d.dy * i;
      if (blocksSight(state.map, x, y)) break;      // 벽에 박힌다
      blindEnd = { x, y };
      const m = monsterAt(x, y);
      // 보이지 않던 것이라도 길목에 서 있었으면 맞는다
      if (m && m.alive) { target = m; break; }
    }
    /* 한 칸도 못 나가면 턴을 쓰지 않는다. 벽을 마주보고 누른 것은
       선택이 아니라 잘못 누른 것이라, 여기에 한 턴을 물리면 벌이 된다. */
    if (!blindEnd) {
      UI.log('벽을 마주보고 있습니다.', 'sys');
      return false;
    }
  }

  // 여기까지 왔으면 실제로 쏜 것이다 — 「손으로만」이 이걸 보고 닫힌다
  state.usedRanged = true;

  // 가는 길에 다른 것이 서 있으면 그것이 맞는다 — 관통하지 않는다
  if (target) {
    for (const [lx, ly] of lineTiles(p.x, p.y, target.x, target.y)) {
      if (lx === p.x && ly === p.y) continue;
      const m = monsterAt(lx, ly);
      if (m && m.alive) { target = m; break; }
    }
  }

  /* 이번 턴에 하나 줄므로 2 는 "다음 턴만 막힌다", 3 은 "두 턴 막힌다".
     불덩이는 광역이라 화살·던지기와 같은 리듬을 주면 언제나 불덩이가 이긴다.
     3에서 4로 조여도 클리어율이 안 움직였다(마법사는 근접도 마법이라 흡수한다) —
     더 조이는 것은 느낌만 해친다. */
  state.rangedCd = isMagicAttack(p) ? 3 : 2;

  const fire = isMagicAttack(p);
  const bow = !fire && p.gear.weapon && p.gear.weapon.bow;
  const to = target || blindEnd;

  // 던지는 쪽을 바라보게 한다
  if (to.x !== p.x) p.face = to.x > p.x ? 1 : -1;

  if (fire)     Render.addOrb(p.x, p.y, to.x, to.y);
  else if (bow) Render.addArrow(p.x, p.y, to.x, to.y);
  else          Render.addBeam(p.x, p.y, to.x, to.y, COLORS.ember);
  Sound.play(fire ? 'fireball' : 'throw');

  /* 아무것도 없는 쪽으로 날아간 경우. 턴은 쓴다 —
     날아간 것 자체가 일어난 일이고, 안 그러면 공짜로 어둠을 훑어볼 수 있다. */
  if (!target) {
    if (fire) { Render.addBlast(blindEnd.x, blindEnd.y); Sound.play('blast'); }
    else Sound.play('miss');
    UI.log('어둠 속으로 날아갔습니다. 아무것도 맞히지 못했습니다.', 'sys');
    UI.updateHud(state);
    return true;
  }

  const { dmg } = rollDamage(p, target);

  if (bow) {
    // 활은 이 사람의 본업이라 던지기보다 덜 깎인다. 그래도 근접보다는 약하다.
    const hit = Math.max(1, Math.round(dmg * 0.85));
    hurtMonster(target, hit, COLORS.damage);
    UI.log(target.name + '에게 화살이 꽂힙니다. ' + hit + '의 피해.', 'hit');
    UI.updateHud(state);
    return true;
  }

  if (!fire) {
    // 근접보다 약하다. 거리를 얻는 대신 위력을 내주는 것.
    const hit = Math.max(1, Math.round(dmg * 0.7));
    hurtMonster(target, hit, COLORS.damage);
    UI.log(target.name + '에게 멀리서 ' + hit + '의 피해를 입혔습니다.', 'hit');
    UI.updateHud(state);
    return true;
  }

  // 불덩이 — 맞은 자리와 그 둘레까지
  Render.addBlast(target.x, target.y);
  Sound.play('blast');
  const hit = Math.max(1, Math.round(dmg * 0.8));
  hurtMonster(target, hit, COLORS.ember);
  UI.log(target.name + '이(가) 불덩이에 휩싸입니다. ' + hit + '의 피해.', 'hit');

  let burned = 0;
  for (const m of state.monsters) {
    if (!m.alive || m === target) continue;
    if (chebyshev(m.x, m.y, target.x, target.y) !== 1) continue;
    const splash = Math.max(1, Math.round(dmg * 0.4));
    hurtMonster(m, splash, COLORS.ember);
    burned++;
  }
  if (burned) UI.log('불길이 ' + burned + '마리에게 번집니다.', 'hit');

  UI.updateHud(state);
  return true;
}

// 몬스터에게 피해를 주고 죽으면 정리한다. 여러 곳에서 같은 절차를 쓴다.
function hurtMonster(m, amount, color) {
  m.hp -= amount;
  m.flash = CFG.FLASH_TIME;
  Render.addFloater(m.x, m.y, String(amount), color);
  if (m.hp <= 0) kill(m);
}

/* =========================================================
   장비
   ========================================================= */

function resolveGear(take) {
  const g = state.pendingGear;
  state.pendingGear = null;
  UI.hideGearCompare();
  if (!g) return;

  const p = state.player;

  if (!take) {
    /* 바닥에 그대로 남긴다. 마음이 바뀌면 다시 밟으면 된다.
       (지금 서 있는 칸이므로 한 번 벗어났다 돌아와야 다시 뜬다 — 나가라고 조르지 않는다)

       seen 을 달아 둔다. 한 번 열어 본 것은 무엇인지 이미 아는 물건이라
       바닥에 상자로 두면 "저게 아까 그건가"를 다시 밟아서 확인해야 한다.
       열어 보지 않은 것은 그대로 상자다 — 처음부터 아이콘을 깔면
       던전 바닥이 진열장처럼 보여서 어디가 길인지 헷갈린다. */
    state.map.items.push({ x: p.x, y: p.y, type: 'gear', gear: g, seen: true });
    UI.log(josa(gearFullName(g), '을', '를') + ' 그대로 두었습니다.', 'sys');
    return;
  }
  const into = equipSlotFor(g, p);      // 장신구는 둘 중 어디로 갈지 여기서 정해진다
  const old = p.gear[into];

  /* 정체불명은 손에 쥔 순간 드러난다. 열고 나서 무를 수 없다는 것이
     이 물건의 값어치이자 값이다 — 여기서 되돌릴 수 있게 하면 도박이 아니라 감정이 된다. */
  const wasUnknown = !!g.unknown;
  if (wasUnknown) {
    revealGear(g);
    rememberGear(g);
    const cursed = g.rarity === 'cursed';
    Sound.play(cursed ? 'gearCursed' : 'gearAncient');
    UI.log(cursed
      ? josa(gearFullName(g), '이', '가') + ' 드러납니다. 손이 시립니다.'
      : josa(gearFullName(g), '이', '가') + ' 드러납니다.', cursed ? 'hurt' : 'good');
  }

  p.gear[into] = g;
  recalcStats(p);

  UI.log(josa(gearFullName(g), '을', '를') + ' 착용했습니다' +
         (old ? ' (' + gearFullName(old) + ' 버림).' : '.'), 'good');

  // 노선이 바뀌는 순간은 알려준다 — 이 게임 전투의 핵심 규칙이라
  if (isMagicAttack(p)) {
    UI.log('주문이 공격보다 높습니다. 이제 마법으로 싸웁니다.', 'hit');
  }
  UI.updateHud(state);
}

/* =========================================================
   벽의 쪽지 — 읽고, 끄덕이고, 남긴다
   ========================================================= */

/* 앞의 벽에 남이 긁어 둔 것이 있으면 읽는다. 층에 들어설 때가 아니라
   그 자리에 섰을 때 읽히는 것이 맞다 — 벽에 긁힌 글이므로. */
function readNoteHere() {
  const p = state.player;
  const m = Marks.noteNear(p.x, p.y);
  if (!m || m.read) return;
  m.read = true;
  UI.log('벽에 누군가 긁어 둔 말이 있습니다.', 'sys');
  UI.log('「' + Marks.text(m) + '」', 'hit');
  // 손가락에게 없는 키를 알려주면 안 된다. 있는 것의 이름을 부른다.
  if (!m.mine) UI.log('끄덕이려면 ' + (touchMode() ? '「끄덕」' : 'N') +
                      (m.nods ? ' — ' + m.nods + '명이 이미 끄덕였습니다.' : ''), 'sys');
}

/* 지금 조작부가 버튼인가 키보드인가. 안내 문구가 없는 키를 가리키지 않도록.
   style.css 의 터치 조작이 열리는 조건과 같은 문장을 쓴다 — 둘이 갈라지면
   버튼은 안 보이는데 「버튼을 누르세요」라고 적히게 된다. */
function touchMode() {
  try { return matchMedia('(hover: none) and (pointer: coarse)').matches; }
  catch (e) { return false; }
}

/* 지금 이 자리에서 흔적으로 할 수 있는 일 — 없으면 null.
   키보드는 N 을 눌러보면 알지만 손가락은 눌러볼 버튼이 없다.
   그래서 「할 수 있는가」를 한 군데서 답하고, 모바일 버튼이 이걸 보고 나타난다. */
/* 긁을 벽 — 맞닿은 네 칸 중 벽인 것. 위를 먼저 본다(표지가 제일 잘 보이는 자리다).

   처음에는 위쪽 벽만 쳤다. 그랬더니 설 수 있는 칸의 20% 에서만 쓸 수 있었는데,
   나머지 80% 에서는 아무 일도 안 일어나므로 「조건이 안 맞는다」가 아니라
   「이 기능은 없다」로 읽혔다. 벽을 옆에 두고도 못 쓰는 이유를 화면이
   설명할 방법이 없다면, 그건 설명할 게 아니라 없애야 하는 규칙이다. */
const NOTE_DIRS = [{ dx: 0, dy: -1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }];

function noteWall(x, y) {
  for (const d of NOTE_DIRS) {
    const wx = x + d.dx, wy = y + d.dy;
    if (tileAt(state.map, wx, wy) === T.WALL) return { x: wx, y: wy };
  }
  return null;
}

/* 두 번 민 벽 — 그 벽이 아직 옆에 있을 때만.

   벽 옆에 서기만 해도 열어 뒀더니 설 수 있는 칸의 절반에서 버튼이 떴다.
   길을 걷다 보면 저절로 켜졌다 꺼졌다 하니, 「지금 할 수 있다」는 신호가 아니라
   그냥 깜빡이는 것이 됐다. **같은 벽에 두 번 부딪히는 것은 우연히 일어나지 않는다** —
   한 번은 길을 잘못 든 것이고, 두 번은 그 벽에 볼일이 있는 것이다. */
function bumpedWall() {
  const b = state.wallBump, p = state.player;
  if (!b || b.n < 2) return null;
  if (Math.abs(b.x - p.x) + Math.abs(b.y - p.y) !== 1) return null;
  return { x: b.x, y: b.y };
}

function noteAction() {
  if (!state.running || !state.player.alive) return null;
  const p = state.player;
  const m = Marks.noteNear(p.x, p.y);
  if (m) return (!m.mine && !Marks.nodded.has(m.id)) ? 'nod' : null;
  if (!Marks.on() || Marks.wroteThisFloor) return null;
  return bumpedWall() ? 'write' : null;
}

/* N — 앞에 남의 말이 있으면 끄덕이고, 없으면 내가 남긴다.
   같은 키에 둘을 묶은 이유는 하나다: 벽 앞에 섰을 때 할 일이 그 둘뿐이다. */
function noteKey() {
  if (!Marks.on()) { UI.log('여기서는 벽에 남길 수 없습니다.', 'sys'); return; }
  const p = state.player;
  const m = Marks.noteNear(p.x, p.y);

  if (m && !m.mine) {
    if (Marks.nodded.has(m.id)) { UI.log('이미 끄덕였습니다.', 'sys'); return; }
    Marks.nod(m);
    Sound.play('good' in Sound ? 'good' : 'gearCommon');
    UI.log('끄덕였습니다. 쓴 사람이 다음에 올라올 때 알게 됩니다.', 'good');
    paintTouch();                 // 턴을 쓰지 않으므로 버튼은 여기서 직접 거둔다
    return;
  }
  if (m && m.mine) { UI.log('당신이 남긴 말입니다.', 'sys'); return; }

  // 두 번 민 벽이 있으면 그 벽에 긁는다. 없으면 옆에 있는 아무 벽이나 —
  // 자판에서 N 을 누르는 것은 그 자체로 「하겠다」는 뜻이라 두 번을 더 요구하지 않는다.
  const wall = bumpedWall() || noteWall(p.x, p.y);
  if (!wall) { UI.log('긁을 벽이 옆에 없습니다.', 'sys'); return; }
  if (Marks.wroteThisFloor) { UI.log('이 층에는 이미 하나 남겼습니다.', 'sys'); return; }
  openNoteCompose(wall);
}

/* 두 걸음으로 쓴다 — 낱말을 고르고, 그 낱말이 끼워진 틀을 고른다.
   두 번째 화면에서 완성된 문장이 그대로 보이므로 무엇을 남기는지 헷갈리지 않는다. */
function openNoteCompose(wall) {
  Marks.pending = { word: 0, wall: wall };
  UI.showCamp(
    NOTE_WORDS.map((w, i) => ({ id: String(i), name: w, desc: '' })),
    (id) => { Marks.pending.word = Number(id); openNoteForm(); },
    '벽에 무엇을 긁어 두겠습니까.', '벽에 남긴다');
}

function openNoteForm() {
  const w = NOTE_WORDS[Marks.pending.word];
  UI.showCamp(
    NOTE_FORMS.map((f, i) => ({ id: String(i), name: noteText(i, Marks.pending.word), desc: '' })),
    (id) => writeNote(Number(id), Marks.pending.word),
    '「' + w + '」 — 어떻게 적겠습니까.', '벽에 남긴다');
}

function writeNote(a, b) {
  UI.hideCamp();
  const p = state.player;
  const wall = (Marks.pending && Marks.pending.wall) || noteWall(p.x, p.y);
  Marks.pending = null;
  if (!wall) return;
  Marks.wroteThisFloor = true;
  Marks.add('note', wall.x, wall.y, { a: a, b: b });
  // 내 판에도 바로 보이게 — 서버 응답을 기다리면 남긴 실감이 안 난다
  Marks.list.push({ id: 'mine-' + Date.now(), kind: 'note', x: wall.x, y: wall.y,
                    a: a, b: b, by: Marks.who(), nods: 0, mine: true, read: true });
  Sound.play('key');
  UI.log('벽에 「' + noteText(a, b) + '」라고 긁어 두었습니다.', 'good');
  paintTouch();
}

/* 하수도 층의 형광 이끼. 밟으면 1 깎인다.

   1 은 무시해도 되는 값이다. 그게 요점이다 — 무시해도 되는지를 정하는 것이
   판단이기 때문이다. 성한 몸이면 그냥 밟고 지나가고, 몰려서 물약 하나로
   버티는 중이면 한 칸을 돌아간다. 같은 칸이 판마다 다른 뜻을 갖는다.

   막지 않는 이유는 위(onPlayerEnter)에 적어 두었다. */
function isPoisonProp(kind) {
  return kind === 'sewer_moss_a' || kind === 'sewer_moss_b';
}

function poisonStep() {
  const p = state.player;
  if (!p || !p.alive) return;
  p.hp -= 1;
  p.flash = CFG.FLASH_TIME;
  state.hurtThisFloor = true;
  Render.addFloater(p.x, p.y, '1', COLORS.poison || '#9ED64A');
  Sound.play('burn');
  UI.log('이끼를 밟았습니다. 발끝이 저립니다.', 'hurt');
  UI.updateHud(state);
  if (p.hp <= 0) kill(p);
}


/* =========================================================
   모닥불 — 같은 불을 무엇에 쓸 것인가

   회복만 하던 자리였다. 그러면 밟는 것 말고 할 일이 없어서,
   안식처가 "쉬어 가는 층"이 아니라 "지나가는 층"이 된다.
   같은 불에서 셋 중 하나를 고르게 하면 판마다 다른 길이 난다 —
   체력이 넉넉한 판에는 불에 무기를 담그고, 몰린 판에는 그냥 녹인다.
   ========================================================= */

function campOptions() {
  const p = state.player;
  const w = p.gear.weapon;
  const hurt = p.maxHp - p.hp;
  return [
    { id: 'warm', name: '몸을 녹인다',
      desc: hurt > 0 ? `체력을 모두 회복한다 (+${hurt})` : '이미 성한 몸이다' },
    { id: 'temper', name: '무기를 불에 담근다',
      // 무기가 없으면 담글 것도 없다. 잠긴 채로 보여야 "다음엔 들고 오자"가 된다.
      disabled: !w,
      desc: w ? josa(gearFullName(w), '을', '를') + ' 벼린다 — 이 판 내내 남는다'
              : '담글 무기가 없다' },
    { id: 'ash', name: '재를 삼킨다',
      desc: '최대 체력 +6 — 이 판 내내 남는다' },
  ];
}

/* 동행 고르기. 모닥불과 같은 창을 쓴다 —
   "같은 자리에서 하나를 고른다"는 같은 물음이라 같은 얼굴이어야 한다. */
function openPetChoice() {
  UI.showCamp(PETS.map(p => ({
    id: p.id,
    name: p.kind + ' 「' + p.name + '」',
    desc: p.line + ' — ' + p.effect,
  })), pickPet, '문지기가 무너진 자리에 무언가 남아 있습니다.');
}

function pickPet(id) {
  UI.hideCamp();
  const d = PET.def(id);
  if (!d) return;
  PET.take(id);
  Sound.play('memory');
  UI.log(d.kind + ' 「' + d.name + '」' + '이(가) 당신을 따라옵니다. ' + d.effect + '.', 'good');
  UI.updateHud(state);
  persist();
  saveRun();
}

function openCamp(x, y) {
  state.campSpot = { x, y };
  UI.showCamp(campOptions(), pickCamp);
}

function pickCamp(id) {
  UI.hideCamp();
  const p = state.player;
  const spot = state.campSpot;
  if (!spot) return;
  state.campSpot = null;

  if (id === 'warm') {
    const healed = p.maxHp - p.hp;
    p.hp = p.maxHp;
    Render.addFloater(spot.x, spot.y, healed > 0 ? '+' + healed : '온기', COLORS.heal);
    UI.log(healed > 0 ? '모닥불에서 몸을 녹였습니다. 체력을 모두 회복했습니다.'
                      : '모닥불에서 몸을 녹였습니다.', 'good');
  } else if (id === 'temper') {
    const w = p.gear.weapon;
    if (!w) return;
    /* 벼린 것은 장비에 직접 얹는다. 그래야 재계산(recalcStats)이 자동으로 따라오고,
       이어하기·관전 블롭에도 장비째로 실려 간다 — 따로 저장할 것이 없다. */
    const magic = (w.mod.sp || 0) > (w.mod.atk || 0);
    const key = magic ? 'sp' : 'atk';
    const amount = magic ? 4 : 3;
    w.mod[key] = (w.mod[key] || 0) + amount;
    w.tempered = (w.tempered || 0) + 1;
    recalcStats(p);
    Sound.play('gearAncient');
    Render.addFloater(spot.x, spot.y, '+' + amount, COLORS.ember);
    UI.log(josa(gearFullName(w), '을', '를') + ' 불에 담갔습니다. ' +
           (magic ? '주문' : '공격') + ' +' + amount + '.', 'good');
  } else if (id === 'ash') {
    state.ashHp = (state.ashHp || 0) + 6;
    recalcStats(p);
    Render.addFloater(spot.x, spot.y, '최대 +6', COLORS.ember);
    UI.log('재를 삼켰습니다. 목이 타지만, 몸이 조금 더 버팁니다. 최대 체력 +6.', 'good');
  }

  state.campUses++;
  state.usedCamp = true;         // 판을 통째로 사는 눈금 (「불을 쬐지 않고」)
  // 「돌아선 밤」을 되찾았으면 모닥불이 한 번 더 탄다 — 두 가지를 고를 수 있다
  const maxUses = MEM.has('night') ? 2 : 1;
  if (state.campUses >= maxUses) state.map.tiles[spot.y][spot.x] = T.FLOOR;
  else UI.log('불이 아직 남아 있습니다.', 'sys');

  Sound.play('camp');
  UI.updateHud(state);
  UI.updateGearStrip(p);
  persist();
}

/* =========================================================
   상점
   ========================================================= */

/* 매대를 다시 까는 값. 누를수록 오른다 —
   싸게 두면 원하는 것이 나올 때까지 돌리는 것이 언제나 최선이 되어,
   상인이 「고르는 자리」가 아니라 「돌리는 자리」가 된다. */
function rerollPrice() {
  return Math.round((16 + state.depth * 4) * Math.pow(1.9, state.shopRerolls || 0));
}

function rerollShop() {
  const price = rerollPrice();
  if (state.gold < price) return;
  state.gold -= price;
  state.shopRerolls = (state.shopRerolls || 0) + 1;
  state.traded = true;

  /* 물약 줄은 남긴다. 물약은 이 게임에서 유일하게 「언제나 사도 되는 것」이라
     그걸 굴려서 없애 버리면 다시 까는 것이 손해가 되는 판이 생긴다. */
  const potion = state.shopStock.find(e => e.kind === 'potion');
  const pouch  = state.shopStock.find(e => e.kind === 'pouch' && !e.sold);
  state.shopStock = rollShopStock(state.depth + 2, state.player, 3);
  if (potion) state.shopStock.push(potion);
  if (pouch) state.shopStock.push(pouch);

  Sound.play('buy');
  UI.log('상인이 자루를 뒤집어 새로 늘어놓습니다.', 'sys');
  UI.updateHud(state);
  saveRun();
  openShop();
}

function openShop() {
  if (!state.shopStock.length) return;
  UI.setShopSay(state.depth >= 12
    ? '여기까지 온 사람은 오랜만이군. 위에는 아무것도 없어.'
    : '위로 가는 사람은 드물지. 필요한 걸 골라.');
  UI.showShop(state.shopStock, state.gold, state.player, buyFromShop, {
    price: rerollPrice(),
    done: state.shopRerolls || 0,
    onPick: rerollShop,
  });
}

/* =========================================================
   대장장이 — 골드를 쓰는 자리

   모닥불도 벼려 주지만 그건 한 층에 한 번뿐이고, 그 한 번은 회복·최대 체력과
   경쟁한다. 여기는 골드만 있으면 몇 번이든 해 준다.

   왜 필요했나: 골드가 남아돌았다. 상인의 매대는 세 칸이고 살 것이 없으면
   그걸로 끝이라, 후반에는 200~300 골드를 들고 다니며 쓸 데가 없었다.
   쓸 데 없는 재화는 주워도 기쁘지 않고, 그러면 골드가 놓인 칸이 그냥 배경이 된다.

   값은 벼릴 때마다 오른다. 안 그러면 골드가 곧 스탯이 되어,
   싸움을 피하고 금화만 줍는 것이 언제나 최선이 된다. */
/* 한 장비를 몇 번까지 손봐 주는가.

   값만 올려서는 안 잡혔다. 골드는 층마다 계속 들어오는데 대장장이는 언제나
   그 자리에 있으므로, 비싸지기만 하면 「좀 더 모아서 또」가 될 뿐이다.
   시뮬을 돌려 보니 봇이 골드가 바닥날 때까지 두드려서 클리어율이 통째로 올랐다.
   사람도 똑같이 한다 — 값을 쓰는 최선의 방법이 하나뿐이면 그건 선택이 아니다.

   상한이 있으면 「무엇을 세 번 두드릴 것인가」가 된다. 무기냐 방어구냐,
   지금 든 것이냐 다음에 나올 것이냐. 그게 골드로 사는 판단이다. */
/* 남들은 세 번, 드워프는 다섯 번 (heroes.js 의 forgeMax).

   하나를 끝까지 벼리는 사람이라 상한 자체가 다르다 — 값을 깎아 주는 것만으로는
   "골드가 조금 더 많은 사람"에서 안 벗어나는데, 상한이 다르면 **남이 못 만드는
   물건**이 손에 남는다. 거기서부터 다른 판이 된다. */
const FORGE_MAX_BASE = 3;
function forgeMax() {
  return currentHero().forgeMax || FORGE_MAX_BASE;
}

function forgePrice(kind, times) {
  const base = { weapon: 44, armor: 38, trinket: 32 }[kind] || 38;
  return Math.round((base + state.depth * 5) * Math.pow(2.0, times || 0));
}

// 이 장비를 몇 번 손봤는가. 장비에 직접 붙여 두므로 이어하기에 그냥 실려 간다.
function forgeTimes(g) { return (g && g.forged) || 0; }

function forgeOptions() {
  const p = state.player;
  const out = [];
  for (const slot of SLOTS) {
    const g = p.gear[slot];
    if (!g) {
      out.push({ id: slot, name: SLOT_NAME[slot] + ' 없음', desc: '가져오면 손봐 주지.', disabled: true });
      continue;
    }
    if (g.unknown) {
      out.push({ id: slot, name: gearFullName(g), desc: '무엇인지도 모르는 걸 두드릴 순 없어.', disabled: true });
      continue;
    }
    const times = forgeTimes(g);
    if (times >= forgeMax()) {
      out.push({ id: slot, name: gearFullName(g),
                 desc: `더는 못 두드린다. (${forgeMax()}번 다 썼다)`, disabled: true });
      continue;
    }
    const price = priceFor(forgePrice(g.slot, times));
    // 무엇이 오르는가는 그 장비가 이미 하던 일을 따라간다 — 지팡이는 주문이 오른다
    const key = forgeGainKey(g);
    const amount = forgeGainAmount(g, key);
    out.push({
      id: slot,
      name: gearFullName(g) + '  ' + price + ' G',
      desc: STAT_LABEL[key] + ' +' + amount + `  (${times}/${forgeMax()})`,
      disabled: state.gold < price,
    });
  }
  /* 나갈 줄. 키보드는 Esc 로도 나가지만 손가락에는 그런 것이 없고,
     골드가 없으면 나머지가 전부 잠기므로 이 줄이 없으면 창에 갇힌다. */
  out.push({ id: 'leave', name: '그만둔다', desc: '다음에 다시 오지.' });
  return out;
}

/* 무엇을 올릴지는 그 장비가 이미 무엇을 하는지가 정한다.
   방어구에 공격을 붙이면 장비의 성격이 사라지고, 그러면 무엇을 낄지 고를 이유가 없어진다. */
function forgeGainKey(g) {
  if (g.slot === 'weapon') return ((g.mod.sp || 0) > (g.mod.atk || 0)) ? 'sp' : 'atk';
  // 나머지는 이미 제일 큰 값을 더 키운다
  let best = null, bestN = -Infinity;
  for (const [k, n] of Object.entries(g.mod)) if (n > bestN) { best = k; bestN = n; }
  return best || 'def';
}

function forgeGainAmount(g, key) {
  return key === 'maxHp' ? 5 : (key === 'sp' ? 4 : 3);
}

function openForge() {
  UI.showCamp(forgeOptions(), forgeGear,
    '가진 걸 두드려 주지. 값은 손볼수록 오른다.  (' + state.gold + ' G)',
    '대장장이', true);          // 마지막 true — 아무것도 안 사고 나갈 수 있다
}

function forgeGear(slot) {
  if (slot === 'leave') { UI.hideCamp(); return; }
  const p = state.player;
  const g = p.gear[slot];
  if (!g || g.unknown) return;
  if (forgeTimes(g) >= forgeMax()) return;
  const price = priceFor(forgePrice(g.slot, forgeTimes(g)));
  if (state.gold < price) return;

  state.gold -= price;
  state.traded = true;           // 대장장이도 거래다 — 「빚 없이」는 여기서도 닫힌다

  const key = forgeGainKey(g);
  const amount = forgeGainAmount(g, key);
  /* 벼린 것은 장비에 직접 얹는다. 모닥불의 「벼림」과 같은 규칙이라
     recalcStats 가 자동으로 따라오고 이어하기·관전에도 장비째로 실려 간다. */
  g.mod[key] = (g.mod[key] || 0) + amount;
  g.forged = forgeTimes(g) + 1;
  recalcStats(p);

  Sound.play('gearAncient');
  Render.addFloater(p.x, p.y, '+' + amount, COLORS.ember);
  UI.log(josa(gearFullName(g), '을', '를') + ' 두드렸습니다. ' +
         STAT_LABEL[key] + ' +' + amount + '.', 'good');
  UI.updateHud(state);
  saveRun();

  openForge();                   // 계속 맡길 수 있게 창을 다시 연다
}

function buyFromShop(i) {
  const entry = state.shopStock[i];
  if (!entry || entry.sold || state.gold < entry.price) return;
  if (entry.kind === 'potion' && state.potions >= potionMax()) {
    UI.log('물약은 ' + potionMax() + '개까지만 들 수 있습니다.', 'sys');
    return;
  }
  if (entry.kind === 'pouch' && (state.pouches || 0) >= POUCH_MAX) return;

  state.gold -= entry.price;
  Sound.play('buy');

  state.traded = true;           // 「빚 없이」가 이걸 본다

  // 재고가 있는 물건은 하나씩 줄고, 다 팔리면 그때 사라진다
  if (entry.stock > 1) entry.stock--;
  else { entry.stock = 0; entry.sold = true; }

  if (entry.kind === 'potion') {
    state.potions++;
    UI.log(entry.sold ? '마지막 물약을 샀습니다.'
                      : '물약을 샀습니다. 상인에게 ' + entry.stock + '개 남았습니다.', 'good');
  } else if (entry.kind === 'pouch') {
    state.pouches = (state.pouches || 0) + 1;
    UI.log('주머니를 샀습니다. 물약을 ' + potionMax() + '개까지 들 수 있습니다.', 'good');
  } else {
    const p = state.player;
    const into = equipSlotFor(entry.gear, p);
    const old = p.gear[into];
    p.gear[into] = entry.gear;
    rememberGear(entry.gear);
    recalcStats(p);
    UI.log(josa(gearFullName(entry.gear), '을', '를') + ' 샀습니다' +
           (old ? ' (' + gearFullName(old) + ' 버림).' : '.'), 'good');
    if (isMagicAttack(p)) UI.log('주문이 공격보다 높습니다. 이제 마법으로 싸웁니다.', 'hit');
  }

  UI.updateHud(state);
  UI.showShop(state.shopStock, state.gold, state.player, buyFromShop, {
    price: rerollPrice(),
    done: state.shopRerolls || 0,
    onPick: rerollShop,
  });   // 다시 그린다
}

function spendPlayerTurn() {
  state.player.energy -= CFG.ENERGY_COST;
  state.awaitingInput = false;
  state.turns++;
  PET.step();             // 곁에 있는 것이 한 칸 따라온다
  // 던진 손이 돌아온다 — 원거리는 연사가 아니라 리듬이다
  if (state.rangedCd > 0) state.rangedCd--;
  if (state.chill > 0) state.chill--;
  // 붙은 불은 저절로 꺼지지 않는다. 물약을 마시든 죽이든 결판을 내야 한다.
  if (state.burn > 0) {
    state.burn--;
    const p = state.player;
    p.hp -= 2;
    p.flash = CFG.FLASH_TIME;
    Render.addFloater(p.x, p.y, '2', COLORS.damage);
    Sound.play('burn');
    if (p.hp <= 0) { UI.log('불이 옮겨붙은 채 쓰러집니다.', 'hurt'); kill(p); }
  }
  refreshFov();
  noteSeenMonsters();
  UI.updateHud(state);
  paintTouch();
  saveRun();
  advanceTurns();
}

// 「명부」 — 처음 보는 것의 수치를 안다.
// 이름을 적는 일을 했던 사람이니 이것들의 이름을 알고 있다.
function noteSeenMonsters() {
  for (const m of state.monsters) {
    if (!m.alive || state.seenMonsters.has(m.defId)) continue;
    if (!isVisible(state.visible, state.map, m.x, m.y)) continue;
    if (m.hasKey) UI.log(josa(m.name, '이', '가') + ' 무언가 반짝이는 것을 들고 있습니다.', 'hit');
    state.seenMonsters.add(m.defId);
    rememberMonster(m.defId);
    if (m.boss) m.seen = true;
    if (!MEM.has('roster')) continue;
    const s = m.stats;
    UI.log(`${m.name} — 체력 ${m.maxHp} · 공격 ${s.atk} · 주문 ${s.sp} · ` +
           `방어 ${s.def} · 마방 ${s.md} · 속도 ${s.spd}`, 'sys');
  }
}

/* =========================================================
   전투
   ========================================================= */

/* =========================================================
   근접 — 무기가 닿는 자리
   ========================================================= */

/* 이번 방향으로 휘두르면 닿는 칸들 (items.js 의 WEAPON_REACH).
   벽 너머는 안 닿는다 — 창이 벽을 뚫고 찌르면 그건 사거리가 아니라 버그로 읽힌다.
   앞이 막혀 있으면 그 뒤도 못 찌른다(창의 두 칸째). */
function meleeReach(dir) {
  const p = state.player;
  const tiles = meleeTiles(p.x, p.y, dir, p.gear.weapon);
  const out = [];
  for (const t of tiles) {
    if (blocksSight(state.map, t.x, t.y)) continue;
    // 창의 두 칸째 — 바로 앞이 벽이면 그 너머로는 못 간다
    if (Math.abs(t.x - p.x) + Math.abs(t.y - p.y) > 1) {
      const mx = p.x + dir.dx, my = p.y + dir.dy;
      if (blocksSight(state.map, mx, my)) continue;
    }
    out.push(t);
  }
  return out;
}

/* 이 방향으로 「공격을 시작할 수 있는」 적이 있는가.
   init 이 붙은 칸만 본다 — 검의 대각선은 함께 쓸리는 자리일 뿐이라
   거기 있는 적을 보고 앞으로 못 걷게 되면 안 된다 (items.js 참고). */
function meleeReachTarget(dir) {
  for (const t of meleeReach(dir)) {
    if (!t.init) continue;
    const m = monsterAt(t.x, t.y);
    if (m && m.alive) return m;
  }
  return null;
}

/* 한 번 휘두른다. 닿는 칸에 있는 것을 **전부** 친다.
   피해는 칸마다 배율이 다르다 — 정면이 온전한 값이고 쓸리는 자리는 얕다. */
function meleeSwing(dir) {
  const p = state.player;
  const hits = [];
  for (const t of meleeReach(dir)) {
    const m = monsterAt(t.x, t.y);
    if (m && m.alive) hits.push({ m, mult: t.mult });
  }
  if (!hits.length) return false;

  // 앞의 것부터 친다. 뒤엣것이 먼저 죽으면 로그가 거꾸로 읽힌다.
  for (const h of hits) {
    if (!h.m.alive) continue;
    attack(p, h.m, dir, h.mult);
  }
  if (hits.length > 1) Sound.play('hit');
  return true;
}

/* ---------- 독 ----------

   불(state.burn)과 같은 자리의 규칙인데 방향이 반대다. 저쪽은 몬스터가 사람에게
   붙이는 것이고 이쪽은 사람이 몬스터에게 바르는 것이다.

   **쫓아오는 동안 깎인다**가 이 규칙의 전부다. 치고 물러서면 상대는 따라오고,
   따라오는 턴마다 독이 든다 — 도망치는 것이 곧 공격이 된다. 그래서 리자드는
   물러서는 것이 겁이 아니라 수다. 보스는 언제나 쫓아오므로 보스전에서 가장 세다. */
// 단검 자체가 바르는 독. 리자드는 heroes.js 에서 이보다 센 값을 들고 온다.
const DAGGER_POISON = { turns: 3, amount: 1 };

function poisonMonster(m, turns, amount) {
  if (!m || !m.alive) return;
  // 덧바르면 시간이 길어지고, 더 센 독이면 그 값으로 바뀐다. 더하지는 않는다 —
  // 붙어서 계속 때리는 것이 물러서는 것보다 이득이면 이 특성이 없는 것과 같다.
  m.poison = Math.max(m.poison || 0, turns);
  m.poisonAmount = Math.max(m.poisonAmount || 0, amount);
  /* 처음 물었을 때는 몬스터 위에 뜬다 — 로그가 아니라.

     독은 첫 타에 이미 묻는데, 처음에는 로그로만 알렸더니 「두 대 때려야
     발동된다」로 읽혔다. 리자드는 빨라서 느린 몬스터가 제 턴을 쓰기 전에
     두 번 움직이는 일이 잦고, 독은 몬스터의 턴에 들기 때문에 첫 초록 숫자가
     늦게 보인다. 무는 순간 그 몸 위에 「독」이 뜨면 오해가 사라진다. */
  if (!m.poisonSaid) {
    m.poisonSaid = true;
    Render.addFloater(m.x, m.y, '독', COLORS.poison || '#A8E639');
  }
}

// 몬스터 한 마리의 독이 한 턴 든다. 몬스터가 자기 턴을 쓸 때 불린다.
function poisonTick(m) {
  if (!m || !m.alive || !(m.poison > 0)) return;
  m.poison--;
  const dmg = m.poisonAmount || 1;
  m.hp -= dmg;
  m.flash = CFG.FLASH_TIME;
  Render.addFloater(m.x, m.y, String(dmg), COLORS.poison || '#A8E639');
  if (m.hp <= 0) {
    UI.log(josa(m.name, '이', '가') + ' 독에 무너집니다.', 'good');
    kill(m);
  }
}

function attack(attacker, defender, dir, mult) {
  const { dmg: raw, magic } = rollDamage(attacker, defender);
  // 쓸리는 자리는 얕게 든다. 최소 1은 지킨다 — 0 이 뜨면 「닿았는데 안 아프다」가 된다.
  const dmg = (mult && mult !== 1) ? Math.max(1, Math.round(raw * mult)) : raw;

  if (attacker.kind === 'player') state.usedMelee = true;   // 「닿지 않고」가 이걸 본다
  attacker.bump = { dx: dir.dx, dy: dir.dy, t: 0 };
  defender.hp -= dmg;
  defender.flash = CFG.FLASH_TIME;
  if (defender.kind === 'player') state.hurtThisFloor = true;

  Render.addFloater(defender.x, defender.y, String(dmg),
                    magic ? COLORS.cast : COLORS.damage);

  /* 단검은 독을 바른다. 무기 갈래의 값이라 누가 들어도 묻지만,
     리자드는 더 오래·더 아프게 든다 (heroes.js 의 poison). 그 사람의
     추천 무기가 단검인 것과 이 규칙이 한 덩어리다. */
  if (attacker.kind === 'player' && defender.alive &&
      weaponKind(attacker.gear.weapon) === 'dagger') {
    const v = currentHero().poison || DAGGER_POISON;
    poisonMonster(defender, v.turns, v.amount);
  }

  const verb = magic ? '마법으로' : '';
  if (attacker.kind === 'player') {
    Sound.play(magic ? 'magic' : 'hit');
    UI.log(defender.name + '에게 ' + verb + ' ' + dmg + '의 피해를 입혔습니다.', 'hit');
  } else {
    Sound.play('hurt');
    Render.addShake(dmg >= 6 ? 9 : 4);
    UI.log(josa(attacker.name, '이', '가') + ' ' + verb + ' ' + dmg + '의 피해를 입혔습니다.', 'hurt');

    // 「식은 것」에게 맞으면 몸이 굳는다.
    // 속도가 곧 생존인 게임이라 이게 체력보다 아프다.
    if (attacker.burn && defender.kind === 'player' && state.burn < 4) {
      state.burn = 4;
      UI.log('불이 옮겨붙었습니다. 몇 걸음은 계속 탑니다.', 'hurt');
    }
    if (attacker.chill && defender.kind === 'player' && state.chill < 6) {
      state.chill = 5;
      UI.log('몸이 굳습니다. 잠시 굼떠집니다.', 'hurt');
    }

    // 「불을 만지던 손」 — 때린 쪽이 탄다
    if (defender.kind === 'player' && MEM.has('fire') && attacker.alive) {
      const burn = 3;
      attacker.hp -= burn;
      attacker.flash = CFG.FLASH_TIME;
      Render.addFloater(attacker.x, attacker.y, String(burn), COLORS.ember);
      UI.log(josa(attacker.name, '이', '가') + ' 당신을 붙잡고 타들어갑니다. ' + burn + '의 피해.', 'hit');
      if (attacker.hp <= 0) kill(attacker);
    }
  }

  // 마지막으로 나를 때린 것. 쓰러진 자리에 같이 남긴다 (js/marks.js)
  if (defender.kind === 'player') state.lastKiller = attacker.name;

  if (defender.hp <= 0) kill(defender);
  UI.updateHud(state);
}

function kill(entity) {
  if (entity.kind === 'player') {
    // 「남겨진 온기」 — 한 판에 한 번, 쓰러져도 일어난다
    if (MEM.has('warmth') && !state.revived) {
      state.revived = true;
      entity.hp = Math.max(1, Math.round(entity.maxHp * 0.5));
      entity.flash = CFG.FLASH_TIME;
      Render.addShake(14);
      Render.addFloater(entity.x, entity.y, '온기', COLORS.heal);
      UI.log('누군가 당신을 위해 피워둔 불이 아직 남아 있습니다. 당신은 다시 일어섭니다.', 'good');
      UI.updateHud(state);
      return;
    }
    entity.alive = false;
    Sound.play('death');
    /* 쓰러진 자리를 남긴다. 다음 사람이 이 층에 오면 여기 해골이 서 있다 —
       이 탑이 원래 「아무도 내려오지 않는」 곳이라, 그게 설정 그 자체다.
       무엇에게 당했는지도 같이 남긴다. 다음 사람에게 그게 곧 경고다. */
    Marks.add('grave', entity.x, entity.y, {
      killer: state.lastKiller || '', turns: state.turns,
    });
    endRun(false);
    return;
  }
  entity.alive = false;
  entity.marks = null;
  state.kills++;
  tallyKill(entity.defId);        // 도감에 몇 마리째인지 남는다
  Sound.play('kill');
  gainXp(entity.boss ? 25 + state.depth * 4 : LV.ofMonster(entity));
  if (entity.hasKey) {
    entity.hasKey = false;
    state.map.items.push({ x: entity.x, y: entity.y, type: 'key' });
    UI.log(josa(entity.name, '이', '가') + ' 열쇠를 떨어뜨립니다.', 'hit');
  }

  if (entity.boss) {
    UI.log(josa(entity.name, '이', '가') + ' 무너집니다.', 'hit');
    Render.addShake(20);
    unlockAch(entity.defId);
    if (entity.bossDef.final) {
      state.running = false;
      /* 되짚기가 먼저다. 무엇을 했는지 알고 나서 골라야
         「불을 붙인다 / 붙이지 않는다」가 동전 던지기가 아니게 된다. */
      setTimeout(() => Story.show(() => UI.showEnding()), 1200);
      return;
    }
    // 계단이 열린다 — 보스가 서 있던 자리에
    const s = state.map.stairs;
    state.map.tiles[s.y][s.x] = T.STAIRS;
    UI.log('막혀 있던 계단이 드러납니다.', 'good');

    /* 첫 보스를 넘긴 자리에서 동행을 고른다.
       여기가 이 게임에서 처음으로 "해냈다"가 되는 자리라,
       무언가를 얻어야 다음 열 층을 오를 이유가 생긴다.
       연출(무너지는 소리와 흔들림)이 끝난 뒤에 띄운다. */
    if (state.depth === CFG.PET_FLOOR && !PET.has()) {
      setTimeout(() => openPetChoice(), 900);
    }
  }

  /* 「재를 뒤집어쓴」 — 쓰러지는 순간 터진다.
     붙어서 마지막 일격을 넣은 사람이 정확히 맞는 자리라, 잡고 나서도 한 걸음 물러설
     이유가 생긴다. 옆에 있던 다른 몬스터도 같이 맞는다. */
  if (entity.burst) {
    Render.addBlast(entity.x, entity.y);
    Render.addShake(10);
    Sound.play('blast');
    const dmg = 4 + Math.round(state.depth * 0.8);
    const p = state.player;
    if (p.alive && chebyshev(p.x, p.y, entity.x, entity.y) <= 1) {
      p.hp -= dmg;
      p.flash = CFG.FLASH_TIME;
      Render.addFloater(p.x, p.y, String(dmg), COLORS.ember);
      UI.log(josa(entity.name, '이', '가') + ' 터집니다. ' + dmg + '의 피해.', 'hurt');
      if (p.hp <= 0) { kill(p); return; }
    } else {
      UI.log(josa(entity.name, '이', '가') + ' 재를 흩뿌리며 터집니다.', 'hurt');
    }
    for (const m of state.monsters) {
      if (!m.alive || m === entity) continue;
      if (chebyshev(m.x, m.y, entity.x, entity.y) > 1) continue;
      hurtMonster(m, dmg, COLORS.ember);
    }
    UI.updateHud(state);
  }

  /* 「메아리치는」 — 쓰러지면 자기 자신 둘로 갈라진다.
     갈라진 것에는 접두사를 넘기지 않는다. 안 그러면 끝없이 메아리친다. */
  if (entity.echo) {
    const def = MONSTERS.find(m => m.id === entity.defId);
    let born = 0;
    if (def) {
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        if (born >= 2) break;
        const x = entity.x + dx, y = entity.y + dy;
        if (!isWalkable(state.map, x, y) || monsterAt(x, y)) continue;
        if (x === state.player.x && y === state.player.y) continue;
        const m = makeMonster(def, x, y);
        m.hp = m.maxHp = Math.max(1, Math.round(m.maxHp * 0.5));
        state.monsters.push(m);
        born++;
      }
    }
    if (born) UI.log(josa(entity.name, '이', '가') + ' 메아리처럼 ' + born + '으로 되돌아옵니다.', 'hurt');
  }

  // 갈라지는 것. 잡았다고 끝이 아니다.
  if (entity.split) {
    const def = MONSTERS.find(m => m.id === entity.split);
    let born = 0;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      if (born >= 2) break;
      const x = entity.x + dx, y = entity.y + dy;
      if (!isWalkable(state.map, x, y) || monsterAt(x, y)) continue;
      if (x === state.player.x && y === state.player.y) continue;
      state.monsters.push(makeMonster(def, x, y));
      born++;
    }
    if (born) UI.log(josa(entity.name, '이', '가') + ' ' + born + '마리로 갈라집니다.', 'hurt');
  }

  const drop = Math.round(entity.gold * (0.6 + Math.random() * 0.8));
  if (drop > 0) {
    // 이미 골드가 놓인 칸이면 합친다. 겹쳐 놓으면 하나가 가려진다.
    const pile = state.map.items.find(
      it => it.type === 'gold' && it.x === entity.x && it.y === entity.y);
    if (pile) pile.amount += drop;
    else state.map.items.push({ x: entity.x, y: entity.y, type: 'gold', amount: drop });
  }
  UI.log(josa(entity.name, '을', '를') + ' 쓰러뜨렸습니다.', 'hit');
}

/* =========================================================
   턴 루프
   ========================================================= */

function readyActor() {
  const p = state.player;
  if (p.alive && p.energy >= CFG.ENERGY_COST) return p;
  for (const m of state.monsters) {
    if (m.alive && m.energy >= CFG.ENERGY_COST) return m;
  }
  return null;
}

function advanceTurns() {
  for (let guard = 0; guard < 40000; guard++) {
    if (!state.player.alive) return;

    const actor = readyActor();
    if (!actor) {
      // 아무도 준비되지 않았다 — 한 틱 흘린다
      if (state.player.alive) {
        // 굳어 있으면 힘을 덜 낸다. 회복은 내가 행동할 때마다 조금씩.
        const chilled = state.chill > 0;
        state.player.energy += Math.max(3, state.player.stats.spd - (chilled ? 4 : 0));
      }
      for (const m of state.monsters) if (m.alive) m.energy += m.stats.spd;
      continue;
    }

    if (actor === state.player) {
      state.awaitingInput = true;

      // 되찾은 기억이 있으면 그것부터. 장비보다 큰 사건이다.
      if (state.pendingMemory) {
        const mem = state.pendingMemory;
        state.pendingMemory = null;
        Sound.play('memory');
        UI.showCurtain(mem.name, mem.line, mem.effect, () => {
          if (state.pendingGear) {
            const g = state.pendingGear;
            UI.showGearCompare(g, state.player.gear[equipSlotFor(g, state.player)]);
          }
        });
        return;
      }

      // 이번 턴에 주운 장비가 있으면 지금 비교창을 띄운다
      if (state.pendingGear) {
        const g = state.pendingGear;
        Sound.play('gear' + g.rarity[0].toUpperCase() + g.rarity.slice(1));
        UI.showGearCompare(g, state.player.gear[equipSlotFor(g, state.player)]);
      }
      return;
    }

    monsterTurn(actor);
    actor.energy -= CFG.ENERGY_COST;
  }
}

function monsterTurn(m) {
  /* 독은 자기 턴을 쓸 때 든다. 여기 두면 빠른 것은 자주, 굼뜬 것은 드물게
     — 「몇 번 움직였나」로 세어지므로, 쫓아오느라 바쁜 놈이 제일 많이 깎인다.
     보스도 같은 규칙이라 bossTurn 보다 앞에 둔다. */
  if (m.poison > 0) {
    poisonTick(m);
    if (!m.alive) return;
  }
  if (m.boss) { bossTurn(m); return; }
  const p = state.player;
  const dist = chebyshev(m.x, m.y, p.x, p.y);
  const canSee = dist <= (m.sight || monsterSight()) &&
                 hasLineOfSight(state.map, m.x, m.y, p.x, p.y);

  /* --- 원거리형: 준비했다가 쏜다. 준비 중에 사거리를 벗어나면 빗나간다. --- */
  if (m.ranged) {
    if (m.casting > 0) {
      m.casting = 0;
      if (canSee && dist <= CFG.MONSTER_RANGE) {
        const { dmg, magic } = rollDamage(m, p);
        p.hp -= dmg;
        p.flash = CFG.FLASH_TIME;
        state.hurtThisFloor = true;
        Sound.play('spell');
        Render.addFloater(p.x, p.y, String(dmg), COLORS.cast);
        Render.addShake(6);
        UI.log(m.name + '의 주문이 적중해 ' + dmg + '의 피해를 입었습니다.', 'hurt');
        UI.updateHud(state);
        if (p.hp <= 0) kill(p);
      } else {
        Sound.play('miss');
        Render.addFloater(m.x, m.y, '빗나감', COLORS.cast);
        UI.log(josa(m.name, '의', '의') + ' 주문이 빗나갔습니다.', 'good');
      }
      return;
    }
    if (canSee && dist <= CFG.MONSTER_RANGE && dist >= 2) {
      m.casting = 1;
      Sound.play('cast');
      UI.log(josa(m.name, '이', '가') + ' 주문을 준비합니다. 사거리를 벗어나면 빗나갑니다.', 'hit');
      return;
    }
  }

  if (!canSee) {
    if (chance(0.35)) stepRandom(m);
    return;
  }

  if (isNextTo(m.x, m.y, p.x, p.y)) {
    const dir = { dx: Math.sign(p.x - m.x), dy: Math.sign(p.y - m.y) };
    attack(m, p, dir);
    return;
  }

  stepToward(m, p.x, p.y);
}

function stepToward(m, tx, ty) {
  const dx = Math.sign(tx - m.x);
  const dy = Math.sign(ty - m.y);

  // 차이가 큰 축을 먼저 시도한다.
  // 대각선으로는 움직이지 않는다 — 대각선에 자리를 잡으면
  // 서로 때릴 수 없는 자리에서 마주 보고만 있게 된다.
  // 막히면 옆으로 비켜서라도 붙는다 (복도에서 서로 엉키지 않게).
  const options = Math.abs(tx - m.x) > Math.abs(ty - m.y)
    ? [[dx, 0], [0, dy], [0, 1], [0, -1]]
    : [[0, dy], [dx, 0], [1, 0], [-1, 0]];

  for (const [ox, oy] of options) {
    if (ox === 0 && oy === 0) continue;
    const nx = m.x + ox, ny = m.y + oy;
    if (!isWalkable(state.map, nx, ny)) continue;
    if (monsterAt(nx, ny)) continue;
    if (nx === state.player.x && ny === state.player.y) continue;
    m.x = nx; m.y = ny;
    return;
  }
}

function stepRandom(m) {
  const dirs = Object.values(DIRS);
  const d = choice(dirs);
  const nx = m.x + d.dx, ny = m.y + d.dy;
  if (!isWalkable(state.map, nx, ny)) return;
  if (monsterAt(nx, ny)) return;
  if (nx === state.player.x && ny === state.player.y) return;
  m.x = nx; m.y = ny;
}

/* =========================================================
   판 종료
   ========================================================= */

/* 첫 화면으로 나간다.

   이야기를 끝낸 판에서만 쓴다 — 결말을 보고 이름까지 지나간 뒤에 곧장 1층에
   떨어뜨리면 방금 끝낸 것이 없던 일이 된다. 여기서 다시 시작할지는 사람이 정한다.

   판을 지우고 나가야 한다. 끝난 판이 이어하기로 남아 있으면 첫 화면에
   「15층부터 이어서 오른다」가 뜬다 — 이미 끝난 곳으로 돌아가는 문이다. */
let repaintTitle = () => {};

function backToTitle() {
  clearRun();
  state.running = false;
  state.awaitingInput = false;
  state.resumable = false;
  state.pet = null;
  UI.hideResult();
  UI.hideEnding();
  UI.hideCredits();
  UI.clearLog();
  UI.showTitle();
  repaintTitle();
  updateRecordText(loadData() || {});
}

// 되찾은 기억과 본 것들을 남긴다.
// 저장은 이 함수와 loadData 만 거치므로, 나중에 클라우드로 옮길 때 여기만 바꾸면 된다.
function persist(extra) {
  const save = loadData() || {};
  save.memories = [...state.memories];
  save.pity = state.pity;
  save.codex = [...new Set([...(save.codex || []), ...state.seenMonsters])];
  Object.assign(save, extra || {});
  saveData(save);
  return save;
}

function rememberMonster(id) {
  const save = loadData() || {};
  const codex = new Set(save.codex || []);
  if (codex.has(id)) return;
  codex.add(id);
  save.codex = [...codex];
  saveData(save);
  checkCollectionAchievements();
}

/* 종류별로 몇 마리를 잡았는가. 판을 넘어 쌓인다.
   save.kills 는 이미 「통째로 몇 마리」라는 다른 숫자로 쓰이고 있어서
   여기는 killCount 로 따로 둔다 — 같은 이름에 다른 뜻을 얹으면 반드시 어긋난다. */
function tallyKill(id) {
  if (!id) return;
  const save = loadData() || {};
  const tally = save.killCount || {};
  tally[id] = (tally[id] || 0) + 1;
  save.killCount = tally;
  saveData(save);
}

// 손에 넣어본 장비를 도감에 남긴다 (교체하지 않고 두더라도)
function rememberGear(gear) {
  const save = loadData() || {};
  const codex = new Set(save.itemCodex || []);
  if (codex.has(gear.name)) return;
  codex.add(gear.name);
  save.itemCodex = [...codex];
  saveData(save);
  checkCollectionAchievements();
}

/* =========================================================
   결말 — 어느 쪽도 정답이 아니다
   ========================================================= */

function chooseEnding(which) {
  UI.hideEnding();
  state.resumable = false;
  clearRun();

  const prev = loadData() || {};
  const seen = new Set(prev.endings || []);
  seen.add(which);
  persist({ endings: [...seen] });
  unlockAch(which === 'light' ? 'endLight' : 'endLeave');
  if (seen.size >= 2) unlockAch('bothEnds');
  checkClearAchievements();      // 「어떻게 올랐는가」에 붙는 것들

  const rows = [
    ['도달한 층', state.depth + '층'],
    ['레벨', state.level],
    ['쓰러뜨린 것', state.kills],
    ['걸음 수', state.turns],
    ['되찾은 기억', state.memories.size + ' / ' + MEMORIES.length],
    ['본 결말', seen.size + ' / 2'],
  ];

  state.running = false;
  state.awaitingInput = false;

  Sound.play(which === 'light' ? 'endLight' : 'endLeave');

  /* 고른 다음 결과표로 바로 덮으면, 방금 고른 것이 무엇을 바꿨는지 못 본다.
     선택창만 걷고 옥상을 잠시 그대로 둔다 — 불을 붙였으면 난간 너머로 새벽이 번지고,
     붙이지 않았으면 아무 일도 일어나지 않는다. 그 "아무 일도"가 이쪽 결말의 내용이다. */
  /* 결과표를 띄우기 전에 크레딧이 흐른다.

     순서를 이렇게 잡은 이유가 있다. 결과표는 숫자(도달 층·걸음 수)라서
     그걸 먼저 보면 방금 고른 결말이 성적표가 되어 버린다.
     이름이 먼저 지나가고 그다음에 숫자가 오면, 끝난 것은 판이 아니라 이야기가 된다. */
  /* 고른 뒤에 그 결말의 마지막 장면 하나가 더 흐르고, 그다음이 크레딧이다.
     이야기를 끝낸 판이라 결과표는 다시 오르는 문이 아니라 첫 화면으로 나가는 문을 낸다. */
  const toCredits = (title, body) =>
    Story.show(() => UI.showCredits(
      () => UI.showResult(title, body, rows, { toLobby: true })), which);

  if (which === 'light') {
    Render.lightDawn();
    setTimeout(() => toCredits('불이 다시 켜졌다',
      '당신은 남은 것을 전부 태웠습니다.\n' +
      '세상이 밝아집니다.\n\n' +
      '그리고 탑은 다시, 다음 공물을 기다립니다.'), 3400);
  } else {
    setTimeout(() => toCredits('불을 든 채로',
      '당신은 불씨를 손에 쥔 채 내려갑니다.\n' +
      '어둠은 그대로입니다.\n\n' +
      '그러나 더는 아무도 태워지지 않습니다.'), 1900);
  }

  const save = persist({
    runs: (prev.runs || 0) + 1,
    kills: (prev.kills || 0) + state.kills,
    best: Math.max(prev.best || 0, state.depth),
    cleared: true,
  });
  updateRecordText(save);
}

function endRun(reachedTop) {
  state.running = false;
  state.awaitingInput = false;
  state.resumable = false;
  clearRun();          // 끝난 판은 이어할 수 없다

  /* 스냅샷은 살아 있을 때만 나간다(packRun 이 alive 를 본다).
     이걸 따로 보내지 않으면 관전 화면이 마지막으로 살아있던 순간에 멈춘 채로 남는다 —
     관전에서 제일 보고 싶은 순간이 하필 거기다. */
  if (typeof Cast !== 'undefined') Cast.over(reachedTop);

  // 기억을 못 얻은 채 끝났으면 다음 판의 확률이 오른다
  if (!state.gotMemoryThisRun && MEM.nextCandidate()) state.pity++;

  const prev = loadData() || {};
  const save = persist({
    runs: (prev.runs || 0) + 1,
    kills: (prev.kills || 0) + state.kills,
    best: Math.max(prev.best || 0, state.depth),
  });
  updateRecordText(save);

  const rows = [
    ['도달한 층', state.depth + '층'],
    ['쓰러뜨린 것', state.kills],
    ['모은 골드', state.gold],
    ['걸음 수', state.turns],
    ['되찾은 기억', state.memories.size + ' / ' + MEMORIES.length],
  ];

  setTimeout(() => {
    if (reachedTop) {
      UI.showResult('탑의 끝',
        '더 오를 계단이 없습니다.\n여기서부터는 아직 지어지지 않았습니다.', rows);
    } else {
      UI.showResult('불씨가 떨어졌다',
        '불씨는 아래로 굴러떨어졌습니다.\n다음에 그것을 줍는 사람이 다시 오를 것입니다.', rows);
    }
  }, 700);
}

/* 내가 남긴 말을 몇 명이 읽었는가. 타이틀에서 한 번만 부른다.

   이게 이 기능의 심장이다 — 다크소울에서 좋아요가 쓴 사람의 체력을 채우는 자리다.
   보상이 「읽혔다」가 아니라 「도움이 됐다」에 붙어 있어야
   웃긴 말이 아니라 쓸모 있는 말을 남기게 된다.
   그리고 접속해 있지도 않은 사람과 이어져 있다는 느낌은 이 숫자 하나가 만든다. */
async function showMyNods() {
  const n = await Marks.myNods();
  if (!n) return;
  const el = document.getElementById('best-record');
  if (!el) return;
  const line = document.createElement('div');
  line.className = 'record-nods';
  line.textContent = '당신이 남긴 말을 ' + n + '명이 읽었습니다.';
  el.appendChild(line);
}

function updateRecordText(save) {
  if (!save || !save.runs) { UI.setRecord(''); return; }
  let t = '최고 ' + save.best + '층 · ' + save.runs + '번 올랐다';
  const mem = (save.memories || []).length;
  if (mem) t += ' · 기억 ' + mem + '/' + MEMORIES.length;
  if (save.cleared) t += ' · 결말 ' + (save.endings || []).length + '/2';
  UI.setRecord(t);
}

/* =========================================================
   입력
   ========================================================= */

function currentIntent() {
  for (const code of held) {
    if (KEY_MOD[code]) return KEY_MOD[code];
  }
  return 'move';
}

function onKeyDown(e) {
  /* 확성기에 글자를 치는 중이면 게임은 물러선다.
     이걸 빼면 "wasd"라고 치는 동안 캐릭터가 네 칸 움직이고,
     "1"을 치면 물약이 사라진다. 채팅을 붙일 때 제일 먼저 터지는 곳이다. */
  if (typeof Chat !== 'undefined' && Chat.typing()) return;

  /* 남의 판을 보는 중이면 어떤 키도 판을 건드리지 않는다.
     관전은 보는 것이지 두는 것이 아니다 — 여기서 막지 않으면
     관전 화면에서 누른 방향키가 다음 스냅샷에 덮여 사라지면서
     "왜 안 움직이지"가 된다. 확성기는 그대로 열린다. */
  if (state.spectating && e.code !== 'KeyC') {
    if (typeof Cast !== 'undefined' && e.code === 'Escape') Cast.unwatch();
    e.preventDefault();
    return;
  }

  // event.key 가 아니라 event.code 를 쓴다.
  // key 를 쓰면 한글 입력 상태에서 Z 가 'ㅋ' 으로 들어와 조작이 먹통이 된다.
  const code = e.code;

  // 확성기 여닫기. 게임 중에도 되어야 하므로 다른 창들보다 앞에 둔다.
  if (code === 'KeyC') {
    if (typeof Chat !== 'undefined') Chat.toggle();
    e.preventDefault();
    return;
  }

  if (KEY_MOD[code]) { held.add(code); modUsed.delete(code); }

  if (code === 'KeyM') {
    Sound.unlock();
    const m = Sound.toggleMute();
    const btn = document.getElementById('btn-mute');
    if (btn) btn.textContent = m ? '소리 끔' : '소리 켬';
    UI.log(m ? '소리를 껐습니다.' : '소리를 켰습니다.', 'sys');
    e.preventDefault();
    return;
  }

  // 되짚기가 흐르는 동안에는 누르고 있으면 빨라지기만 한다 (크레딧과 같은 조작)
  if (Story.open()) { Story.setFast(true); e.preventDefault(); return; }

  /* 크레딧이 열려 있으면 다른 것은 아무것도 안 받는다.
     누르고 있는 동안 빨리 감기고, 다 흐른 뒤에 누르면 닫힌다.
     건너뛰지 않는 이유 — 이름은 지나가라고 적은 것이라 지나가긴 해야 한다. */
  if (UI.creditsOpen()) {
    if (UI.creditsRolling()) UI.creditsFast(true);
    else UI.hideCredits();
    e.preventDefault();
    return;
  }

  if (UI.codexOpen()) {
    if (code === 'Escape' || code === 'Enter') UI.hideCodex();
    // 좌우로 탭을 넘긴다
    if (code === 'ArrowLeft' || code === 'ArrowRight') {
      const tabs = [...document.querySelectorAll('#codex-tabs button[data-tab]')];
      const i = tabs.findIndex(t => t.classList.contains('on'));
      const n = (i + (code === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
      UI.codexTab(tabs[n].dataset.tab);
    }
    e.preventDefault();
    return;
  }

  // 장비 비교창 — 조작 체계와 같은 키를 쓴다
  if (UI.gearOpen()) {
    if (code === 'KeyZ' || code === 'KeyJ' || code === 'Enter') resolveGear(true);
    if (code === 'KeyX' || code === 'KeyK' || code === 'Escape') resolveGear(false);
    e.preventDefault();
    return;
  }

  if (UI.shopOpen()) {
    if (code === 'Escape' || code === 'Space') UI.hideShop();
    const n = code.match(/^Digit([1-9])$/) || code.match(/^Numpad([1-9])$/);
    if (n) buyFromShop(Number(n[1]) - 1);
    e.preventDefault();
    return;
  }

  /* 모닥불은 숫자키로 고른다 — 상점과 같은 조작.
     모닥불과 동행에는 닫는 키가 없다. 불 앞에서 아무것도 안 하고 지나갈 수는
     없어야 이게 선택이 되지, 무시해도 되는 창이 되지 않는다.

     대장장이는 다르다. 거기는 상인이지 관문이라, 살 것이 없으면 나갈 수 있어야 한다 —
     안 갈랐더니 골드가 없을 때 창에 갇혀서 판이 멈췄다. */
  if (UI.campOpen()) {
    if (UI.campCanLeave() && (code === 'Escape' || code === 'Space')) {
      UI.hideCamp();
      e.preventDefault();
      return;
    }
    const n = code.match(/^Digit([1-9])$/) || code.match(/^Numpad([1-9])$/);
    if (n) UI.campPickIndex(Number(n[1]) - 1);
    e.preventDefault();
    return;
  }

  // 개발용. 결말 연출을 보려고 열네 층을 다시 오를 수는 없다.
  // 한 번 누를 때마다 한 단씩 — 옥상 → 주인이 쓰러짐 → 결말 선택.
  if (code === 'BracketRight') { jumpToEnding(); e.preventDefault(); return; }

  if (UI.intro.active) {
    UI.skipIntro();
    e.preventDefault();
    return;
  }

  if (!state.running) {
    if (code === 'Enter' || code === 'Space') {
      const resultVisible = !UI.el.result.classList.contains('hidden');
      const titleVisible  = !UI.el.title.classList.contains('hidden');
      // 결과 화면의 단추와 같은 곳으로 간다 — 손과 키가 다른 데로 가면 안 된다
      if (resultVisible && UI.resultToLobby()) { backToTitle(); e.preventDefault(); }
      else if (resultVisible || titleVisible) { startRun(); e.preventDefault(); }
    }
    return;
  }

  if (code === 'Escape') { UI.showCodex(); e.preventDefault(); return; }
  if (code === 'KeyF') { toggleEmber(); e.preventDefault(); return; }
  if (code === 'KeyN') { noteKey(); e.preventDefault(); return; }
  if (code === 'Digit1' || code === 'Numpad1') { drinkPotion(); e.preventDefault(); return; }
  if (code === 'Space') { playerAction(null, 'wait'); e.preventDefault(); return; }

  const dir = KEY_DIR[code];
  if (dir) {
    for (const c of held) modUsed.add(c);      // 방향과 함께 쓰였다고 표시
    playerAction(dir, currentIntent());
    e.preventDefault();
  }
}

function onKeyUp(e) {
  // 손을 떼면 다시 제 속도로 흐른다
  if (Story.open()) { Story.setFast(false); return; }
  if (UI.creditsOpen()) { UI.creditsFast(false); return; }

  // Z 를 방향키 없이 눌렀다 뗐으면 그것만으로 던진다.
  // 겨눌 것을 스스로 고르므로 방향을 받을 이유가 없어졌다 —
  // 그래도 Z + 방향은 남겨 둔다. 여럿이 몰렸을 때 쪽을 정하고 싶을 때가 있다.
  if (KEY_MOD[e.code] === 'ranged' && !modUsed.has(e.code) &&
      state.running && state.awaitingInput && !UI.gearOpen() && !UI.shopOpen() && !UI.campOpen()) {
    playerAction(null, 'ranged');
  }
  modUsed.delete(e.code);
  held.delete(e.code);
}

/* ---------- 터치 ---------- */

/* 손가락으로도 전부 되어야 한다.
   키보드에만 있던 물약·원거리·불씨·도감을 버튼으로 꺼내고,
   방향이 필요한 원거리는 "겨누기 → 방향" 두 번 두드리는 방식으로 푼다. */

function touchDir(dir) {
  playerAction(dir, 'move');
}

function paintTouch() {
  const aim = document.getElementById('t-aim');
  const ember = document.getElementById('t-ember');
  const pot = document.getElementById('t-potion');
  if (pot) pot.textContent = state.potions;
  if (aim) {
    // 기사에겐 원거리가 아예 없는 조작이다 — 잠긴 버튼이 아니라 없는 버튼
    aim.hidden = !!currentHero().melee;
    aim.classList.toggle('locked', !canRanged());
    aim.textContent = '원거리';
  }
  if (ember) ember.classList.toggle('locked', !MEM.has('douse'));

  // 흔적 — 할 수 있는 순간에만 나타나고, 그때 할 일을 그대로 이름으로 단다
  const mark = document.getElementById('t-mark');
  if (mark) {
    const act = noteAction();
    mark.hidden = !act;
    if (act) mark.textContent = act === 'nod' ? '끄덕' : '남기기';
  }
}

function setupTouch() {
  document.getElementById('touch-pad').addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    Sound.unlock();
    const d = btn.dataset.dir;
    if (d === 'wait') { playerAction(null, 'wait'); }
    else touchDir(d);
  });

  document.getElementById('touch-acts').addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    Sound.unlock();
    switch (btn.dataset.act) {
      case 'potion': drinkPotion(); break;
      // 겨누기 → 방향, 두 번 두드리던 것을 한 번으로 줄였다.
      // 스스로 겨누게 된 뒤로는 방향을 물을 이유가 없다.
      case 'aim': playerAction(null, 'ranged'); break;
      case 'ember': toggleEmber(); break;
      case 'mark': noteKey(); break;
      case 'codex': UI.showCodex('keys'); break;
    }
    paintTouch();
  });

  const canvas = document.getElementById('view');
  let sx = 0, sy = 0;
  canvas.addEventListener('touchstart', e => {
    sx = e.touches[0].clientX; sy = e.touches[0].clientY;
  }, { passive: true });

  canvas.addEventListener('touchend', e => {
    if (UI.intro.active) { UI.skipIntro(); return; }
    const t = e.changedTouches[0];
    const dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
    if (Math.abs(dx) > Math.abs(dy)) touchDir(dx > 0 ? 'right' : 'left');
    else touchDir(dy > 0 ? 'down' : 'up');
  }, { passive: true });
}

/* =========================================================
   프레임 루프 — 로직은 즉시, 연출만 따라온다
   ========================================================= */

let lastTime = 0;

function frame(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000 || 0);
  lastTime = now;

  if (state.map) {
    // 연출: 그려지는 위치가 실제 좌표를 쫓아간다
    // 곁에 있는 것도 같은 보간을 탄다 — 안 그러면 혼자 순간이동한다
    const all = [state.player, ...state.monsters, state.pet];
    for (const e of all) {
      if (!e) continue;
      // 바라보는 쪽 — 좌우로 움직였거나 때린 방향을 기억한다
      if (e.x > e.rx + 0.02) e.face = 1;
      else if (e.x < e.rx - 0.02) e.face = -1;
      if (e.bump && e.bump.dx) e.face = e.bump.dx > 0 ? 1 : -1;

      const k = 1 - Math.pow(0.0001, dt / CFG.MOVE_ANIM);
      e.rx = lerp(e.rx, e.x, k);
      e.ry = lerp(e.ry, e.y, k);
      if (Math.abs(e.rx - e.x) < 0.01) e.rx = e.x;
      if (Math.abs(e.ry - e.y) < 0.01) e.ry = e.y;

      if (e.bump) {
        e.bump.t += dt;
        if (e.bump.t >= CFG.BUMP_ANIM) e.bump = null;
      }
      if (e.flash > 0) e.flash = Math.max(0, e.flash - dt);
    }

    Render.step(dt);
    Render.draw(state, dt);
  }

  requestAnimationFrame(frame);
}

/* =========================================================
   시작
   ========================================================= */

window.addEventListener('DOMContentLoaded', () => {
  UI.init();
  UI.paintIcons();
  UI.renderHeroPick();
  Sound.init();
  Render.init(document.getElementById('view'));
  Net.init();
  Chat.init();
  Cast.init();
  Shell.init();
  Marks.init();

  updateRecordText(loadData());
  showMyNods();

  // 브라우저는 사용자가 무언가를 누르기 전에는 소리를 내주지 않는다
  const wake = () => Sound.unlock();
  window.addEventListener('pointerdown', wake, { once: false });
  window.addEventListener('keydown', wake, { once: false });

  const muteBtn = document.getElementById('btn-mute');
  const paintMute = () => { muteBtn.textContent = Sound.muted ? '소리 끔' : '소리 켬'; };
  paintMute();
  muteBtn.addEventListener('click', () => { Sound.unlock(); Sound.toggleMute(); paintMute(); });

  document.getElementById('btn-start').addEventListener('click', () => { Sound.unlock(); startRun(); });

  // 쓰러졌으면 그 자리에서 한 번 더, 이야기를 끝냈으면 첫 화면으로
  document.getElementById('btn-retry').addEventListener('click', () => {
    if (UI.resultToLobby()) backToTitle();
    else startRun();
  });

  // 하던 판이 남아 있으면 이어서 오를 수 있게 한다
  const resumeBtn = document.getElementById('btn-resume');
  const startBtn = document.getElementById('btn-start');
  const paintResume = () => {
    const d = savedRun();
    resumeBtn.classList.toggle('hidden', !d);
    if (d) {
      resumeBtn.textContent = d.depth + '층부터 이어서 오른다';
      startBtn.textContent = '처음부터 오른다';
    } else {
      startBtn.textContent = '탑에 들어간다';
    }
  };
  paintResume();
  repaintTitle = paintResume;      // 로비로 돌아갈 때 다시 그리려고 밖에서 잡아 둔다
  resumeBtn.addEventListener('click', () => {
    Sound.unlock();
    if (!resumeRun()) { paintResume(); startRun(); }
  });

  // 화면이 가려질 때 한 번 더 남긴다 (전화가 오거나 탭이 바뀔 때)
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveRun(); });
  window.addEventListener('pagehide', saveRun);
  document.querySelectorAll('[data-help]').forEach(b =>
    b.addEventListener('click', () => UI.showCodex('keys')));

  document.getElementById('floor-intro').addEventListener('click', () => UI.skipIntro());
  document.getElementById('gear-take').addEventListener('click', () => resolveGear(true));
  document.getElementById('gear-drop').addEventListener('click', () => resolveGear(false));
  document.getElementById('shop-close').addEventListener('click', () => UI.hideShop());
  document.getElementById('btn-codex').addEventListener('click', () => UI.showCodex('monsters'));
  document.getElementById('codex-close').addEventListener('click', () => UI.hideCodex());
  document.getElementById('codex-tabs').addEventListener('click', e => {
    const b = e.target.closest('button[data-tab]');
    if (b) UI.codexTab(b.dataset.tab);
  });
  document.querySelectorAll('[data-ending]').forEach(b =>
    b.addEventListener('click', () => chooseEnding(b.dataset.ending)));

  /* 크레딧. 흐르는 동안 아무 데나 누르면 끝으로 건너뛰고,
     한 번 더 눌러야 닫힌다 — 건너뛰자마자 닫히면 마지막 줄을 못 읽는다. */
  document.getElementById('btn-credits').addEventListener('click', () => UI.showCredits());
  document.getElementById('credits-close').addEventListener('click', () => UI.hideCredits());
  // 되짚기도 손가락으로 같게
  const story = document.getElementById('story-screen');
  // 한 번은 「누르는 동안 빨리」, 두 번 연달아는 「다음 쪽」 — tap 이 가른다
  story.addEventListener('pointerdown', () => Story.tap());
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) {
    story.addEventListener(ev, () => Story.setFast(false));
  }
  window.addEventListener('resize', () => Story.resize());

  // 손가락으로도 같게 — 누르고 있는 동안 빨라진다
  const credits = document.getElementById('credits-screen');
  credits.addEventListener('pointerdown', e => {
    if (e.target.closest('#credits-close')) return;
    UI.creditsFast(true);
  });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) {
    credits.addEventListener(ev, () => UI.creditsFast(false));
  }
  // 다 흐른 뒤에는 아무 데나 눌러도 닫힌다
  credits.addEventListener('click', e => {
    if (e.target.closest('#credits-close')) return;
    if (!UI.creditsRolling()) UI.hideCredits();
  });

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => held.clear());

  setupTouch();
  paintTouch();
  requestAnimationFrame(frame);
});
