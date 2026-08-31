/* =========================================================
   test-cast.js — 관전 검증

   탭 두 개를 띄워 한쪽이 실제로 판을 돌리고, 다른 쪽이 그것을 본다.
   보이는지만 보는 게 아니라 **관전이 관전자의 것을 망가뜨리지 않는지**를 본다 —
   전역 state 를 통째로 갈아치우는 기능이라 그쪽이 훨씬 위험하다.

   먼저 두 가지를 띄워 놓고 실행한다:
     cd server && npx wrangler dev
     python3 -m http.server 3000            (저장소 뿌리에서)

     node tools/test-cast.js
   ========================================================= */

const { chromium } = require('playwright');

const GAME  = process.env.GAME  || 'http://127.0.0.1:3000/index.html';
const PARTY = process.env.PARTY || 'http://127.0.0.1:8787';

const ok = [], bad = [];
const check = (name, cond, extra) => { (cond ? ok : bad).push(name + (extra ? ' — ' + extra : '')); };
const wait = ms => new Promise(r => setTimeout(r, ms));

async function newTab(browser, name, room) {
  const page = await browser.newPage();
  page.on('pageerror', e => bad.push('[' + name + '] 페이지 예외: ' + e.message));
  await page.route('**/js/config.js', async route => {
    const res = await route.fetch();
    const body = (await res.text()).replace(/(HOST:\s*)'[^']*'(\s*,)/, "$1'" + PARTY + "'$2");
    await route.fulfill({ response: res, body });
  });
  await page.addInitScript(v => {
    try { localStorage.setItem('jaetbul.chat.v1', v); } catch (e) {}
  }, JSON.stringify({ name: name, room: room, joined: true }));
  await page.goto(GAME);
  await page.waitForFunction(() => typeof Net !== 'undefined' && Net.status === 'open',
    null, { timeout: 8000 });
  return page;
}

const startRun = async p => {
  await p.click('#btn-start');
  await p.waitForFunction(() => state.running === true, null, { timeout: 8000 });
  await wait(400);
};

/* 실제로 한 칸 옮겨 간다. 옮겨 갔는지까지 돌려준다.

   벽만 피하면 되는 게 아니다 — 앞에 몬스터가 서 있으면 때리느라 제자리이고,
   잠긴 문은 열쇠가 없으면 안 열리고, 계단을 밟으면 층이 바뀌면서 연출이 뜬다.
   이걸 안 걸러내면 "움직였다" 검사가 어쩌다 한 번씩 헛돈다. */
const step = async p => {
  const was = await p.evaluate(() => ({ x: state.player.x, y: state.player.y }));
  const code = await p.evaluate(() => {
    const d = { KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyD: [1, 0] };
    const free = [];
    for (const [k, [dx, dy]] of Object.entries(d)) {
      const x = state.player.x + dx, y = state.player.y + dy;
      const t = state.map.tiles[y] && state.map.tiles[y][x];
      if (t !== 1 && t !== 3) continue;                 // 바닥과 모닥불만 (벽·문·계단·상점 제외)
      if (state.monsters.some(m => m.alive && m.x === x && m.y === y)) continue;
      free.push(k);
    }
    return free.length ? free[Math.floor(Math.random() * free.length)] : null;
  });
  if (!code) return false;
  await p.keyboard.press(code);
  await wait(320);
  const now = await p.evaluate(() => ({ x: state.player.x, y: state.player.y }));
  return now.x !== was.x || now.y !== was.y;
};

// 실제로 n 번 옮겨 갈 때까지. 막히면 다른 쪽을 고른다.
const walk = async (p, n) => {
  let moved = 0;
  for (let i = 0; i < n * 6 && moved < n; i++) if (await step(p)) moved++;
  return moved;
};

