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
  resumable: false,       // 지금 상태를 이어할 수 있는가

  level: 1,               // 이번 판의 레벨 — 죽으면 사라진다
  xp: 0,                  // 다음 레벨까지 모은 경험치
};

const POTION_MAX = 10;     // 물약 소지 한도

const held = new Set();     // 지금 눌려 있는 모디파이어 키
const modUsed = new Set();  // 그 키가 방향과 함께 쓰였는가

/* =========================================================
   판 시작 / 층 이동
   ========================================================= */

function startRun() {
  clearRun();
  state.resumable = false;
  state.depth = 1;
  state.gold = 0;
  state.potions = 2;
  state.kills = 0;
  state.turns = 0;
  state.pendingGear = null;
  state.pendingMemory = null;
  state.gotMemoryThisRun = false;
  state.revived = false;
  state.seenMonsters = new Set();
  state.ember = 0;
  state.hasKey = false;
  state.chill = 0;
  state.burn = 0;
  state.level = 1;
  state.xp = 0;
  Render.dawnAt = 0;      // 다시 밤부터

  // 되찾은 기억은 판을 넘어 남는다
  const save = loadData() || {};
  state.memories = new Set(save.memories || []);
  state.pity = save.pity || 0;

  state.player = makePlayer();
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
  const tag = isRest ? { id: null, hint: '', monsterMul: 0, fovAdd: 1 } : choice(pool);

  // 보물방. 열쇠를 든 몬스터가 있어야 하므로 몬스터가 없는 안식처에는 두지 않는다.
  // '쇠붙이 냄새가 나는' 층에는 반드시 있다 — 그 문장이 예고가 된다.
  // 맨 위층만 옥상이다. 보물방도 층 속성도 여기서는 의미가 없다.
  const isRoof = depth >= CFG.TOP_FLOOR;
  const wantVault = !isRoof && !isRest && depth >= 2 && (tag.id === 'treasure' || chance(0.4));
  const map = isRoof ? makeRoof(depth) : makeFloor(depth, wantVault);
  state.floorTag = tag;
  state.campUses = 0;
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
    for (let i = 0; i < count; i++) {
      const spot = findSpawnSpot(map, p);
      if (!spot) break;
      state.monsters.push(makeMonster(choice(table), spot.x, spot.y));
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
      const g = rollGear(depth, ancientLuck());
      if (s && g) map.items.push({ x: s.x, y: s.y, type: 'gear', gear: g });
    }
  }

  // 상인의 물건 — 층수보다 조금 앞선 물건을 판다
  state.shopStock = [];
  if (isRest) {
    state.shopStock = rollShopStock(depth + 2, state.player, 3);
    // 물약은 여러 개 사 갈 수 있어야 한다. 한 병만 파는 상인은 상인이 아니다.
    state.shopStock.push({ kind: 'potion', price: 14 + depth, stock: 8, sold: false });
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
  state.fovRadius = clamp(CFG.FOV_RADIUS + tagAdd + state.ember * 2, 3, 12);
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
  if (UI.gearOpen() || UI.shopOpen()) return;      // 창이 떠 있는 동안은 움직이지 않는다

  const p = state.player;

  if (intent === 'wait') {
    // 상인 앞에서 대기하면 다시 말을 건다.
    // 창을 실수로 닫았을 때 타일을 벗어났다 돌아올 필요가 없도록.
    if (state.map.tiles[p.y][p.x] === T.SHOP) { openShop(); return; }
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
    attack(p, target, d);
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

  if (!isWalkable(state.map, tx, ty)) return;  // 벽 — 턴 낭비 없음

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
      if (state.potions >= POTION_MAX) {
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

  const t = map.tiles[y][x];

  if (t === T.SHOP) openShop();

  if (t === T.CAMP) {
    const p = state.player;
    const healed = p.maxHp - p.hp;
    p.hp = p.maxHp;
    state.campUses++;

    // 「돌아선 밤」을 되찾았으면 모닥불이 한 번 더 탄다
    const maxUses = MEM.has('night') ? 2 : 1;
    if (state.campUses >= maxUses) map.tiles[y][x] = T.FLOOR;

    Sound.play('camp');
    Render.addFloater(x, y, healed > 0 ? '+' + healed : '온기', COLORS.heal);
    UI.log(healed > 0 ? '모닥불에서 몸을 녹였습니다. 체력을 모두 회복했습니다.'
                      : '모닥불에서 몸을 녹였습니다.', 'good');
    if (state.campUses < maxUses) UI.log('불이 아직 남아 있습니다.', 'sys');
  }

  if (t === T.STAIRS) {
    Sound.play('stairs');
    if (!state.hurtThisFloor && state.depth >= 2) unlockAch('unhurt');
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
  const heal = Math.min(18, p.maxHp - p.hp);
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
function rangedTarget(dir) {
  const p = state.player;
  const range = isMagicAttack(p) ? 7 : 6;
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
  if (!MEM.has('throw')) {
    UI.log('멀리 있는 것을 맞히는 법이 기억나지 않습니다.', 'sys');
    return false;
  }

  let target = rangedTarget(dir);
  if (!target) {
    // 헛되이 턴을 쓰게 하지 않는다. 겨눌 것이 없으면 아무 일도 일어나지 않는다.
    UI.log('겨눌 것이 보이지 않습니다.', 'sys');
    Sound.play('miss');
    return false;
  }

  // 가는 길에 다른 것이 서 있으면 그것이 맞는다 — 관통하지 않는다
  for (const [lx, ly] of lineTiles(p.x, p.y, target.x, target.y)) {
    if (lx === p.x && ly === p.y) continue;
    const m = monsterAt(lx, ly);
    if (m && m.alive) { target = m; break; }
  }

  // 한 번 던지면 다음 한 턴은 못 던진다.
  // 겨누는 수고가 사라지자 매 턴 던지는 게 언제나 최선이 되어,
  // 몬스터가 닿기도 전에 판이 끝나 버렸다. 붙어서 싸울 이유를 남겨 둔다.
  // 던지는 쪽을 바라보게 한다
  if (target.x !== p.x) p.face = target.x > p.x ? 1 : -1;

  const fire = isMagicAttack(p);
  if (fire) Render.addOrb(p.x, p.y, target.x, target.y);
  else      Render.addBeam(p.x, p.y, target.x, target.y, COLORS.ember);
  Sound.play(fire ? 'fireball' : 'throw');

  const { dmg } = rollDamage(p, target);

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
    // 바닥에 그대로 남긴다. 마음이 바뀌면 다시 밟으면 된다.
    // (지금 서 있는 칸이므로 한 번 벗어났다 돌아와야 다시 뜬다 — 나가라고 조르지 않는다)
    state.map.items.push({ x: p.x, y: p.y, type: 'gear', gear: g });
    UI.log(josa(gearFullName(g), '을', '를') + ' 그대로 두었습니다.', 'sys');
    return;
  }
  const old = p.gear[g.slot];
  p.gear[g.slot] = g;
  recalcStats(p);

  const wasMagic = old ? null : null;
  UI.log(josa(gearFullName(g), '을', '를') + ' 착용했습니다' +
         (old ? ' (' + gearFullName(old) + ' 버림).' : '.'), 'good');

  // 노선이 바뀌는 순간은 알려준다 — 이 게임 전투의 핵심 규칙이라
  if (isMagicAttack(p)) {
    UI.log('주문이 공격보다 높습니다. 이제 마법으로 싸웁니다.', 'hit');
  }
  UI.updateHud(state);
}

/* =========================================================
   상점
   ========================================================= */

function openShop() {
  if (!state.shopStock.length) return;
  UI.setShopSay(state.depth >= 12
    ? '여기까지 온 사람은 오랜만이군. 위에는 아무것도 없어.'
    : '위로 가는 사람은 드물지. 필요한 걸 골라.');
  UI.showShop(state.shopStock, state.gold, state.player, buyFromShop);
}

function buyFromShop(i) {
  const entry = state.shopStock[i];
  if (!entry || entry.sold || state.gold < entry.price) return;
  if (entry.kind === 'potion' && state.potions >= POTION_MAX) {
    UI.log('물약은 ' + POTION_MAX + '개까지만 들 수 있습니다.', 'sys');
    return;
  }

  state.gold -= entry.price;
  Sound.play('buy');

  // 재고가 있는 물건은 하나씩 줄고, 다 팔리면 그때 사라진다
  if (entry.stock > 1) entry.stock--;
  else { entry.stock = 0; entry.sold = true; }

  if (entry.kind === 'potion') {
    state.potions++;
    UI.log(entry.sold ? '마지막 물약을 샀습니다.'
                      : '물약을 샀습니다. 상인에게 ' + entry.stock + '개 남았습니다.', 'good');
  } else {
    const p = state.player;
    const old = p.gear[entry.gear.slot];
    p.gear[entry.gear.slot] = entry.gear;
    rememberGear(entry.gear);
    recalcStats(p);
    UI.log(josa(gearFullName(entry.gear), '을', '를') + ' 샀습니다' +
           (old ? ' (' + gearFullName(old) + ' 버림).' : '.'), 'good');
    if (isMagicAttack(p)) UI.log('주문이 공격보다 높습니다. 이제 마법으로 싸웁니다.', 'hit');
  }

  UI.updateHud(state);
  UI.showShop(state.shopStock, state.gold, state.player, buyFromShop);   // 다시 그린다
}

function spendPlayerTurn() {
  state.player.energy -= CFG.ENERGY_COST;
  state.awaitingInput = false;
  state.turns++;
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

function attack(attacker, defender, dir) {
  const { dmg, magic } = rollDamage(attacker, defender);

  attacker.bump = { dx: dir.dx, dy: dir.dy, t: 0 };
  defender.hp -= dmg;
  defender.flash = CFG.FLASH_TIME;
  if (defender.kind === 'player') state.hurtThisFloor = true;

  Render.addFloater(defender.x, defender.y, String(dmg),
                    magic ? COLORS.cast : COLORS.damage);

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
    endRun(false);
    return;
  }
  entity.alive = false;
  entity.marks = null;
  state.kills++;
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
      setTimeout(() => UI.showEnding(), 1200);
      return;
    }
    // 계단이 열린다 — 보스가 서 있던 자리에
    const s = state.map.stairs;
    state.map.tiles[s.y][s.x] = T.STAIRS;
    UI.log('막혀 있던 계단이 드러납니다.', 'good');
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
            UI.showGearCompare(g, state.player.gear[g.slot]);
          }
        });
        return;
      }

      // 이번 턴에 주운 장비가 있으면 지금 비교창을 띄운다
      if (state.pendingGear) {
        const g = state.pendingGear;
        Sound.play('gear' + g.rarity[0].toUpperCase() + g.rarity.slice(1));
        UI.showGearCompare(g, state.player.gear[g.slot]);
      }
      return;
    }

    monsterTurn(actor);
    actor.energy -= CFG.ENERGY_COST;
  }
}

