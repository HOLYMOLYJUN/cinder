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

  /* ---------- 확성기 ---------- */
  console.log('\n[ 확성기를 닫아도 한 마디는 남는다 ]');
  {
    const p = await b.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2,
                                isMobile: true, hasTouch: true });
    p.on('pageerror', e => errs.push(e.message));
    await p.goto(`http://127.0.0.1:${PORT}/index.html`);
    await p.waitForTimeout(400);
    await p.click('#btn-start');
    await p.waitForFunction(() => state.running === true, null, { timeout: 10000 });
    const r = await p.evaluate(() => {
      UI.closeIntro();
      /* 서버 없이 화면만 세운다 — 여기서 재는 것은 「닫았을 때 무엇이 남는가」라
         소켓이 붙었는지는 상관이 없다. */
      Chat.ready = true; Chat.open = false;
      Chat.el = Chat.el || {};
      Chat.el.peek = document.getElementById('chat-peek');
      Chat.peek('상주니', '물약 최대5개로 바뀐거 봤어?');
      const peek = document.getElementById('chat-peek');
      const pad = document.getElementById('touch-row');
      const log = document.getElementById('log');
      const pb = peek.getBoundingClientRect();
      const tb = pad.getBoundingClientRect();
      const lb = log.getBoundingClientRect();
      return {
        shown: !peek.classList.contains('hidden') && pb.height > 0,
        name: peek.querySelector('b') ? peek.querySelector('b').textContent : '',
        aboveLog: pb.bottom <= lb.top + 2,
        padVisible: tb.height > 0 && tb.bottom <= window.innerHeight + 1,
        oneLine: pb.height < 34,
      };
    });
    check(r.shown, '확성기를 닫아 두면 마지막 한 마디가 뜬다');
    check(r.name === '상주니', `누가 말했는지 함께 뜬다 (${r.name})`);
    check(r.aboveLog, '로그 바로 위에 붙는다');
    check(r.oneLine, '한 줄을 넘지 않는다');
    check(r.padVisible, '조작 버튼은 그대로 보인다 — 오르면서 볼 수 있다');

    // 판을 열면 밖의 한 줄은 거둔다 — 같은 말이 두 군데 있으면 눈이 두 번 읽는다
    const after = await p.evaluate(() => {
      Chat.el.panel = document.getElementById('chat');
      Chat.el.tab = document.getElementById('chat-tab');
      Chat.el.badge = document.getElementById('chat-badge');
      Chat.el.room = document.getElementById('chat-room');
      Chat.el.text = document.getElementById('chat-text');
      Chat.show(true);
      return document.getElementById('chat-peek').classList.contains('hidden');
    });
    check(after, '판을 열면 그 한 줄은 거둔다');
    await p.close();
  }

  /* 키보드가 올라오면 줄 칸이 줄어든다. 브라우저는 그때 scrollTop 을 그대로
     두므로, 그냥 두면 **방금 온 말이 아니라 옛날 대화가 보인다.** 답하려고
     키보드를 올린 사람에게 그건 고장이다. */
  console.log('\n[ 키보드가 올라와도 맨 밑 대화가 보인다 ]');
  {
    const p = await b.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2,
                                isMobile: true, hasTouch: true });
    p.on('pageerror', e => errs.push(e.message));
    await p.goto(`http://127.0.0.1:${PORT}/index.html`);
    await p.waitForTimeout(400);
    await p.click('#btn-start');
    await p.waitForFunction(() => state.running === true, null, { timeout: 10000 });

    const seed = async (page) => page.evaluate(async () => {
      UI.closeIntro();
      document.getElementById('chat').classList.remove('hidden');
      document.getElementById('chat-join').classList.add('hidden');
      document.getElementById('chat-live').classList.remove('hidden');
      Chat.ready = true; Chat.open = true; Chat.stick = true;
      Chat.el = Chat.el || {};
      Chat.el.lines = document.getElementById('chat-lines');
      Chat.keyboard.bind();
      const lines = Chat.el.lines;
      lines.innerHTML = '';
      for (let i = 1; i <= 20; i++) {
        const d = document.createElement('div');
        d.className = 'chat-line';
        d.innerHTML = '<b>상주니</b><span>줄 ' + i + '</span>';
        lines.appendChild(d);
      }
      Chat.scroll();
      await new Promise(r => requestAnimationFrame(r));
    });
    // 키보드가 올라온 것처럼 칸을 줄인다 (실제 아이폰 한글 키보드 대략치)
    const squeeze = async (page) => page.evaluate(async () => {
      const root = document.documentElement, KB = 336;
      root.style.setProperty('--kb', KB + 'px');
      root.style.setProperty('--vvh', (window.innerHeight - KB) + 'px');
      root.classList.add('kb-up');
      await new Promise(r => setTimeout(r, 140));
      const lines = Chat.el.lines, lb = lines.getBoundingClientRect();
      const vis = [...lines.children].filter(c => {
        const q = c.getBoundingClientRect();
        return q.top >= lb.top - 1 && q.bottom <= lb.bottom + 1;
      });
      return { last: vis.length ? vis[vis.length - 1].textContent : null,
               atBottom: Chat.atBottom() };
    });

    await seed(p);
    const shrunk = await squeeze(p);
    check(/줄 20$/.test(shrunk.last || ''), `줄어들어도 맨 밑 줄이 보인다 (${shrunk.last})`);
    check(shrunk.atBottom, '바닥에 붙어 있다');

    /* 다만 위로 올려 읽는 중이면 건드리지 않는다 —
       읽던 자리를 뺏는 것은 못 보는 것보다 나쁘다. */
    await p.reload();
    await p.waitForTimeout(400);
    await p.click('#btn-start');
    await p.waitForFunction(() => state.running === true, null, { timeout: 10000 });
    await seed(p);
    const kept = await p.evaluate(async () => {
      const lines = Chat.el.lines;
      lines.scrollTop = 0;                       // 사람이 맨 위로 올려 읽는 중
      lines.dispatchEvent(new Event('scroll'));
      await new Promise(r => setTimeout(r, 40));
      const before = lines.scrollTop;
      const root = document.documentElement, KB = 336;
      root.style.setProperty('--kb', KB + 'px');
      root.style.setProperty('--vvh', (window.innerHeight - KB) + 'px');
      root.classList.add('kb-up');
      await new Promise(r => setTimeout(r, 140));
      return { stick: Chat.stick, before, after: lines.scrollTop };
    });
    check(kept.stick === false, '위로 올려 읽는 중이면 붙이지 않는다');
    check(kept.after === kept.before, `읽던 자리를 그대로 둔다 (${kept.before} → ${kept.after})`);
    await p.close();
  }

  /* 바닥에 붙이는 것을 넣었더니 이번엔 **한 글자마다 화면이 번쩍였다.**
     iOS 는 예측 변환 막대가 떴다 사라질 때마다 보이는 창 높이를 한두 픽셀씩
     흔드는데, 그 값을 그대로 쓰면 #app 높이가 매번 바뀌어 캔버스가 다시
     가운데를 잡는다. 픽셀 몇 개짜리 떨림은 무시해야 한다. */
  console.log('\n[ 글자를 쳐도 화면이 흔들리지 않는다 ]');
  {
    const p = await b.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2,
                                isMobile: true, hasTouch: true });
    p.on('pageerror', e => errs.push(e.message));
    await p.goto(`http://127.0.0.1:${PORT}/index.html`);
    await p.waitForTimeout(400);
    await p.click('#btn-start');
    await p.waitForFunction(() => state.running === true, null, { timeout: 10000 });

    const r = await p.evaluate(async () => {
      UI.closeIntro();
      document.getElementById('chat').classList.remove('hidden');
      document.getElementById('chat-join').classList.add('hidden');
      document.getElementById('chat-live').classList.remove('hidden');
      Chat.ready = true; Chat.open = true; Chat.stick = true;
      Chat.el = Chat.el || {};
      Chat.el.lines = document.getElementById('chat-lines');

      /* visualViewport 를 갈아 끼운다 — 진짜 키보드는 검사에서 못 띄우므로
         「한 글자마다 높이가 흔들리는」 그 상황만 그대로 만든다.

         scrollY 를 0 이 아닌 값으로 못 박는 것이 중요하다. 실제 기기에서는
         키보드가 떠 있는 동안 화면이 밀려 있어 0 이 아닌데, 검사에서 0 으로
         두었더니 「scrollY 가 0 이면 아무 일도 안 한다」에 기대어 매 이벤트마다
         화면을 되돌리는 코드가 통과해 버렸다. 그게 번쩍임으로 돌아왔다. */
      let H = 852 - 336;
      const on = [];
      window.visualViewport = {
        get height() { return H; }, offsetTop: 0,
        addEventListener: (t, f) => on.push(f),
      };
      Object.defineProperty(window, 'scrollY', { get: () => 40, configurable: true });
      window.__scrolls = 0;
      window.scrollTo = () => { window.__scrolls++; };
      Chat.keyboard.bind();

      const lines = Chat.el.lines;
      lines.innerHTML = '';
      for (let i = 1; i <= 20; i++) {
        const d = document.createElement('div');
        d.className = 'chat-line';
        d.innerHTML = '<b>상주니</b><span>줄 ' + i + '</span>';
        lines.appendChild(d);
      }
      Chat.scroll();
      await new Promise(r => setTimeout(r, 80));

      const app = document.getElementById('app');
      const canvas = document.getElementById('view');
      const snap = () => ({
        app: Math.round(app.getBoundingClientRect().height),
        canvasTop: Math.round(canvas.getBoundingClientRect().top),
        scrollTop: lines.scrollTop,
      });
      const base = snap();

      let moved = 0;
      for (let i = 0; i < 12; i++) {
        H = (852 - 336) + ((i % 3) - 1) * 2;      // -2, 0, +2 를 오간다
        on.forEach(f => f());
        await new Promise(r => setTimeout(r, 30));
        const s = snap();
        if (s.app !== base.app || s.canvasTop !== base.canvasTop ||
            s.scrollTop !== base.scrollTop) moved++;
      }

      // 진짜로 내려가는 것은 여전히 잡혀야 한다 — 문턱이 사건까지 삼키면 안 된다
      H = 852; on.forEach(f => f());
      await new Promise(r => setTimeout(r, 60));

      return { moved, base, scrolls: window.__scrolls,
               downApp: Math.round(app.getBoundingClientRect().height),
               up: document.documentElement.classList.contains('kb-up') };
    });
    check(r.moved === 0, `한두 픽셀 떨림에는 아무것도 안 움직인다 (12번 중 ${r.moved}번)`);
    // 화면 되돌리기는 오르내리는 순간에만. 떨림마다 하면 그것이 곧 번쩍임이다.
    check(r.scrolls <= 2, `화면을 매번 되돌리지 않는다 (12번 떨리는 동안 ${r.scrolls}번)`);
    check(r.downApp > r.base.app, `키보드가 내려가는 것은 그대로 잡는다 (${r.base.app} → ${r.downApp})`);
    await p.close();
  }

  /* 키보드 높이를 잘못 재면 판이 키보드 밑에 앉는다. 그러면 브라우저가
     입력칸을 보이려고 화면을 밀어 올리고, 로그와 판 사이에 큰 여백이 생긴다.

     처음에 vv.offsetTop 까지 뺐던 것이 그 원인이었다 — offsetTop 은
     「보이는 창이 어디에 놓였나」이지 키보드가 아니다. 밀려 올라간 만큼
     키보드가 작게 잡히고, 그래서 판을 조금밖에 안 올린다. */
  console.log('\n[ 화면이 밀려 올라가도 판은 키보드 위에 앉는다 ]');
  {
    const p = await b.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2,
                                isMobile: true, hasTouch: true });
    p.on('pageerror', e => errs.push(e.message));
    await p.goto(`http://127.0.0.1:${PORT}/index.html`);
    await p.waitForTimeout(400);
    await p.click('#btn-start');
    await p.waitForFunction(() => state.running === true, null, { timeout: 10000 });

    const r = await p.evaluate(async () => {
      UI.closeIntro();
      document.getElementById('chat').classList.remove('hidden');
      document.getElementById('chat-join').classList.add('hidden');
      document.getElementById('chat-live').classList.remove('hidden');
      Chat.ready = true; Chat.open = true;
      Chat.el = Chat.el || {};
      Chat.el.lines = document.getElementById('chat-lines');
      Chat.el.panel = document.getElementById('chat');

      let H = 852, T = 0;
      const on = [];
      window.visualViewport = {
        get height() { return H; }, get offsetTop() { return T; },
        addEventListener: (t, f) => on.push(f),
      };
      Chat.keyboard.bind();

      const kbTop = 852 - 336;                 // 키보드 윗선
      const shot = async (h, t) => {
        H = h; T = t;
        on.forEach(f => f());
        await new Promise(r => setTimeout(r, 80));
        return Math.round(document.getElementById('chat').getBoundingClientRect().bottom);
      };
      return {
        kbTop,
        plain: await shot(516, 0),             // 키보드만 올라옴
        pushed: await shot(516, 316),          // iOS 가 화면을 밀어 올린 상태
        down: await shot(852, 0),              // 내려감
      };
    });
    check(r.plain === r.kbTop, `판이 키보드 위에 앉는다 (아래끝 ${r.plain} = ${r.kbTop})`);
    check(r.pushed === r.kbTop,
          `화면이 밀려 올라가도 같은 자리다 (아래끝 ${r.pushed} = ${r.kbTop})`);
    check(r.down === 852, `내려가면 바닥으로 돌아온다 (${r.down})`);
    await p.close();
  }

  await b.close();
  srv.close();
  console.log('\n에러:', errs.length ? errs.join(' | ') : '없음');
  if (errs.length) fails++;
  console.log(fails ? `\n실패 ${fails}건` : '\n전부 통과');
})();
