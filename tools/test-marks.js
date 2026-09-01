/* =========================================================
   test-marks.js — 남이 지나간 자리 (죽은 자리 · 벽의 쪽지)

   먼저 두 가지를 띄워 놓고 실행한다:
     cd server && npx wrangler dev --port 8788
     python -m http.server 8123          (저장소 뿌리에서)

     node tools/test-marks.js

   서버 없이도 게임이 멀쩡히 도는지가 절반이다 —
   흔적은 있으면 좋은 것이지 없으면 안 되는 것이 아니다.
   ========================================================= */
const { chromium } = require('playwright');

const GAME  = process.env.GAME  || 'http://127.0.0.1:8123/index.html';
const PARTY = process.env.PARTY || 'http://127.0.0.1:8788';

let fails = 0;
const check = (c, m) => { console.log((c ? '  O ' : '  X ') + m); if (!c) fails++; };

async function open(browser, uid) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 820 } });
  page.on('pageerror', e => { console.log('  ! ' + e.message); fails++; });
  await page.route('**/js/config.js', async route => {
    const res = await route.fetch();
    const body = (await res.text()).replace(/(HOST:\s*)'[^']*'(\s*,)/, "$1'" + PARTY + "'$2");
    await route.fulfill({ response: res, body });
  });
  await page.addInitScript(v => {
    try {
      localStorage.setItem('jaetbul.uid', v);
      localStorage.setItem('jaetbul.chat.v1', JSON.stringify({ name: v, joined: false }));
    } catch (e) {}
  }, uid);
  await page.goto(GAME);
  await page.waitForTimeout(500);
  await page.click('#btn-start');
  await page.waitForFunction(() => state.running === true, null, { timeout: 8000 });
  return page;
}

/* 사람을 벽 아래 빈 칸에 세운다 — 그래야 벽에 긁을 수 있다.
   자리를 옮길 수 있어야 한다: 같은 칸에 세우면 남이 이미 붙여 둔 쪽지가 있어서
   「남기기」가 아니라 「끄덕」이 뜬다 (실제로 이 검사가 그렇게 한 번 틀렸다). */
const standByWall = (page, at) => page.evaluate((at) => {
  const m = state.map;
  const cx = at ? at.x : 20, cy = at ? at.y : 12;
  for (let y = cy - 2; y <= cy + 2; y++)
    for (let x = cx - 3; x <= cx + 3; x++) m.tiles[y][x] = T.FLOOR;
  for (let x = cx - 3; x <= cx + 3; x++) m.tiles[cy - 3][x] = T.WALL;
  state.player.x = cx; state.player.y = cy - 2;
  state.player.rx = cx; state.player.ry = cy - 2;
  state.monsters.length = 0;
  m.props = [];
  refreshFov();
  return { x: state.player.x, y: state.player.y };
}, at);

