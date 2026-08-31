/* 잿불 — 이어하기 검증

   한 판이 스무 분인데 탭을 닫으면 통째로 날아가면 안 된다.
   저장된 판을 불러왔을 때 지도·몬스터·장비·기억이 그대로인지 본다. */

const { chromium } = require('playwright');
let fails = 0;
const check = (c, m) => { console.log((c ? '  O ' : '  X ') + m); if (!c) fails++; };

(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });

  await p.goto(require('url').pathToFileURL(require('path').join(__dirname, '..', 'index.html')).href);
  await p.evaluate(() => localStorage.clear());
  await p.reload(); await p.waitForTimeout(700);

  console.log('\n[ 처음에는 이어할 것이 없다 ]');
  check(await p.evaluate(() => !document.getElementById('btn-resume') ||
        document.getElementById('btn-resume').classList.contains('hidden')),
        '이어하기 버튼이 숨어 있다');

  /* 몇 층 올라가서 상태를 만든다 */
  await p.click('#btn-start');
  await p.waitForFunction(() => state.running === true, null, { timeout: 8000 });
  const before = await p.evaluate(() => {
    // 장비를 쥐여주고 몇 층 올린다
    state.memories = new Set(['throw', 'climb']);
    persist();
    state.player.gear.weapon = makeGear(GEAR.find(g => g.name === '짧은 검'));
    recalcStats(state.player);        // 기억까지 반영된 뒤의 스탯으로 비교해야 한다
    enterFloor(6); UI.closeIntro();
    state.resumable = true;
    state.gold = 123; state.potions = 4; state.kills = 9; state.chill = 0;
    state.player.hp = Math.floor(state.player.maxHp * 0.6);
    // 지도 일부를 탐험한 것으로
    for (let i = 0; i < 40; i++) state.map.explored[state.player.y][i % state.map.w] = true;
    saveRun();
    return {
      depth: state.depth, gold: state.gold, potions: state.potions, kills: state.kills,
      hp: state.player.hp, maxHp: state.player.maxHp,
      weapon: state.player.gear.weapon.name,
      monsters: state.monsters.filter(m => m.alive).length,
      px: state.player.x, py: state.player.y,
      tiles: state.map.tiles.map(r => r.join('')).join('|'),
      explored: state.map.explored.flat().filter(Boolean).length,
      items: state.map.items.length,
      hasVault: !!state.map.vault,
      stats: { ...state.player.stats },
    };
  });
  console.log('\n[ 저장 ]');
  check(await p.evaluate(() => !!savedRun()), `${before.depth}층 상태가 저장됨`);
  const size = await p.evaluate(() => (localStorage.getItem('jaetbul.run.v1') || '').length);
  console.log(`  저장 크기 ${(size / 1024).toFixed(1)}KB`);
  check(size > 0 && size < 300 * 1024, '저장 크기가 감당할 만하다');

  /* 탭을 닫았다 켠 셈치고 새로고침 */
  await p.reload();
  await p.waitForTimeout(800);

  console.log('\n[ 불러오기 ]');
  const btn = await p.evaluate(() => {
    const b = document.getElementById('btn-resume');
    return { hidden: b.classList.contains('hidden'), text: b.textContent.trim(),
             startText: document.getElementById('btn-start').textContent.trim() };
  });
  check(!btn.hidden, '이어하기 버튼이 나타남: ' + btn.text);
  check(/6층/.test(btn.text), '몇 층이었는지 버튼에 보인다');
  check(btn.startText === '처음부터 오른다', '새로 시작 버튼의 말도 바뀐다: ' + btn.startText);

  await p.click('#btn-resume');
  await p.waitForTimeout(500);
  const after = await p.evaluate(() => ({
    running: state.running,
    depth: state.depth, gold: state.gold, potions: state.potions, kills: state.kills,
    hp: state.player.hp, maxHp: state.player.maxHp,
    weapon: state.player.gear.weapon && state.player.gear.weapon.name,
    monsters: state.monsters.filter(m => m.alive).length,
    px: state.player.x, py: state.player.y,
    tiles: state.map.tiles.map(r => r.join('')).join('|'),
    explored: state.map.explored.flat().filter(Boolean).length,
    items: state.map.items.length,
    hasVault: !!state.map.vault,
    stats: { ...state.player.stats },
    memories: [...state.memories].sort(),
  }));

  check(after.running, '판이 돌아가는 상태로 복원됨');
  check(after.depth === before.depth, `층 ${after.depth}`);
  check(after.tiles === before.tiles, '지도가 한 칸도 다르지 않다');
  check(after.explored === before.explored, `탐험한 곳도 그대로 (${after.explored}칸)`);
  check(after.px === before.px && after.py === before.py, '서 있던 자리도 그대로');
  check(after.hp === before.hp && after.maxHp === before.maxHp, `체력 ${after.hp}/${after.maxHp}`);
  check(after.gold === before.gold && after.potions === before.potions && after.kills === before.kills,
        `골드 ${after.gold} · 물약 ${after.potions} · 처치 ${after.kills}`);
  check(after.weapon === before.weapon, '들고 있던 무기: ' + after.weapon);
  check(JSON.stringify(after.stats) === JSON.stringify(before.stats), '스탯이 같다');
  check(after.monsters === before.monsters, `몬스터 ${after.monsters}마리 그대로`);
  check(after.items === before.items, `바닥의 물건 ${after.items}개 그대로`);
  check(after.hasVault === before.hasVault, '보물방 유무도 유지');
  check(after.memories.join(',') === 'climb,throw', '기억도 그대로: ' + after.memories.join(', '));

  /* 판이 끝나면 지워져야 한다 */
  console.log('\n[ 끝나면 지운다 ]');
  await p.evaluate(() => { state.player.hp = 1; kill(state.player); });
  await p.waitForTimeout(300);
  check(await p.evaluate(() => !savedRun()), '죽으면 이어할 판이 사라진다');

  await p.reload(); await p.waitForTimeout(700);
  check(await p.evaluate(() => document.getElementById('btn-resume').classList.contains('hidden')),
        '버튼도 다시 숨는다');

  console.log('\n에러:', errs.length ? errs.join('\n') : '없음');
  if (errs.length) fails++;
  console.log(fails === 0 ? '\n전부 통과' : `\n실패 ${fails}건`);
  await b.close();
  process.exit(fails ? 1 : 0);
})();
