/* =========================================================
   make-feature.js — 플레이 스토어 「그래픽 이미지」를 만든다

     node tools/make-feature.js      → docs/store/feature-1024x500.png

   1024x500 은 구글이 못박아 둔 크기다. 등록정보 맨 위에 깔리고,
   추천 자리에 뜰 때도 이 그림이 나간다.

   ---- make-og.js 와 무엇이 다른가 ----

   만드는 방식은 같다. 그림을 새로 그리지 않고 **실제 판을 찍어** 그 위에
   이름을 얹는다 — 「이게 무슨 게임인지」를 1초 안에 알리는 자리라, 손으로 그린
   것보다 진짜 화면 한 장이 언제나 낫다.

   다른 것은 **무엇을 안 적는가**다. og.png 에는 「설치 없이 브라우저에서 바로」와
   cindertower.com 이 적혀 있는데, 그건 링크로 건넸을 때의 말이다. 스토어에서는
   둘 다 곤란하다:
     · 「설치 없이」 — 지금 앱을 설치하려는 사람에게 할 말이 아니다
     · 도메인 주소  — 스토어 바깥으로 사람을 보내는 그림이다
   구글 지침도 스토어 배지·기기 사진·「지금 받으세요」 같은 문구를 금한다.

   그리고 **가운데를 비워 두지 않는다.** 이 그림은 자리에 따라 좌우가 잘리므로,
   글자는 가장자리에서 충분히 띄운다.
   ========================================================= */
const { chromium } = require('playwright');
const http = require('http');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'store', 'feature-1024x500.png');
const PORT = Number(process.env.PORT || 8126);

/* 앱 빌드가 있으면 그것을 찍는다 — 스토어에 올라가는 바로 그 파일이다 */
const APP = path.join(ROOT, 'dist', 'app', 'index.html');
const PAGE = fs.existsSync(APP) ? '/dist/app/index.html' : '/index.html';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.ico': 'image/x-icon',
};

