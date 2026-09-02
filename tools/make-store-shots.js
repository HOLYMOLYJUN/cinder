/* =========================================================
   make-store-shots.js — 플레이 스토어에 올릴 폰 화면을 찍는다

     node tools/make-store-shots.js        → docs/store/*.png

   tools/make-shots.js 와 무엇이 다른가:
     저쪽은 README 에 넣을 1280×820 데스크톱 그림이다. 스토어가 원하는 것은
     폰 세로다 — 9:16, 한 변이 320~3840px. 여기서는 405×720 을 2.667 배로 그려
     1080×1920 을 뽑는다. 화면이 좁아지면 게임이 스스로 좁은 배치로 바뀌고
     (render.js 의 narrow), 손가락 조작 버튼도 함께 나타난다. 그래야
     스토어의 그림과 내려받은 앱이 같은 것이 된다.

   dist/app/index.html 이 있으면 그쪽을 찍는다 — 스토어에 올라가는 바로 그
   파일이다. 없으면 저장소의 index.html 로 찍는다 (보이는 것은 같다).

   장면은 손으로 세운다. 봇이 알아서 놀게 두면 어두운 복도에 혼자 서 있는
   그림만 나온다 — 스토어에서 보여줘야 하는 것은 「이 게임에 무엇이 있는가」다.
   ========================================================= */
const { chromium } = require('playwright');
const http = require('http');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'store');
const PORT = Number(process.env.PORT || 8124);

/* 앱 빌드가 있으면 그것을, 없으면 저장소의 것을 찍는다 */
const APP = path.join(ROOT, 'dist', 'app', 'index.html');
const PAGE = fs.existsSync(APP) ? '/dist/app/index.html' : '/index.html';

/* ---------- 붙박이 정적 서버 ----------
   file:// 로 열면 localStorage 와 흔적이 통째로 꺼진다 (marks.js 의 on() 참고).
   서버를 따로 띄우라고 시키는 대신 여기서 하나 세운다. */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};

function serve() {
  return new Promise(resolve => {
    const s = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
      const f = path.join(ROOT, rel);
      // 저장소 바깥으로는 못 나간다
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
        res.writeHead(404); res.end('nope'); return;
      }
      res.writeHead(200, { 'content-type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(res);
    });
    s.listen(PORT, '127.0.0.1', () => resolve(s));
  });
}

/* ---------- 판 하나를 보기 좋게 세운다 ----------
   맨손에 빈 로그로 찍으면 「아직 아무것도 없는 게임」처럼 보인다.
   몇 층 올라온 사람의 화면이 되도록 장비를 들리고 로그를 채운다. */