(async () => {
  const b = await chromium.launch();
  const floor = 40 + Math.floor(Math.random() * 50);   // 검사끼리 안 섞이게 빈 층을 쓴다

  console.log('\n[ 문구는 번호에서 만들어진다 ]');
  const A = await open(b, 'markA');
  const words = await A.evaluate(() => ({
    forms: NOTE_FORMS.length, words: NOTE_WORDS.length,
    samples: [noteText(0, 0), noteText(1, 4), noteText(2, 8), noteText(5, 2), noteText(5, 1)],
  }));
  check(words.forms * words.words >= 60,
        `틀 ${words.forms} × 낱말 ${words.words} = ${words.forms * words.words}가지`);
  check(words.samples.every(s => s && s.length > 1), '전부 문장이 된다: ' + words.samples.join(' / '));
  // 조사가 낱말에 맞춰 갈리는가 (불 → 불을, 적 → 적을)
  check(words.samples[3] !== words.samples[4] &&
        /을|를/.test(words.samples[3]) && /을|를/.test(words.samples[4]),
        `조사가 낱말을 따라간다: ${words.samples[3]} / ${words.samples[4]}`);

  /* 「위쪽 벽만」이던 시절에는 설 수 있는 칸의 20% 에서만 쓸 수 있었다.
     나머지 80% 에서는 눌러도 아무 일이 없으므로 기능이 없는 것으로 읽혔다.
     이 숫자가 다시 떨어지면 같은 일이 반복된다. */
  console.log('\n[ 쓸 수 있는 자리가 드물지 않다 ]');
  await A.evaluate((f) => { enterFloor(f); UI.closeIntro(); }, 2);
  await A.waitForFunction(() => state.running === true, null, { timeout: 8000 });
  const reach = await A.evaluate(() => {
    const m = state.map, p = state.player, ox = p.x, oy = p.y;
    let walk = 0, write = 0;
    for (let y = 1; y < m.tiles.length - 1; y++)
      for (let x = 1; x < m.tiles[y].length - 1; x++) {
        if (!isWalkable(m, x, y)) continue;
        walk++;
        // 자판의 N 이 열리는 자리 — 버튼은 여기에 「두 번 밀기」를 더 요구한다
        if (noteWall(x, y)) write++;
      }
    p.x = ox; p.y = oy;
    // 네 방향 벽에 다 긁을 수 있는가
    const dirs = { up: 0, left: 0, right: 0, down: 0 };
    for (const [k, d] of Object.entries({ up: [0,-1], left: [-1,0], right: [1,0], down: [0,1] })) {
      const w = { x: 5, y: 5 };
      dirs[k] = NOTE_DIRS.some(v => v.dx === d[0] && v.dy === d[1]) ? 1 : 0;
    }
    return { walk, write, pct: write / walk * 100, dirs };
  });
  check(reach.pct > 40, `설 수 있는 칸의 ${reach.pct.toFixed(0)}% 에서 쓸 수 있다 (예전 20%)`);
  check(Object.values(reach.dirs).every(v => v === 1), '네 방향 벽에 다 긁을 수 있다');

  // 남길 수는 있는데 아무도 못 읽는 쪽지가 생기면 안 된다
  const bothWays = await A.evaluate(() => {
    const m = state.map, p = state.player;
    const bad = [];
    for (let y = 1; y < m.tiles.length - 1; y++)
      for (let x = 1; x < m.tiles[y].length - 1; x++) {
        if (!isWalkable(m, x, y)) continue;
        const w = noteWall(x, y);
        if (!w) continue;
        // 쓴 자리에서 그 쪽지가 읽혀야 한다
        Marks.list.push({ id: 'probe', kind: 'note', x: w.x, y: w.y, a: 0, b: 0, nods: 0 });
        const readable = !!Marks.noteNear(x, y);
        Marks.list.pop();
        if (!readable) bad.push([x, y]);
      }
    return bad.length;
  });
  check(bothWays === 0, '남긴 자리에서 그 쪽지가 읽힌다 — 못 읽는 쪽지는 안 생긴다');

  console.log('\n[ 남긴다 ]');
  await A.evaluate((f) => { enterFloor(f); UI.closeIntro(); }, floor);
  await A.waitForFunction(() => state.running === true, null, { timeout: 8000 });
  const spot = await standByWall(A);
  const wrote = await A.evaluate(async () => {
    noteKey();                                  // 벽 앞이라 쓰는 창이 뜬다
    const opened = UI.campOpen();
    UI.campPickIndex(0);                        // 낱말: 함정
    const second = document.getElementById('camp-say').textContent;
    UI.campPickIndex(0);                        // 틀: ○○ 조심
    await new Promise(r => setTimeout(r, 600));
    return { opened, second, closed: !UI.campOpen(),
             mine: Marks.list.filter(m => m.mine).length,
             wrote: Marks.wroteThisFloor };
  });
  check(wrote.opened, '벽 앞에서 N 을 누르면 쓰는 창이 뜬다');
  check(/함정/.test(wrote.second), `낱말을 고르면 그 낱말이 끼워진 틀을 보여준다 (${wrote.second})`);
  check(wrote.closed && wrote.mine === 1, '고르면 그 자리에 바로 붙는다');

  const again = await A.evaluate(() => { noteKey(); const o = UI.campOpen(); UI.hideCamp(); return o; });
  check(!again, '한 층에 하나만 — 두 번째는 창이 안 뜬다');

  console.log('\n[ 다른 사람이 읽고 끄덕인다 ]');
  const B = await open(b, 'markB');
  await B.evaluate((f) => { enterFloor(f); UI.closeIntro(); }, floor);
  await B.waitForFunction(() => state.running === true, null, { timeout: 8000 });
  await B.waitForTimeout(600);
  await standByWall(B);
  const seen = await B.evaluate((s) => {
    const m = Marks.list.find(v => v.kind === 'note' && !v.guide && v.x === s.x && v.y === s.y - 1);
    return m ? { text: Marks.text(m), mine: m.mine, nods: m.nods } : null;
  }, spot);
  check(seen && /함정/.test(seen.text), `남이 남긴 말이 보인다 — 「${seen && seen.text}」`);
  check(seen && !seen.mine, '남의 것으로 표시된다');

  const nodded = await B.evaluate(async () => {
    noteKey();                                  // 남의 말 앞이면 끄덕인다
    await new Promise(r => setTimeout(r, 600));
    const m = Marks.noteNear(state.player.x, state.player.y);
    return { nods: m && m.nods, twice: Marks.nodded.size };
  });
  check(nodded.nods === 1, `끄덕이면 세어진다 (${nodded.nods})`);

  const back = await A.evaluate(() => Marks.myNods());
  check(back >= 1, `쓴 사람이 그것을 알게 된다 (${back}명이 읽음)`);

  console.log('\n[ 쓰러진 자리 ]');
  const died = await B.evaluate(async () => {
    state.lastKiller = '오크';
    const p = state.player;
    const at = { x: p.x, y: p.y };
    await Marks.add('grave', at.x, at.y, { killer: '오크', turns: state.turns });
    await new Promise(r => setTimeout(r, 500));
    return at;
  });
  const A2 = await open(b, 'markC');
  await A2.evaluate((f) => { enterFloor(f); UI.closeIntro(); }, floor);
  await A2.waitForFunction(() => state.running === true, null, { timeout: 8000 });
  await A2.waitForTimeout(600);
  const grave = await A2.evaluate((at) => {
    const g = Marks.at(at.x, at.y);
    if (!g) return null;
    const before = state.gold;
    state.player.x = at.x; state.player.y = at.y;
    onPlayerEnter(at.x, at.y);
    return { kind: g.kind, killer: g.killer, before, after: state.gold, taken: !!g.taken };
  }, died);
  check(grave && grave.kind === 'grave', '다음 사람에게 쓰러진 자리가 보인다');
  check(grave && grave.killer === '오크', `무엇에게 당했는지도 남는다 (${grave && grave.killer})`);
  check(grave && grave.after > grave.before,
        `밟으면 남은 것을 줍는다 (골드 ${grave && grave.before} → ${grave && grave.after})`);
  check(grave && grave.taken, '한 번 주우면 다시 안 준다');

  /* 모바일에는 N 키가 없다. 버튼이 「할 수 있을 때만」 나타나야 하는데,
     늘 보이면 자리를 먹고 안 보이면 기능이 통째로 없는 것이 된다. */
  console.log('\n[ 손가락으로도 된다 ]');
  const D = await open(b, 'markD');
  await D.evaluate((f) => { enterFloor(f); UI.closeIntro(); }, floor);
  await D.waitForFunction(() => state.running === true, null, { timeout: 8000 });
  await D.waitForTimeout(600);

  const away = await D.evaluate(() => {
    // 벽에서 떨어진 자리 — 할 일이 없으니 버튼도 없어야 한다
    const m = state.map;
    for (let y = 10; y <= 16; y++) for (let x = 16; x <= 24; x++) m.tiles[y][x] = T.FLOOR;
    state.player.x = 20; state.player.y = 13; state.player.rx = 20; state.player.ry = 13;
    state.monsters.length = 0; m.props = [];
    refreshFov(); paintTouch();
    return { hidden: document.getElementById('t-mark').hidden, act: noteAction() };
  });
  check(away.hidden && away.act === null, '할 일이 없으면 버튼이 없다');

  /* 벽 옆에 서기만 해도 버튼이 뜨면, 걷는 내내 켜졌다 꺼졌다 해서
     「지금 할 수 있다」가 아니라 그냥 깜빡이는 것이 된다.
     같은 벽을 두 번 미는 것은 우연히 일어나지 않는다. */
  await standByWall(D, { x: 20, y: 18 });     // A 가 붙여 둔 벽과 다른 벽으로
  const near = await D.evaluate(() => {
    paintTouch();
    return document.getElementById('t-mark').hidden;
  });
  check(near, '벽 옆에 서 있기만 해서는 안 뜬다');

  const bump = await D.evaluate(() => {
    const hints = (re) => [...document.querySelectorAll('#log div')]
      .filter(d => re.test(d.textContent)).length;
    const el = document.getElementById('t-mark');
    const p = state.player;              // standByWall 이 이미 벽 아래에 세워 두었다

    playerAction('up', 'move');          // 한 번 민다
    const once = { hidden: el.hidden, hint: hints(/한 번 더 밀면/) };
    playerAction('up', 'move');          // 두 번째
    const twice = { hidden: el.hidden, label: el.textContent, ready: hints(/한 마디 남깁니다/) };
    playerAction('up', 'move');          // 세 번째 — 또 말하면 잔소리다
    return { once, twice, again: hints(/한 마디 남깁니다/), modal: UI.campOpen(),
             wall: tileAt(state.map, p.x, p.y - 1) === T.WALL };
  });
  check(bump.wall && bump.once.hidden && bump.once.hint === 1,
        '한 번 밀면 「한 번 더」라고만 알려준다');
  check(!bump.twice.hidden && bump.twice.label === '남기기',
        `두 번 밀면 그때 뜬다 (${bump.twice.label})`);
  check(!bump.modal, '그래도 창이 저절로 뜨지는 않는다 — 누를지는 사람이 정한다');
  check(bump.again === 1, `귀띔은 한 층에 한 번뿐 (${bump.again}번 적혔다)`);

  // 자리를 옮기면 셈이 처음으로 — 「두 번」은 잇달아 민 것이어야 뜻이 있다
  const walked = await D.evaluate(() => {
    playerAction('down', 'move');        // 벽에서 한 걸음 물러난다
    playerAction('up', 'move');          // 다시 붙는다 (걸음이므로 밀기가 아니다)
    playerAction('up', 'move');          // 여기서 겨우 한 번 민 것
    paintTouch();
    return document.getElementById('t-mark').hidden;
  });
  check(walked, '걸어서 자리를 옮기면 셈이 처음부터다');

  const tapped = await D.evaluate(async () => {
    document.querySelector('[data-act="mark"]').click();
    const opened = UI.campOpen();
    UI.campPickIndex(1); UI.campPickIndex(0);
    await new Promise(r => setTimeout(r, 600));
    return { opened, hidden: document.getElementById('t-mark').hidden,
             mine: Marks.list.filter(m => m.mine).length };
  });
  check(tapped.opened && tapped.mine === 1, '버튼을 눌러 남긴다');
  check(tapped.hidden, '남기고 나면 버튼이 스스로 물러난다');

  console.log('\n[ 서버가 없어도 판은 돈다 ]');
  const off = await chromium.launch();
  const C = await off.newPage({ viewport: { width: 900, height: 800 } });
  const errs = []; C.on('pageerror', e => errs.push(e.message));
  await C.goto(GAME);                            // HOST 를 안 바꿨으므로 진짜 서버로 간다
  await C.waitForTimeout(400);
  await C.route('**/marks/**', route => route.abort());   // 흔적만 통째로 끊는다
  await C.click('#btn-start');
  await C.waitForFunction(() => state.running === true, null, { timeout: 8000 });
  const alone = await C.evaluate(async () => {
    enterFloor(4); UI.closeIntro();
    await new Promise(r => setTimeout(r, 500));
    playerAction('right', 'move');
    return { running: state.running,
             fromServer: Marks.list.filter(m => !m.guide).length,
             guide: Marks.list.filter(m => m.guide).length };
  });
  check(alone.running && alone.fromServer === 0, '흔적을 못 받아도 그대로 논다');
  // 길잡이는 서버를 안 탄다. 서버가 죽어도 층이 텅 비지는 않는다
  check(alone.guide > 0, `서버가 끊겨도 탑이 남긴 길잡이는 있다 (${alone.guide}장)`);
  check(errs.length === 0, '에러도 안 난다' + (errs.length ? ': ' + errs[0] : ''));
  await off.close();

  console.log(fails ? `\n실패 ${fails}건` : '\n전부 통과');
  await b.close();
  process.exit(fails ? 1 : 0);
})();
