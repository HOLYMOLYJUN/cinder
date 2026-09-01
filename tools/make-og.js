/* =========================================================
   make-og.js — 카톡·트위터에 뜨는 미리보기 그림을 만든다

     python -m http.server 8123      (저장소 뿌리에서)
     node tools/make-og.js           → og.png (1200x630)

   그림을 새로 그리지 않는다. **실제 판을 찍는다.**
   미리보기는 「이게 무슨 게임인지」를 1초 안에 알리는 자리라,
   손으로 그린 것보다 진짜 화면 한 장이 언제나 낫다.

   1200x630 은 오픈그래프 표준 비율(1.91:1)이다. 카톡은 800x400 이상이면
   큰 그림으로 띄우므로 이 크기면 카톡·트위터·디스코드가 모두 같은 것을 쓴다.
   ========================================================= */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const GAME = process.env.GAME || 'http://127.0.0.1:8123/index.html';
const OUT = path.resolve(__dirname, '..', 'og.png');

(async () => {
  const b = await chromium.launch();

  /* ---------- 1. 판을 하나 세워서 캔버스만 찍는다 ---------- */
  const page = await b.newPage({ viewport: { width: 1280, height: 760 }, deviceScaleFactor: 2 });
  page.on('pageerror', e => console.log('  ! ' + e.message));
  await page.goto(GAME);
  await page.waitForTimeout(800);
  await page.click('#btn-start');
  await page.waitForFunction(() => state.running === true, null, { timeout: 8000 });

  /* 보여줄 만한 장면을 고른다 — 어두운 복도에 혼자 서 있는 것보다
     불빛과 사람과 몬스터가 한 화면에 있는 쪽이 게임을 설명한다. */
  await page.evaluate(() => {
    UI.closeIntro();
    enterFloor(4);
    UI.closeIntro();
    state.running = true;
    state.ember = 1;                       // 불씨를 키워서 멀리까지 보이게
    applyFov(); refreshFov();

    const m = state.map, p = state.player;
    // 사람을 방 한가운데로
    const room = m.rooms.reduce((a, r) => (r.w * r.h > a.w * a.h ? r : a), m.rooms[0]);
    p.x = Math.floor(room.x + room.w / 2); p.y = Math.floor(room.y + room.h / 2);
    p.rx = p.x; p.ry = p.y;

    // 몬스터 몇을 눈앞에 세운다
    state.monsters.length = 0;
    const spots = [[2, 0], [-3, 1], [1, -2], [4, 2]];
    spots.forEach((s, i) => {
      const x = p.x + s[0], y = p.y + s[1];
      if (!isWalkable(m, x, y)) return;
      const mon = makeMonster(MONSTERS[i % MONSTERS.length], x, y);
      mon.rx = x; mon.ry = y;
      state.monsters.push(mon);
    });

    // 바닥에 물건 몇 개 — 로그라이크라는 것이 보이게
    m.items.push({ x: p.x - 1, y: p.y + 2, type: 'gold', amount: 40 });
    m.items.push({ x: p.x + 3, y: p.y - 1, type: 'potion' });

    refreshFov();
  });
  await page.waitForTimeout(900);            // 애니메이션 한 바퀴

  const shotPath = path.resolve(__dirname, '..', '_og-raw.png');
  // HUD 가 아니라 판 자체를 찍는다 — 미리보기에 체력바까지 들어가면 어수선하다
  await page.locator('#view').screenshot({ path: shotPath });
  await page.close();

  /* ---------- 2. 그 위에 이름을 얹어 1200x630 으로 짓는다 ---------- */
  const raw = 'data:image/png;base64,' + fs.readFileSync(shotPath).toString('base64');

  const card = await b.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await card.setContent(`
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600&family=Gowun+Batang:wght@400;700&family=IBM+Plex+Sans+KR:wght@300;400&display=swap">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: 1200px; height: 630px; overflow: hidden; background: #0B0908; }
  .wrap { position: relative; width: 1200px; height: 630px; }
  /* 판 화면이 바탕 — 살짝 어둡게 깔아 글자가 읽히게 한다.
     그대로 깔면 타일이 너무 작아 무슨 게임인지 안 보인다. 배로 당겨서
     사람과 몬스터가 알아볼 크기가 되게 하고, 글자가 앉는 왼쪽을 피해
     오른쪽으로 밀어 둔다. (2배 해상도로 찍으므로 당겨도 안 뭉개진다) */
  .shot {
    position: absolute; inset: 0;
    background: url('${raw}') 63% 46% / 210% no-repeat;
    image-rendering: pixelated;
  }
  .veil {
    position: absolute; inset: 0;
    background:
      linear-gradient(90deg, rgba(8,6,5,.94) 0%, rgba(8,6,5,.86) 34%, rgba(8,6,5,.15) 62%, rgba(8,6,5,.55) 100%),
      radial-gradient(ellipse at 22% 50%, rgba(214,122,45,.20) 0%, rgba(0,0,0,0) 62%);
  }
  .txt {
    position: absolute; left: 74px; top: 50%; transform: translateY(-50%);
    width: 560px;
  }
  h1 {
    font-family: "Cinzel", serif; font-weight: 600;
    font-size: 92px; letter-spacing: .07em; color: #F0C24A;
    text-shadow: 0 0 44px rgba(240,194,74,.34);
    line-height: 1;
  }
  .kr {
    font-family: "Gowun Batang", serif; font-weight: 700;
    font-size: 40px; color: #E8DCC8; margin-top: 12px; letter-spacing: .16em;
  }
  .rule { width: 96px; height: 2px; background: #6B4A24; margin: 26px 0 22px; }
  .sub {
    font-family: "IBM Plex Sans KR", sans-serif; font-weight: 300;
    font-size: 22px; line-height: 1.72; color: #C6B69C;
  }
  .sub b { font-weight: 400; color: #E8DCC8; }
  .host {
    position: absolute; left: 74px; bottom: 52px;
    font-family: "IBM Plex Sans KR", sans-serif; font-weight: 400;
    font-size: 19px; color: #F0C24A; opacity: .82; letter-spacing: .04em;
  }
  /* 가장자리를 눌러 준다 — 카톡이 모서리를 둥글게 자른다 */
  .vig { position: absolute; inset: 0; box-shadow: inset 0 0 130px 40px rgba(0,0,0,.72); }
</style>
<div class="wrap">
  <div class="shot"></div>
  <div class="veil"></div>
  <div class="vig"></div>
  <div class="txt">
    <h1>Cinder</h1>
    <div class="kr">잿불</div>
    <div class="rule"></div>
    <div class="sub">불씨 하나 들고 열다섯 층을 오른다.<br><b>설치 없이 브라우저에서 바로.</b></div>
  </div>
  <div class="host">cindertower.com</div>
</div>`);
  await card.waitForTimeout(1400);            // 웹폰트 내려받을 시간
  await card.screenshot({ path: OUT });
  await card.close();

  fs.unlinkSync(shotPath);
  await b.close();

  const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
  console.log(`og.png 생성 — 1200x630, ${kb} KB`);
})();
