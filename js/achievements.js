/* =========================================================
   achievements.js — 업적

   클리어한 뒤에도 남는 목표를 만드는 장치다.
   그래서 몇 개는 일부러 어렵게 둔다 —
   전부 한 판에 딸려 오면 다시 할 이유가 없어진다.

   달성은 save 에 남고, 판을 넘어 유지된다.
   ========================================================= */

const ACHIEVEMENTS = [
  { id: 'first',    name: '첫 걸음',        desc: '두 번째 층에 오른다' },
  { id: 'deep10',   name: '절반쯤 위',      desc: '10층에 오른다' },

  { id: 'gate',     name: '문지기를 지나',  desc: '5층의 주인을 쓰러뜨린다' },
  { id: 'named',    name: '이름을 알다',    desc: '10층의 주인을 쓰러뜨린다' },
  { id: 'keeper',   name: '탑의 끝',        desc: '등불지기를 쓰러뜨린다' },

  { id: 'endLight', name: '불을 붙였다',    desc: '남은 것을 태우기로 한다' },
  { id: 'endLeave', name: '불을 든 채로',   desc: '붙이지 않기로 한다' },
  { id: 'bothEnds', name: '두 가지 끝',     desc: '두 결말을 모두 본다' },

  { id: 'recall5',  name: '되찾는 자',      desc: '기억을 다섯 개 되찾는다' },
  { id: 'recall9',  name: '온전한 기억',    desc: '기억을 모두 되찾는다' },
  { id: 'bestiary', name: '명부를 채우다',  desc: '모든 종류를 한 번씩 마주친다' },
  { id: 'armory',   name: '재의 창고',      desc: '모든 장비를 한 번씩 손에 넣는다' },

  { id: 'rich',     name: '재를 팔아',      desc: '한 판에 골드를 200 모은다' },
  { id: 'barehand', name: '맨손',           desc: '장비 하나 없이 5층에 오른다' },
  { id: 'unhurt',   name: '스치지 않고',    desc: '한 층을 피해 없이 지나간다' },
  { id: 'magician', name: '지팡이를 든 자', desc: '마법으로 싸우는 채로 10층에 오른다' },
  { id: 'level10',  name: '단단해진 몸',   desc: '한 판에 10레벨에 닿는다' },

  /* ---------- 탑을 오르는 「방식」에 붙는 것들 ----------
     여기 있는 것은 전부 클리어를 전제로 하고, 그 위에 스스로 건 제약을 센다.
     그래서 하나같이 「안 했다」가 조건이다 — 더 하는 것보다 참는 것이 어렵다.

     조심할 것: 애초에 할 수 없는 사람에게는 공짜가 된다.
     기사는 원거리가 아예 없으므로 「손으로만」이 그냥 딸려 온다.
     그래서 조건을 「안 썼다」가 아니라 **「쓸 수 있었는데 안 썼다」** 로 잡는다. */
  { id: 'noCamp',   name: '불을 쬐지 않고', desc: '모닥불을 한 번도 쓰지 않고 탑을 오른다' },
  { id: 'noShop',   name: '빚 없이',        desc: '상인과 한 번도 거래하지 않고 탑을 오른다' },
  { id: 'meleeOnly',name: '손으로만',       desc: '원거리를 쓸 수 있는 채로, 한 번도 쓰지 않고 오른다' },
  { id: 'rangedOnly',name: '닿지 않고',     desc: '맞붙어 때리는 일 없이 탑을 오른다' },
  { id: 'allHeroes',name: '모두의 탑',      desc: '다섯 사람 모두로 탑을 오른다' },
];

function hasAch(id) {
  const s = loadData() || {};
  return (s.achievements || []).includes(id);
}

// 달성. 이미 가진 것이면 아무 일도 일어나지 않는다.
function unlockAch(id) {
  const save = loadData() || {};
  const got = new Set(save.achievements || []);
  if (got.has(id)) return;
  got.add(id);
  save.achievements = [...got];
  saveData(save);

  const def = ACHIEVEMENTS.find(a => a.id === id);
  if (def) { Sound.play('ach'); UI.toast(def.name, def.desc); }
}

/* ---------- 판 도중에 확인하는 것들 ---------- */

// 층에 올라설 때
function checkFloorAchievements(depth) {
  if (depth >= 2) unlockAch('first');
  if (depth >= 10) unlockAch('deep10');
  if (depth >= 5 && SLOTS.every(s => !state.player.gear[s])) unlockAch('barehand');
  if (depth >= 10 && isMagicAttack(state.player)) unlockAch('magician');
}

// 레벨이 오를 때
function checkLevelAchievements() {
  if (state.level >= 10) unlockAch('level10');
}

/* 탑 끝까지 오른 순간에 한 번. chooseEnding 이 부른다 —
   끝을 본 사람에게만 주는 것이라 「도달」이 아니라 「결말」이 기준이다. */
function checkClearAchievements() {
  if (!state.usedCamp) unlockAch('noCamp');
  if (!state.traded) unlockAch('noShop');
  // 쓸 수 있었는데 안 쓴 경우만. 기사에게는 애초에 열리지 않는다.
  if (state.couldRanged && !state.usedRanged) unlockAch('meleeOnly');
  if (!state.usedMelee) unlockAch('rangedOnly');

  // 이 사람으로 오른 적이 있는가. 다섯을 다 채우면 열린다.
  const save = loadData() || {};
  const done = new Set(save.clearedHeroes || []);
  done.add(currentHero().id);
  save.clearedHeroes = [...done];
  saveData(save);
  if (done.size >= HEROES.length) unlockAch('allHeroes');
}

// 수집 관련 — 도감이 채워질 때마다
function checkCollectionAchievements() {
  const save = loadData() || {};
  if ((save.codex || []).length >= MONSTERS.length) unlockAch('bestiary');
  if ((save.itemCodex || []).length >= GEAR.length) unlockAch('armory');
  if (state.memories.size >= 5) unlockAch('recall5');
  if (state.memories.size >= MEMORIES.length) unlockAch('recall9');
}