const stage = (depth, opts) => `(() => {
  UI.closeIntro(); enterFloor(${depth}); UI.closeIntro();
  state.running = true;
  state.ember = ${opts.ember || 1};
  applyFov(); refreshFov();
  const m = state.map, p = state.player;
  const room = m.rooms.reduce((a, r) => (r.w * r.h > a.w * a.h ? r : a), m.rooms[0]);
  /* 벽에 붙여 세울 때가 있다 — 벽의 쪽지는 맞닿은 칸에서만 읽히므로
     흔적 장면은 방 한가운데가 아니라 방의 끝에서 찍어야 한다. */
  p.x = ${opts.edge ? 'room.x' : 'Math.floor(room.x + room.w / 2)'};
  p.y = Math.floor(room.y + room.h / 2);
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

  /* 자리마다 하나씩 확실히 채운다. 굴린 것을 그대로 두면 같은 자리가 거듭 나와
     방어구 칸이 빈 채로 찍히는데, 그건 「아직 아무것도 없는 게임」으로 읽힌다. */
  for (const slot of SLOTS) {
    const want = slot;
    for (let i = 0; i < 300; i++) {
      const g = rollGear(${depth} + 2, 4);
      if (!g || g.slot !== want) continue;
      if (SLOTS.some(s => p.gear[s] && p.gear[s].name === g.name)) continue;
      p.gear[slot] = g;
      break;
    }
  }
  state.level = ${Math.max(1, Math.round(depth * 0.7))};
  recalcStats(p);
  p.hp = Math.round(p.maxHp * 0.72);
  state.gold = 84; state.potions = 3;
  UI.clearLog();
  ${JSON.stringify(opts.log || [])}.forEach(l => UI.log(l[0], l[1]));
  UI.updateHud(state);
  refreshFov();
})()`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await serve();
  const b = await chromium.launch();

  /* 폰 하나. 405×720 을 2.667 배로 그려 1080×1920 이 나온다 —
     스토어가 요구하는 9:16 이고, 한 변이 1080 이라 「추천」 기준도 넘는다.

     폭을 405 로 잡은 것은 요즘 폰의 실제 CSS 폭이기 때문이다. 여기서
     540 처럼 넓게 잡으면 캔버스가 420px 에서 멈추므로(render.js 의 좁은 배치)
     좌우에 검은 띠가 남는다 — 스토어 목록에서 그건 「빈 화면」으로 읽힌다. */
  const ctx = await b.newContext({
    viewport: { width: 405, height: 720 },
    deviceScaleFactor: 8 / 3,
    isMobile: true,
    hasTouch: true,
    locale: 'ko-KR',
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('  ! ' + e.message));
  await page.goto('http://127.0.0.1:' + PORT + PAGE);
  await page.waitForTimeout(900);

  const shot = async (name) => {
    await page.evaluate(() => { const t = document.getElementById('toasts'); if (t) t.innerHTML = ''; });
    const p = path.join(OUT, name + '.png');
    await page.screenshot({ path: p });
    console.log('  ' + name + '.png');
  };

  /* ---------- 다섯 사람 (타이틀) ----------
     판을 세우기 전에 찍어야 하므로 순서가 앞이지만, 스토어에서는 뒤에 둔다 —
     첫 장은 게임 화면이어야 한다. */
  await shot('03-heroes');

  await page.click('#btn-start');
  await page.waitForFunction(() => state.running === true, null, { timeout: 10000 });
  await page.waitForTimeout(700);

  /* ---------- 1. 던전 ----------
     첫 장이 목록에 뜨는 얼굴이다. 몬스터가 눈앞에 있고, 불빛의 경계가 보이고,
     로그가 무슨 게임인지 한 문단으로 말한다. */
  await page.evaluate(stage(4, { mobs: 3, log: [
    ['네 번째 층. 쇠붙이 냄새가 납니다.', 'sys'],
    ['해골에게 7의 피해를 입혔습니다.', ''],
    ['해골이 당신을 칩니다. 4의 피해.', 'hurt'],
    ['벽에 누군가 긁어 둔 말이 있습니다.', 'sys'],
    ['「계단이 있다」', 'hit'],
  ] }));
  await page.waitForTimeout(1200);
  await shot('01-dungeon');

  /* ---------- 2. 흔적 ----------
     이 게임에만 있는 것. 남이 지나간 자리가 내 층에 남아 있다.
     서버가 오늘 무엇을 주든 같은 그림이 나오도록 손으로 세운다.

     방의 왼쪽 끝에 세운다(edge) — 벽의 쪽지는 맞닿은 칸에서만 읽히므로
     방 한가운데에서는 찍을 장면 자체가 안 생긴다. */
  /* 3·6·9·12 층은 쉬는 층이라 몬스터도 없고 「이 층에는 아무것도 없습니다」가
     로그에 찍힌다 (game.js 의 REST_FLOORS). 7 층으로 간다. */
  await page.evaluate(stage(7, { edge: true, mobs: 0, log: [] }));
  // 층 안내가 닫히며 흘리는 줄까지 다 지나간 뒤에 로그를 세운다
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const p = state.player, m = state.map;

    /* 벽에 맞닿은 칸으로 옮긴다. 방 한가운데에서는 쪽지를 붙일 벽이 없어
       장면 자체가 안 생긴다 — edge 로 세워도 그 자리가 통로 입구면 빗나간다. */
    let wall = noteWall(p.x, p.y);
    if (!wall) {
      outer:
      for (let r = 1; r < 14; r++)
        for (let dy = -r; dy <= r; dy++)
          for (let dx = -r; dx <= r; dx++) {
            const x = p.x + dx, y = p.y + dy;
            if (!isWalkable(m, x, y)) continue;
            const w = noteWall(x, y);
            if (!w) continue;
            p.x = x; p.y = y; p.rx = x; p.ry = y; wall = w;
            break outer;
          }
    }

    /* 죽은 자리는 발치에 둔다. 멀리 두면 어둠에 묻혀 「흔적이 있는 게임」이
       아니라 그냥 어두운 방 그림이 된다.

       고리 단위로 훑으면 셋이 한 줄로 서서 세워 놓은 티가 난다. 거리가
       제각각인 자리를 미리 적어 두고 그중 걸을 수 있는 것부터 쓴다. */
    const graves = [];
    for (const d of [[1, -1], [-1, 2], [3, 0], [-2, -2], [2, 2], [0, -3], [-3, 1], [1, 3]]) {
      const x = p.x + d[0], y = p.y + d[1];
      if (isWalkable(m, x, y)) graves.push({ x: x, y: y });
      if (graves.length === 3) break;
    }

    Marks.list = [];
    if (wall) Marks.list.push({ id: 'shot-note', kind: 'note', x: wall.x, y: wall.y, a: 1, b: 4, nods: 3 });
    graves.forEach((g, i) => Marks.list.push({
      id: 'shot-grave-' + i, kind: 'grave', x: g.x, y: g.y,
      by: '누군가', killer: '해골', turns: 214 - i * 37,
    }));

    state.monsters.length = 0;
    UI.clearLog();
    UI.log('세 사람이 여기서 멈췄습니다.', 'sys');
    refreshFov();
    readNoteHere();
    UI.updateHud(state);
  });
  await page.waitForTimeout(900);
  await shot('02-marks');

  /* ---------- 4. 장비 비교 ----------
     고르는 순간이 이 게임에서 제일 자주 오는 장면이다.
     고대의 물건을 하나 굴려 세운다 — 흔한 것이 뜨면 「+1」만 보인다. */
  await page.evaluate(() => {
    const p = state.player;

    /* 그냥 굴리면 지금 낀 것보다 나쁜 물건이 잡혀 비교창이 온통 빨간 숫자가 된다.
       고르는 재미를 보여주는 자리이므로 「크게 오르는 줄이 하나 있는 것」을
       고른다 — 오르내림이 섞여야 고민하는 화면이 되지, 전부 마이너스면
       그냥 나쁜 물건을 주운 화면이다. */
    let best = null, bestScore = -Infinity;
    for (let i = 0; i < 600; i++) {
      const g = rollGear(9, 5);
      if (!g || !g.slot || g.rarity !== 'ancient') continue;
      const cur = p.gear[equipSlotFor(g, p)];
      if (!cur) continue;
      const rows = compareRows(g, cur);
      const up = Math.max.apply(null, rows.map(r => r.diff));
      const sum = rows.reduce((a, r) => a + r.diff, 0);
      const score = up * 2 + sum;
      if (up >= 5 && score > bestScore) { bestScore = score; best = g; }
    }
    if (!best) best = makeGear(GEAR.find(d => d.rarity === 'ancient' && d.slot === 'weapon' && !d.only));

    /* 가방을 열고 그 물건을 골라 둔다. 예전에는 비교창을 띄우는 자리였는데
       그 창은 없어졌다 — 지금은 가방의 설명 칸이 같은 일을 한다.
       가방을 보여주는 편이 낫기도 하다 — 「주운 것을 들고 다닐 수 있다」가
       한 장에 드러난다. */
    state.bag = [best];
    for (const n of ['재의 장화', '수정 목걸이', '사슬 갑옷', '부적']) {
      const d = GEAR.find(g => g.name === n);
      if (d && state.bag.length < 6) state.bag.push(makeGear(d));
    }
    openBag();
    document.querySelector('#bag-slots [data-bag="0"]').click();
  });
  await page.waitForTimeout(500);
  await shot('04-gear');
  await page.evaluate(() => { UI.hideBag(); });
  await page.waitForTimeout(300);

  /* ---------- 5. 상점 ----------
     골드를 쓸 곳이 있다는 것과, 살 것이 여러 개라는 것을 한 장으로 말한다. */
  await page.evaluate(() => {
    state.gold = 240;
    state.shopRerolls = 0;
    state.shopStock = rollShopStock(9, state.player, 4);
    UI.updateHud(state);
    openShop();
  });
  await page.waitForTimeout(600);
  await shot('05-shop');
  await page.evaluate(() => UI.hideCamp());
  await page.waitForTimeout(300);

  /* ---------- 7. 되짚기 ----------
     흐르는 연출이라 그냥 찍으면 타이핑 도중이 잡힌다. 시계를 세우고
     글이 다 찍힌 시점을 직접 만들어 한 장만 그린다. */
  await page.evaluate(() => {
    Story.show(() => {});
    cancelAnimationFrame(Story.raf); Story.raf = 0;
    Story.at = 3; Story.page = 0; Story.sceneT = 2.0;
    const sc = Story.scenes[Story.at];
    document.getElementById('story-title').textContent = sc.title;
    document.getElementById('story-lines').innerHTML = '';
    const total = (sc.pages[0] || []).join('').length;
    Story.typed = -1;
    Story.t = Story.BEAT + (total * Story.LINE_MS) / 1000 + 0.2;
    Story.step(0);
  });
  await page.waitForTimeout(500);
  await shot('07-story');
  await page.evaluate(() => Story.finish());
  await page.waitForTimeout(400);

  /* ---------- 6. 도감 ----------
     마주친 것만 열리는 화면이라 새 판에서 그냥 열면 「아직 마주치지 않았다」만
     스무 줄 나온다. 한참 올라온 사람의 도감이 되도록 먼저 채운다. */
  await page.evaluate(() => {
    UI.hideCamp();
    MONSTERS.forEach(d => { state.seenMonsters.add(d.id); rememberMonster(d.id); });
    UI.showCodex('monsters');
  });
  await page.waitForTimeout(600);
  await shot('06-codex');

  await b.close();
  server.close();

  const files = fs.readdirSync(OUT).filter(f => f.endsWith('.png'));
  const total = files.reduce((a, f) => a + fs.statSync(path.join(OUT, f)).size, 0);
  console.log('\n' + PAGE + ' 로 찍음 — docs/store/ 에 ' + files.length + '장, 합쳐서 ' +
              (total / 1024).toFixed(0) + ' KB');
  console.log('규격: 1080×1920 (9:16) — Play Console 「휴대전화」 칸에 그대로 올린다.');
})();
