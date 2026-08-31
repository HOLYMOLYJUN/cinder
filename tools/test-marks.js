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
    const m = Marks.noteNear(s.x, s.y);
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

  await standByWall(D, { x: 20, y: 18 });     // A 가 붙여 둔 벽과 다른 벽으로
  const near = await D.evaluate(() => {
    paintTouch();
    return { hidden: document.getElementById('t-mark').hidden,
             label: document.getElementById('t-mark').textContent };
  });
  check(!near.hidden && near.label === '남기기', `벽 앞에 서면 나타난다 (${near.label})`);

  // 벽으로 걸어 들어가면 귀띔한다 — 창은 뜨지 않아야 한다
  const bump = await D.evaluate(() => {
    const hints = () => [...document.querySelectorAll('#log div')]
      .filter(d => /벽이 손에 닿습니다/.test(d.textContent)).length;
    const p = state.player;              // standByWall 이 이미 벽 아래에 세워 두었다
    playerAction('up', 'move');          // 벽으로 걸어 들어간다
    const first = hints();
    playerAction('up', 'move');          // 한 번 더 — 또 말하면 잔소리다
    return { first, second: hints(), modal: UI.campOpen(),
             wall: tileAt(state.map, p.x, p.y - 1) === T.WALL };
  });
  check(bump.wall && bump.first === 1, '벽으로 걸어 들어가면 남길 수 있다고 알려준다');
  check(!bump.modal, '그렇다고 창이 뜨지는 않는다 — 길 찾다 부딪히는 일이 잦다');
  check(bump.second === 1, `귀띔은 한 층에 한 번뿐 (${bump.second}번 적혔다)`);

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
    return { running: state.running, marks: Marks.list.length };
  });
  check(alone.running && alone.marks === 0, '흔적을 못 받아도 그대로 논다');
  check(errs.length === 0, '에러도 안 난다' + (errs.length ? ': ' + errs[0] : ''));
  await off.close();

  console.log(fails ? `\n실패 ${fails}건` : '\n전부 통과');
  await b.close();
  process.exit(fails ? 1 : 0);
})();
