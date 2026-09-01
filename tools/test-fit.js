/* =========================================================
   test-fit.js — 고르는 창이 작은 폰에서 잘리지 않는가

     node tools/test-fit.js

   왜 있는가:
     물약 주머니를 붙여 매대가 일곱 줄이 됐을 때 360x640 에서 「떠난다」가
     화면 밖으로 밀려났다. 스크롤은 됐지만 손가락에는 Esc 가 없으므로,
     구르는 줄 모르는 사람에게는 **나가는 길이 없는 창**이었다.

     줄이 늘어나는 창(상점·대장장이·모닥불)은 앞으로도 늘어난다.
     그때마다 눈으로 찾지 않도록 여기서 재 둔다.

   무엇을 재는가:
     1. 창 자체가 화면을 넘지 않는가
     2. 나가는 줄이 스크롤 없이 보이는가  ← 이게 핵심이다
     3. 가려진 줄이 몇인가 (구르는 것은 허용, 다만 세어 둔다)
   ========================================================= */
const { chromium } = require('playwright');
const http = require('http');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 8134);
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.json': 'application/json',
};

/* 재는 화면들. 320x568 은 아직 파는 폰 중 제일 작은 축이고,
   360x640 은 안드로이드 보급기의 바닥이다. 여기서 되면 나머지는 된다. */
const SIZES = [
  [320, 568, 'iPhone SE 1세대'],
  [360, 640, '작은 안드로이드'],
  [375, 667, 'iPhone SE 2/3'],
  [390, 844, 'iPhone 14'],
  [412, 915, 'Pixel'],
];

let fails = 0;
const check = (ok, m) => { console.log((ok ? '  O ' : '  X ') + m); if (!ok) fails++; };

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
  const errs = [];

  /* 매대는 팔 것을 전부 깔아 둔 상태로 잰다 — 장비 셋 + 물약 + 주머니 +
     다시 깔기 + 떠난다. 실제로 제일 긴 매대가 이것이다. */
  console.log('\n[ 떠돌이 상인 ]');
  for (const [w, h, name] of SIZES) {
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2,
                                isMobile: true, hasTouch: true });
    p.on('pageerror', e => errs.push(e.message));
    await p.goto(`http://127.0.0.1:${PORT}/index.html`);
    await p.waitForTimeout(400);
    await p.click('#btn-start');
    await p.waitForFunction(() => state.running === true, null, { timeout: 10000 });
    const r = await p.evaluate(() => {
      enterFloor(3); UI.closeIntro();
      state.gold = 400; state.pouches = 0;
      openShop();
      const inner = document.querySelector('.shop-inner');
      const list = document.querySelector('.shop-list');
      const leave = document.getElementById('shop-close');
      const ib = inner.getBoundingClientRect(), lb = leave.getBoundingClientRect();
      const lr = list.getBoundingClientRect();
      const hidden = [...list.children].filter(el => {
        const q = el.getBoundingClientRect();
        return q.bottom > lr.bottom + 1 || q.top < lr.top - 1;
      }).length;
      return { rows: list.children.length, fits: ib.height <= window.innerHeight + 1,
               leaveVisible: lb.bottom <= ib.bottom + 1 && lb.top >= ib.top - 1, hidden };
    });
    check(r.fits, `${w}x${h} ${name} — 창이 화면 안에 든다`);
    check(r.leaveVisible, `${w}x${h} — 「떠난다」가 구르지 않고 보인다`);
    if (r.hidden) console.log(`      · ${r.rows}줄 중 ${r.hidden}줄은 굴려야 보인다 (허용)`);
    await p.close();
  }

  /* 대장장이는 자리 넷을 다 채운 상태가 제일 길다 — 무기·방어구·장신구 둘 +
     「그만둔다」. 마지막 줄이 곧 나가는 길이라 잘리면 창에 갇힌다. */
  console.log('\n[ 대장장이 — 자리를 다 채운 상태 ]');
  for (const [w, h, name] of SIZES) {
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2,
                                isMobile: true, hasTouch: true });
    p.on('pageerror', e => errs.push(e.message));
    await p.goto(`http://127.0.0.1:${PORT}/index.html`);
    await p.waitForTimeout(400);
    await p.click('#btn-start');
    await p.waitForFunction(() => state.running === true, null, { timeout: 10000 });
    const r = await p.evaluate(() => {
      enterFloor(3); UI.closeIntro();
      state.gold = 400;
      const pl = state.player;
      pl.gear.armor = makeGear(GEAR.find(g => g.name === '사슬 갑옷'));
      pl.gear.trinket = makeGear(GEAR.find(g => g.name === '부적'));
      pl.gear.trinket2 = makeGear(GEAR.find(g => g.name === '가죽 장화'));
      recalcStats(pl);
      openForge();
      const inner = document.querySelector('.camp-inner');
      const list = document.getElementById('camp-choices');
      const rows = [...list.children];
      const leave = rows[rows.length - 1];
      const ib = inner.getBoundingClientRect(), lb = leave.getBoundingClientRect();
      return { rows: rows.length, fits: ib.height <= window.innerHeight + 1,
               leaveVisible: lb.bottom <= ib.bottom + 1 && lb.top >= ib.top - 1,
               text: leave.textContent.slice(0, 6) };
    });
    check(r.rows === 5, `${w}x${h} ${name} — 다섯 줄이 나온다 (${r.rows})`);
    check(r.leaveVisible, `${w}x${h} — 「${r.text.trim()}」가 구르지 않고 보인다`);
    await p.close();
  }

  await b.close();
  srv.close();
  console.log('\n에러:', errs.length ? errs.join(' | ') : '없음');
  if (errs.length) fails++;
  console.log(fails ? `\n실패 ${fails}건` : '\n전부 통과');
})();
