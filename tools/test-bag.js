/* =========================================================
   test-bag.js — 가방이 실제로 물건을 나르는가

     node tools/test-bag.js

   가방을 넣으면서 **비교창을 없앴다.** 둘 다 두면 결정이 두 번이 되기
   때문인데(주울 때 한 번, 가방에서 또 한 번), 그러면서 「줍는다」의 뜻이
   통째로 바뀌었다 — 예전에는 즉시 정하는 일이었고 지금은 쌓아 두는 일이다.
   그 갈아탄 자리가 성한지를 여기서 잰다.
   ========================================================= */
const { chromium } = require('playwright');
const http = require('http'), path = require('path'), fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 8155);
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
               '.css':'text/css; charset=utf-8', '.png':'image/png', '.json':'application/json' };
let fails = 0;
const check = (ok, m) => { console.log((ok ? '  O ' : '  X ') + m); if (!ok) fails++; };

(async () => {
  const srv = http.createServer((q, r) => {
    const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/, ''));
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(r);
  });
  await new Promise(r => srv.listen(PORT, '127.0.0.1', r));
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 405, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${PORT}/index.html`);
  await p.waitForTimeout(500);
  await p.click('#btn-start');
  await p.waitForFunction(() => state.running === true, null, { timeout: 10000 });

  console.log('\n[ 밟으면 가방에 들어간다 ]');
  const pick = await p.evaluate(() => {
    UI.closeIntro();
    state.bag = [];
    const pl = state.player;
    state.map.items.push({ x: pl.x, y: pl.y, type: 'gear', gear: makeGear(GEAR.find(g => g.name === '뿔 투구')) });
    const before = state.bag.length;
    onPlayerEnter(pl.x, pl.y);
    return { before, after: state.bag.length,
             /* 발밑만 센다 — 층에는 원래 깔린 장비가 따로 있어서
                지도 전체를 세면 그것들까지 함께 잡힌다 */
             floor: state.map.items.filter(i => i.type === 'gear' && i.x === pl.x && i.y === pl.y).length,
             log: [...document.querySelectorAll('#log div')].map(d => d.textContent).pop() };
  });
  check(pick.after === pick.before + 1, `가방에 하나 들어간다 (${pick.before} → ${pick.after})`);
  check(pick.floor === 0, '바닥에서는 사라진다');
  check(/가방에 넣었/.test(pick.log || ''), `로그가 말한다 — 「${pick.log}」`);

  console.log('\n[ 가방이 차면 안 줍는다 ]');
  const full = await p.evaluate(() => {
    state.bag = [];
    for (let i = 0; i < BAG_MAX; i++) state.bag.push(makeGear(GEAR.find(g => g.name === '부적')));
    const pl = state.player;
    state.map.items.push({ x: pl.x, y: pl.y, type: 'gear', gear: makeGear(GEAR.find(g => g.name === '대검')) });
    onPlayerEnter(pl.x, pl.y);
    return { bag: state.bag.length,
             floor: state.map.items.filter(i => i.type === 'gear' && i.x === pl.x && i.y === pl.y).length,
             log: [...document.querySelectorAll('#log div')].map(d => d.textContent).pop() };
  });
  check(full.bag === 12, `열두 칸을 안 넘는다 (${full.bag})`);
  check(full.floor === 1, '바닥에 그대로 남는다 — 없애지 않는다');
  check(/가득/.test(full.log || ''), `왜 못 줍는지 말한다 — 「${full.log}」`);

  console.log('\n[ 끼면 자리가 바뀌고 벗은 것은 가방으로 ]');
  const eq = await p.evaluate(() => {
    state.bag = [makeGear(GEAR.find(g => g.name === '뿔 투구'))];
    const pl = state.player;
    pl.gear.helm = makeGear(GEAR.find(g => g.name === '가죽 두건'));
    recalcStats(pl);
    const beforeDef = pl.stats.def;
    const r = bagEquip(0);
    return { slot: r && r.slot, worn: pl.gear.helm.name, oldInBag: state.bag[0] && state.bag[0].name,
             bag: state.bag.length, beforeDef, afterDef: pl.stats.def };
  });
  check(eq.slot === 'helm' && eq.worn === '뿔 투구', `제 자리에 낀다 (${eq.slot}: ${eq.worn})`);
  check(eq.oldInBag === '가죽 두건' && eq.bag === 1, '끼고 있던 것은 버려지지 않고 가방으로');
  check(eq.afterDef > eq.beforeDef, `스탯이 바로 반영된다 (방어 ${eq.beforeDef} → ${eq.afterDef})`);

  console.log('\n[ 가방이 꽉 차 있어도 바꿔 낄 수 있다 ]');
  const swap = await p.evaluate(() => {
    const pl = state.player;
    pl.gear.helm = makeGear(GEAR.find(g => g.name === '가죽 두건'));
    state.bag = [];
    state.bag.push(makeGear(GEAR.find(g => g.name === '뿔 투구')));
    for (let i = 1; i < BAG_MAX; i++) state.bag.push(makeGear(GEAR.find(g => g.name === '부적')));
    const r = bagEquip(0);
    return { ok: !!r, bag: state.bag.length, worn: pl.gear.helm.name,
             swapped: state.bag[0] && state.bag[0].name };
  });
  check(swap.ok && swap.worn === '뿔 투구', '꽉 찬 가방에서도 낄 수 있다');
  check(swap.bag === 12 && swap.swapped === '가죽 두건',
        `빼낸 자리에 벗은 것이 들어간다 (${swap.bag}칸, 그 자리에 ${swap.swapped})`);

  console.log('\n[ 벗기 · 버리기 ]');
  const off = await p.evaluate(() => {
    state.bag = [];
    const pl = state.player;
    pl.gear.helm = makeGear(GEAR.find(g => g.name === '뿔 투구')); recalcStats(pl);
    const g = bagUnequip('helm');
    const afterUnequip = { worn: pl.gear.helm, bag: state.bag.length };
    const floorBefore = state.map.items.filter(i => i.type === 'gear').length;
    bagDrop(0);
    return { g: g && g.name, afterUnequip, bag: state.bag.length,
             floor: state.map.items.filter(i => i.type === 'gear').length - floorBefore };
  });
  check(off.g === '뿔 투구' && off.afterUnequip.worn === null, '벗으면 몸에서 빠진다');
  check(off.afterUnequip.bag === 1, '벗은 것은 가방으로');
  check(off.bag === 0 && off.floor === 1, '버리면 발밑에 놓인다 — 없애지 않는다');

  console.log('\n[ 이어하기에 실린다 ]');
  const kept = await p.evaluate(() => {
    state.bag = [makeGear(GEAR.find(g => g.name === '재의 도끼')),
                 makeGear(GEAR.find(g => g.name === '수정 목걸이'))];
    state.resumable = true;
    saveRun();
    const d = savedRun();
    state.bag = [];
    loadRun(d, {});
    return { v: d && d.v, n: state.bag.length, first: state.bag[0] && state.bag[0].name };
  });
  check(kept.v === 3, `저장 판이 v3 이다 (${kept.v})`);
  check(kept.n === 2 && kept.first === '재의 도끼', `가방이 그대로 돌아온다 (${kept.n}개, 첫 칸 ${kept.first})`);

  console.log('\n[ 판을 새로 시작하면 가방은 빈다 ]');
  const fresh = await p.evaluate(() => {
    state.bag = [makeGear(GEAR.find(g => g.name === '대검'))];
    startRun();
    return state.bag.length;
  });
  check(fresh === 0, `가방은 판을 넘어 남지 않는다 (${fresh}개)`);

  await b.close(); srv.close();
  console.log('\n에러:', errs.length ? errs.join(' | ') : '없음');
  if (errs.length) fails++;
  console.log(fails ? `\n실패 ${fails}건` : '\n전부 통과');
  process.exit(fails ? 1 : 0);
})();