function monsterTurn(m) {
  if (m.boss) { bossTurn(m); return; }
  const p = state.player;
  const dist = chebyshev(m.x, m.y, p.x, p.y);
  const canSee = dist <= (m.sight || monsterSight()) &&
                 hasLineOfSight(state.map, m.x, m.y, p.x, p.y);

  /* --- 원거리형: 준비했다가 쏜다. 준비 중에 사거리를 벗어나면 빗나간다. --- */
  if (m.ranged) {
    if (m.casting > 0) {
      m.casting = 0;
      if (canSee && dist <= 6) {
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
    if (canSee && dist <= 6 && dist >= 2) {
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
  if (which === 'light') {
    Render.lightDawn();
    setTimeout(() => UI.showResult('불이 다시 켜졌다',
      '당신은 남은 것을 전부 태웠습니다.\n' +
      '세상이 밝아집니다.\n\n' +
      '그리고 탑은 다시, 다음 공물을 기다립니다.', rows), 3400);
  } else {
    setTimeout(() => UI.showResult('불을 든 채로',
      '당신은 불씨를 손에 쥔 채 내려갑니다.\n' +
      '어둠은 그대로입니다.\n\n' +
      '그러나 더는 아무도 태워지지 않습니다.', rows), 1900);
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
      if (resultVisible || titleVisible) { startRun(); e.preventDefault(); }
    }
    return;
  }

  if (code === 'Escape') { UI.showCodex(); e.preventDefault(); return; }
  if (code === 'KeyF') { toggleEmber(); e.preventDefault(); return; }
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
  // Z 를 방향키 없이 눌렀다 뗐으면 그것만으로 던진다.
  // 겨눌 것을 스스로 고르므로 방향을 받을 이유가 없어졌다 —
  // 그래도 Z + 방향은 남겨 둔다. 여럿이 몰렸을 때 쪽을 정하고 싶을 때가 있다.
  if (KEY_MOD[e.code] === 'ranged' && !modUsed.has(e.code) &&
      state.running && state.awaitingInput && !UI.gearOpen() && !UI.shopOpen()) {
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
    aim.classList.toggle('locked', !MEM.has('throw'));
    aim.textContent = '원거리';
  }
  if (ember) ember.classList.toggle('locked', !MEM.has('douse'));
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
    const all = [state.player, ...state.monsters];
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

  updateRecordText(loadData());

  // 브라우저는 사용자가 무언가를 누르기 전에는 소리를 내주지 않는다
  const wake = () => Sound.unlock();
  window.addEventListener('pointerdown', wake, { once: false });
  window.addEventListener('keydown', wake, { once: false });

  const muteBtn = document.getElementById('btn-mute');
  const paintMute = () => { muteBtn.textContent = Sound.muted ? '소리 끔' : '소리 켬'; };
  paintMute();
  muteBtn.addEventListener('click', () => { Sound.unlock(); Sound.toggleMute(); paintMute(); });

  document.getElementById('btn-start').addEventListener('click', () => { Sound.unlock(); startRun(); });

  document.getElementById('btn-retry').addEventListener('click', startRun);

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

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => held.clear());

  setupTouch();
  paintTouch();
  requestAnimationFrame(frame);
});
