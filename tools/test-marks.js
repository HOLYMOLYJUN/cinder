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

// 사람을 벽 아래 빈 칸에 세운다 — 그래야 벽에 긁을 수 있다
const standByWall = (page) => page.evaluate(() => {
  const m = state.map, cx = 20, cy = 12;
  for (let y = cy - 2; y <= cy + 2; y++)
    for (let x = cx - 3; x <= cx + 3; x++) m.tiles[y][x] = T.FLOOR;
  for (let x = cx - 3; x <= cx + 3; x++) m.tiles[cy - 3][x] = T.WALL;
  state.player.x = cx; state.player.y = cy - 2;
  state.player.rx = cx; state.player.ry = cy - 2;
  state.monsters.length = 0;
  m.props = [];
  refreshFov();
  return { x: state.player.x, y: state.player.y };
});

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