(async () => {
  const srv = http.createServer((q, r) => {
    const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/, ''));
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
      r.writeHead(404); r.end(); return;
    }
    r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(r);
  });
  await new Promise(r => srv.listen(PORT, '127.0.0.1', r));

  const b = await chromium.launch();

  /* ---------- 1. 판을 세워 캔버스만 찍는다 ---------- */
  const page = await b.newPage({ viewport: { width: 1280, height: 760 }, deviceScaleFactor: 2 });
  page.on('pageerror', e => console.log('  ! ' + e.message));
  await page.goto(`http://127.0.0.1:${PORT}${PAGE}`);
  await page.waitForTimeout(800);
  await page.click('#btn-start');
  await page.waitForFunction(() => state.running === true, null, { timeout: 8000 });

  await page.evaluate(() => {
    UI.closeIntro();
    enterFloor(4);
    UI.closeIntro();
    state.running = true;
    state.ember = 1;                       // 불씨를 키워 멀리까지 보이게
    applyFov(); refreshFov();

    const m = state.map, p = state.player;
    const room = m.rooms.reduce((a, r) => (r.w * r.h > a.w * a.h ? r : a), m.rooms[0]);
    p.x = Math.floor(room.x + room.w / 2); p.y = Math.floor(room.y + room.h / 2);
    p.rx = p.x; p.ry = p.y;

    /* 손에 무기를 들려 둔다 — 사람이 뭔가 들고 있어야 사람으로 읽힌다 */
    const w = GEAR.find(g => g.name === '카타나') || GEAR.find(g => g.slot === 'weapon');
    if (w) { p.gear.weapon = makeGear(w); recalcStats(p); }

    state.monsters.length = 0;
    const spots = [[2, 0], [-3, 1], [1, -2], [4, 2]];
    spots.forEach((s, i) => {
      const x = p.x + s[0], y = p.y + s[1];
      if (!isWalkable(m, x, y)) return;
      const mon = makeMonster(MONSTERS[i % MONSTERS.length], x, y);
      mon.rx = x; mon.ry = y;
      state.monsters.push(mon);
    });

    m.items.push({ x: p.x - 1, y: p.y + 2, type: 'gold', amount: 40 });
    m.items.push({ x: p.x + 3, y: p.y - 1, type: 'potion' });
    refreshFov();
  });
  await page.waitForTimeout(900);

  /* 사람이 캔버스의 어디에 그려졌는가.
     눈대중으로 background-position 을 적었더니 빈 버이 앞에 앉았다 —
     카메라가 지도 가장자리에서 묶이므로 사람이 항상 한가운데인 것도 아니다.
     render.js 의 카메라 식을 그대로 풀어 자리를 받아 온다. */
  const at = await page.evaluate(() => {
    const p = state.player, m = state.map;
    const cx = Math.min(Math.max(p.rx - CFG.VIEW_W / 2 + 0.5, 0), Math.max(0, m.w - CFG.VIEW_W));
    const cy = Math.min(Math.max(p.ry - CFG.VIEW_H / 2 + 0.5, 0), Math.max(0, m.h - CFG.VIEW_H));
    const cv = document.getElementById('view');
    return { fx: (p.rx - cx + 0.5) / CFG.VIEW_W, fy: (p.ry - cy + 0.5) / CFG.VIEW_H,
             w: cv.width, h: cv.height };
  });

  const rawPath = path.join(ROOT, '_feature-raw.png');
  await page.locator('#view').screenshot({ path: rawPath });
  await page.close();

  /* ---------- 2. 이름을 얹어 1024x500 으로 짓는다 ---------- */
  const raw = 'data:image/png;base64,' + fs.readFileSync(rawPath).toString('base64');

  /* 그림을 이만큼 당긴다. 그대로 깔면 타일이 작아 무슨 게임인지
     안 보이고, 너무 당기면 방 하나만 보여 던전으로 안 읽힌다. */
  const W = 1024, H = 500, ZOOM = 1.95;
  const imgW = Math.round(W * ZOOM);
  const imgH = Math.round(imgW * (at.h / at.w));
  /* 사람을 오른쪽 68% · 세로 50% 자리에 놓는다 — 왼쪽은 글자 자리다 */
  const left = Math.round(W * 0.68 - at.fx * imgW);
  const top  = Math.round(H * 0.50 - at.fy * imgH);

  const card = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await card.setContent(`
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600&family=Gowun+Batang:wght@400;700&family=IBM+Plex+Sans+KR:wght@300;400&display=swap">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: 1024px; height: 500px; overflow: hidden; background: #0B0908; }
  .wrap { position: relative; width: 1024px; height: 500px; }
  /* 판 화면이 바탕. 그대로 깔면 타일이 작아 무슨 게임인지 안 보이므로 당겨서
     사람과 몬스터가 알아볼 크기가 되게 하고, 글자가 앉는 왼쪽을 피해 민다.
     (2배로 찍었으므로 당겨도 안 뭉개진다) */
  .shot {
    position: absolute;
    left: ${left}px; top: ${top}px; width: ${imgW}px; height: ${imgH}px;
    image-rendering: pixelated;
  }
  .veil {
    position: absolute; inset: 0;
    background:
      linear-gradient(90deg, rgba(8,6,5,.95) 0%, rgba(8,6,5,.88) 36%, rgba(8,6,5,.14) 64%, rgba(8,6,5,.5) 100%),
      radial-gradient(ellipse at 24% 50%, rgba(214,122,45,.22) 0%, rgba(0,0,0,0) 62%);
  }
  /* 글자는 가장자리에서 넉넉히 띄운다 — 자리에 따라 좌우가 잘린다 */
  .txt { position: absolute; left: 78px; top: 50%; transform: translateY(-50%); width: 480px; }
  h1 {
    font-family: "Cinzel", serif; font-weight: 600;
    font-size: 82px; letter-spacing: .07em; color: #F0C24A;
    text-shadow: 0 0 44px rgba(240,194,74,.34);
    line-height: 1;
  }
  .kr {
    font-family: "Gowun Batang", serif; font-weight: 700;
    font-size: 36px; color: #E8DCC8; margin-top: 10px; letter-spacing: .16em;
  }
  .rule { width: 88px; height: 2px; background: #6B4A24; margin: 22px 0 18px; }
  .sub {
    font-family: "IBM Plex Sans KR", sans-serif; font-weight: 300;
    font-size: 20px; line-height: 1.7; color: #C6B69C;
  }
  .sub b { font-weight: 400; color: #E8DCC8; }
  .vig { position: absolute; inset: 0; box-shadow: inset 0 0 120px 36px rgba(0,0,0,.7); }
</style>
<div class="wrap">
  <img class="shot" src="${raw}">
  <div class="veil"></div>
  <div class="vig"></div>
  <div class="txt">
    <h1>Cinder</h1>
    <div class="kr">잿불</div>
    <div class="rule"></div>
    <div class="sub">불씨 하나를 들고 열다섯 층을 오른다.<br><b>탑은 매일 새로 선다.</b></div>
  </div>
</div>`);
  await card.waitForTimeout(1500);            // 웹폰트 내려받을 시간
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  await card.screenshot({ path: OUT });
  await card.close();

  await b.close();
  srv.close();
  fs.unlinkSync(rawPath);

  const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
  console.log(`${path.relative(ROOT, OUT).replace(/\\/g, '/')} — 1024x500, ${kb} KB`);
  console.log('Play Console 「그래픽 이미지」 칸에 그대로 올린다.');
})();
