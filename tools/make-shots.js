/* =========================================================
   make-shots.js — README 에 넣을 화면을 찍는다

     python -m http.server 8123      (저장소 뿌리에서)
     node tools/make-shots.js        → docs/shot-*.png

   tools/shots/ 는 검사가 남기는 임시 그림이라 .gitignore 에 있다.
   이쪽은 저장소에 남아 README 가 참조하므로 자리를 따로 둔다.

   장면은 손으로 세운다. 봇이 알아서 놀게 두면 어두운 복도에 혼자 서 있는
   그림만 잔뜩 나온다 — 보여주고 싶은 것은 「이 게임에 무엇이 있는가」다.
   ========================================================= */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const GAME = process.env.GAME || 'http://127.0.0.1:8123/index.html';
const OUT = path.resolve(__dirname, '..', 'docs');

/* 판 하나를 보기 좋게 세운다. 층과 몬스터 수만 다르게 준다. */
const stage = (depth, opts) => `(() => {
  UI.closeIntro(); enterFloor(${depth}); UI.closeIntro();
  state.running = true;
  state.ember = ${opts.ember || 1};
  applyFov(); refreshFov();
  const m = state.map, p = state.player;
  const room = m.rooms.reduce((a, r) => (r.w * r.h > a.w * a.h ? r : a), m.rooms[0]);
  p.x = Math.floor(room.x + room.w / 2); p.y = Math.floor(room.y + room.h / 2);
  p.rx = p.x; p.ry = p.y;
  state.monsters.length = 0;
  [[2,0],[-3,1],[1,-2],[3,2],[-2,-2]].slice(0, ${opts.mobs || 3}).forEach((s, i) => {
    const x = p.x + s[0], y = p.y + s[1];
    if (!isWalkable(m, x, y)) return;
    const mon = makeMonster(MONSTERS[(i + ${depth}) % MONSTERS.length], x, y);
    mon.rx = x; mon.ry = y; state.monsters.push(mon);
  });
  m.items.push({ x: p.x - 1, y: p.y + 2, type: 'gold', amount: 40 });
  m.items.push({ x: p.x + 2, y: p.y + 1, type: 'potion' });

  /* 맨손에 빈 로그로 찍으면 「아직 아무것도 없는 게임」처럼 보인다.
     실제로 몇 층 올라온 사람의 화면이 되도록 장비를 들리고 로그를 채운다. */
  for (const slot of SLOTS) {
    const g = rollGear(${depth} + 2, p);
    if (g && g.slot) p.gear[g.slot] = g;
  }
  // 레벨을 먼저 올리고 나서 세운다 — recalcStats 가 레벨 보정까지 함께 얹는다
  state.level = ${Math.max(1, Math.round(depth * 0.7))};
  recalcStats(p);
  p.hp = Math.round(p.maxHp * 0.72);            // 상처 없이 말끔한 것보다 낫다
  state.gold = 84; state.potions = 3;
  UI.clearLog();
  ${JSON.stringify(opts.log || [])}.forEach(l => UI.log(l[0], l[1]));
  UI.updateHud(state);
  refreshFov();
})()`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1280, height: 820 } });
  page.on('pageerror', e => console.log('  ! ' + e.message));
  await page.goto(GAME);
  await page.waitForTimeout(800);

  const shot = async (name, target) => {
    const p = path.join(OUT, name + '.png');
    await (target ? page.locator(target) : page).screenshot({ path: p });
    console.log('  ' + name + '.png');
  };

  /* ---------- 타이틀 ---------- */
  await shot('shot-title', '#title-screen');

  await page.click('#btn-start');
  await page.waitForFunction(() => state.running === true, null, { timeout: 8000 });
  await page.waitForTimeout(600);

  /* ---------- 돌 던전 (HUD 까지 — 화면이 어떻게 생겼는지 보이게) ---------- */
  await page.evaluate(stage(4, { mobs: 3, log: [
    ['네 번째 층. 쇠붙이 냄새가 납니다.', 'sys'],
    ['해골에게 7의 피해를 입혔습니다.', ''],
    ['해골이 당신을 칩니다. 4의 피해.', 'hurt'],
    ['벽에 누군가 긁어 둔 말이 있습니다.', 'sys'],
    ['「계단이 있다」', 'hit'],
  ] }));
  await page.waitForTimeout(1200);
  await page.evaluate(() => { const t = document.getElementById('toasts'); if (t) t.remove(); });
  await shot('shot-dungeon', '#game-screen');

  /* ---------- 하수도 바이옴 (11층부터 배경이 바뀐다) ---------- */
  await page.evaluate(stage(12, { mobs: 3, log: [] }));
  await page.waitForTimeout(900);
  await shot('shot-sewer', '#view');

  /* ---------- 되짚기 ----------
     흐르는 연출이라 그냥 찍으면 타이핑 도중이 잡힌다. 시계를 먼저 세우고,
     글이 다 찍힌 시점을 직접 만들어 한 장만 그린다. */
  await page.evaluate(() => {
    Story.show(() => {});
    cancelAnimationFrame(Story.raf); Story.raf = 0;

    Story.at = 3; Story.page = 0; Story.sceneT = 2.0;
    const sc = Story.scenes[Story.at];
    document.getElementById('story-title').textContent = sc.title;
    document.getElementById('story-lines').innerHTML = '';

    // 다 찍히기에는 충분하고, 다음 쪽으로 넘어가기에는 모자란 시각
    const total = (sc.pages[0] || []).join('').length;
    Story.typed = -1;
    Story.t = Story.BEAT + (total * Story.LINE_MS) / 1000 + 0.2;
    Story.step(0);
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => { const t = document.getElementById('toasts'); if (t) t.remove(); });
  await shot('shot-story', '#story-screen');
  await page.evaluate(() => Story.finish());

  /* ---------- 도감 ----------
     마주친 것만 열리는 화면이라 새 판에서 그냥 열면 「아직 마주치지 않았다」만
     스무 줄 나온다. 한참 올라온 사람의 도감이 되도록 먼저 채운다. */
  await page.evaluate(() => {
    UI.hideCamp();
    MONSTERS.forEach(d => { state.seenMonsters.add(d.id); rememberMonster(d.id); });
    UI.showCodex('monsters');
  });
  await page.waitForTimeout(500);
  await shot('shot-codex', '#codex-screen');

  await b.close();
  const total = fs.readdirSync(OUT).filter(f => f.endsWith('.png'))
    .reduce((a, f) => a + fs.statSync(path.join(OUT, f)).size, 0);
  console.log(`\ndocs/ — 합쳐서 ${(total / 1024).toFixed(0)} KB`);
})();