(async () => {
  const browser = await chromium.launch(
    process.env.CHROME
      ? { executablePath: process.env.CHROME, args: ['--no-sandbox'] }
      : {});

  const room = 'cast-' + Math.random().toString(36).slice(2, 7);
  const host = await newTab(browser, '방송자', room);
  const eye  = await newTab(browser, '관전자', room);

  /* ---------- 타이틀 화면에 있어도 부름이 보여야 한다 ----------
     띠를 게임 화면 안에 두면 아직 판을 시작하지 않은 사람에게는 통째로 안 보이고,
     그러면 «보기» 를 누를 방법이 아예 없다. 관전만 하려는 사람이 정확히 그 처지다. */
  const idle = await newTab(browser, '구경만', room);
  await startRun(host);
  await host.keyboard.press('KeyC');
  await wait(200);
  await host.click('#chat-cast');
  await wait(900);
  check('타이틀 화면에서도 방송 알림이 보인다', await idle.isVisible('#cast-bar'));
  check('타이틀 화면에서도 «보기» 를 누를 수 있다', await idle.isVisible('#cast-go'));
  await idle.click('#cast-go');
  await wait(700);
  check('판을 시작하지 않은 사람도 관전할 수 있다',
    (await idle.evaluate(() => state.spectating)) === true);
  check('그 사람 화면에도 던전이 그려진다', await idle.isVisible('#game-screen'));
  await idle.close();
  await host.click('#chat-close');
  await host.evaluate(() => Cast.stopCast());
  await wait(300);

  /* ---------- 관전자도 자기 판을 하고 있다 ---------- */
  await startRun(eye);
  await walk(eye, 3);
  const mine = await eye.evaluate(() => ({
    depth: state.depth, x: state.player.x, y: state.player.y, hp: state.player.hp,
  }));
  check('관전자가 자기 판을 하고 있다', mine.depth === 1);

  /* ---------- 방송 ---------- */
  await host.keyboard.press('KeyC');
  await wait(200);
  await host.click('#chat-cast');
  await wait(600);
  check('방송 버튼이 켜진 것으로 바뀐다',
    (await host.textContent('#chat-cast')) === '방송 끄기');

  // 관전자에게 띠가 뜨되, 아직 화면이 바뀌면 안 된다
  await wait(600);
  check('관전자에게 방송 알림 띠가 뜬다', await eye.isVisible('#cast-bar'));
  check('띠에 방송자 이름이 있다',
    (await eye.textContent('#cast-text')).includes('방송자'));
  const still = await eye.evaluate(() => ({ x: state.player.x, y: state.player.y }));
  check('«보기» 를 누르기 전에는 내 판이 그대로다',
    still.x === mine.x && still.y === mine.y, `(${still.x},${still.y})`);
  check('«보기» 전에는 관전 상태가 아니다',
    (await eye.evaluate(() => state.spectating)) === false);

  /* ---------- 보기 ---------- */
  await eye.click('#cast-go');
  await wait(700);
  check('«보기» 를 누르면 관전이 시작된다',
    (await eye.evaluate(() => state.spectating)) === true);

  const cmp = async () => ({
    h: await host.evaluate(() => ({
      x: state.player.x, y: state.player.y, hp: state.player.hp,
      maxHp: state.player.maxHp, atk: state.player.stats.atk,
      depth: state.depth, mons: state.monsters.filter(m => m.alive).length,
    })),
    e: await eye.evaluate(() => ({
      x: state.player.x, y: state.player.y, hp: state.player.hp,
      maxHp: state.player.maxHp, atk: state.player.stats.atk,
      depth: state.depth, mons: state.monsters.filter(m => m.alive).length,
    })),
  });

  let c = await cmp();
  check('관전 화면이 방송자의 자리에 있다', c.h.x === c.e.x && c.h.y === c.e.y,
    `방송(${c.h.x},${c.h.y}) 관전(${c.e.x},${c.e.y})`);
  check('체력이 같다', c.h.hp === c.e.hp && c.h.maxHp === c.e.maxHp,
    `${c.h.hp}/${c.h.maxHp} vs ${c.e.hp}/${c.e.maxHp}`);
  check('공격력이 같다 (기억을 블롭에서 읽는다)', c.h.atk === c.e.atk,
    `${c.h.atk} vs ${c.e.atk}`);
  check('몬스터 수가 같다', c.h.mons === c.e.mons, `${c.h.mons} vs ${c.e.mons}`);

  /* ---------- 움직이면 따라온다 ----------
     확성기 창이 열려 있으면 입력칸에 포커스가 남아 게임 키가 막힌다(그게 맞는 동작이다).
     닫지 않으면 방송자가 제자리에 서 있고, 그러면 "따라온다" 검사가
     둘 다 안 움직인 것으로 통과해 버린다. */
  await host.click('#chat-close');
  await wait(200);

  /* walk 는 자리가 실제로 바뀐 걸음만 센다. 그러니 이 수가 0 이 아니면
     방송자가 정말로 걸었다는 뜻이다 — 앞서 확성기 창에 포커스가 남아
     한 발도 못 뗐던 것이 이 검사에 걸렸다.

     시작과 끝 자리를 비교하지는 않는다. 아무 쪽으로나 걷다 보면 왕복해서
     제자리로 돌아오는 판이 나오고, 그러면 멀쩡한 코드가 실패로 찍힌다. */
  const hostMoved = await walk(host, 4);
  check('방송자가 실제로 걸었다', hostMoved > 0, hostMoved + '걸음');
  await wait(800);
  c = await cmp();
  check('걷고 난 자리를 관전 화면이 따라온다', c.h.x === c.e.x && c.h.y === c.e.y,
    `방송(${c.h.x},${c.h.y}) 관전(${c.e.x},${c.e.y})`);

  // 몬스터가 매 장 새로 태어나면 보간이 죽는다 — 표(uid)가 이어지는지 본다
  const uids = await eye.evaluate(() => state.monsters.map(m => m.uid).filter(Boolean).length);
  check('몬스터가 표(uid)를 이어받는다', uids > 0, uids + '마리');

  /* ---------- 관전자가 자기 것을 망가뜨리지 않는가 ---------- */
  check('관전 중에는 입력을 기다리지 않는다',
    (await eye.evaluate(() => state.awaitingInput)) === false);
  check('관전 중에는 이어하기로 저장되지 않는다',
    (await eye.evaluate(() => state.resumable)) === false);

  const savedDepth = await eye.evaluate(() => JSON.parse(localStorage.getItem('jaetbul.run.v1')).player);
  check('내 이어하기가 남의 판으로 덮이지 않았다',
    savedDepth.x === mine.x && savedDepth.y === mine.y,
    `저장(${savedDepth.x},${savedDepth.y}) 내판(${mine.x},${mine.y})`);

  // 관전 중 방향키를 눌러도 아무 일이 없어야 한다
  const beforeKey = await eye.evaluate(() => ({ x: state.player.x, y: state.player.y }));
  await eye.keyboard.press('KeyW');
  await eye.keyboard.press('KeyA');
  await wait(300);
  const afterKey = await eye.evaluate(() => ({ x: state.player.x, y: state.player.y }));
  check('관전 중 방향키는 아무 일도 하지 않는다',
    beforeKey.x === afterKey.x && beforeKey.y === afterKey.y);

  // 관전자는 관전한 것을 다시 방송하지 않는다
  check('관전 중에는 방송이 나가지 않는다',
    (await eye.evaluate(() => packRun())) === null);

  /* ---------- 판이 끝나면 알린다 ---------- */
  await host.evaluate(() => { state.player.hp = 1; });
  await host.evaluate(() => endRun(false));
  await wait(800);
  check('방송자의 판이 끝난 것을 관전자가 안다',
    (await eye.textContent('#log')).includes('판이 끝났습니다'));

  /* ---------- 그만두면 내 판으로 돌아온다 ---------- */
  await eye.click('#cast-stop');
  await wait(800);
  check('관전을 그만두면 관전 상태가 풀린다',
    (await eye.evaluate(() => state.spectating)) === false);
  const back = await eye.evaluate(() => ({
    x: state.player.x, y: state.player.y, depth: state.depth, resumable: state.resumable,
  }));
  check('내 판의 그 자리로 돌아온다', back.x === mine.x && back.y === mine.y,
    `돌아온 자리(${back.x},${back.y}) 원래(${mine.x},${mine.y})`);
  check('돌아오면 다시 저장이 걸린다', back.resumable === true);
  check('돌아오면 다시 움직일 수 있다', (await walk(eye, 1)) > 0);

  await browser.close();
  console.log('\n통과 ' + ok.length + ' / 실패 ' + bad.length);
  ok.forEach(s => console.log('  OK   ' + s));
  bad.forEach(s => console.log('  FAIL ' + s));
  process.exit(bad.length ? 1 : 0);
})();
