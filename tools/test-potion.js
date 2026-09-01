/* =========================================================
   test-potion.js — 물약 회복량·소지 한도·주머니

     node tools/test-potion.js

   회복량과 한도는 균형의 큰 손잡이라 숫자가 조용히 바뀌면 안 된다.
   주머니는 한도를 낮춘 값으로 상점에 놓은 것이므로 같이 잰다.
   ========================================================= */
const { chromium } = require('playwright');
const http=require('http'),path=require('path'),fs=require('fs');
const ROOT=path.resolve(__dirname,'..');
const M={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png'};
const srv=http.createServer((q,r)=>{const f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/,''));
 if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);r.end();return;}
 r.writeHead(200,{'content-type':M[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(r);});
let fails=0; const check=(ok,m)=>{console.log((ok?'  O ':'  X ')+m); if(!ok)fails++;};
(async()=>{
  await new Promise(r=>srv.listen(8127,'127.0.0.1',r));
  const b=await chromium.launch(); const p=await b.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://127.0.0.1:8127/index.html'); await p.waitForTimeout(600);

  console.log('\n[ 물약 ]');
  const heal=await p.evaluate(()=>{
    chooseHero('knight'); startRun(); UI.closeIntro();
    const pl=state.player; state.running=true; state.awaitingInput=true;
    pl.hp = pl.maxHp - 30; state.potions = 3;
    const before = pl.hp;
    drinkPotion();
    return {before, after: pl.hp, left: state.potions, start: 2};
  });
  check(heal.after - heal.before === 8, `한 병에 8 회복 (${heal.before}→${heal.after})`);

  console.log('\n[ 안식처 상점에 주머니가 나온다 ]');
  const shop=await p.evaluate(()=>{
    state.pouches = 0;
    enterFloor(3); UI.closeIntro();          // 3층은 안식처
    const rows = state.shopStock.map(e => e.kind);
    const pouch = state.shopStock.findIndex(e => e.kind === 'pouch');
    const price = pouch >= 0 ? state.shopStock[pouch].price : null;
    return { rows, pouch, price, isRest: CFG.REST_FLOORS.includes(state.depth) };
  });
  check(shop.isRest, '3층은 안식처다');
  check(shop.pouch >= 0, `매대에 주머니가 있다 (${shop.rows.join(', ')})`);
  check(shop.price === 60, `첫 주머니 값 ${shop.price} G`);

  console.log('\n[ 사면 한도가 는다 ]');
  const buy=await p.evaluate(()=>{
    state.gold = 500; state.potions = 0;
    const before = potionMax();
    buyFromShop(state.shopStock.findIndex(e => e.kind === 'pouch'));
    const after = potionMax();
    // 다 채워 본다
    const pi = state.shopStock.findIndex(e => e.kind === 'potion');
    for (let i = 0; i < 12; i++) buyFromShop(pi);
    return { before, after, pouches: state.pouches, potions: state.potions };
  });
  check(buy.after === buy.before + 2, `한도 ${buy.before} → ${buy.after}`);
  check(buy.potions === 7, `한도까지만 산다 (${buy.potions}개)`);

  console.log('\n[ 상한을 넘겨서는 못 산다 ]');
  const cap=await p.evaluate(()=>{
    state.pouches = POUCH_MAX;
    enterFloor(6); UI.closeIntro();
    const has = state.shopStock.some(e => e.kind === 'pouch');
    return { has, max: potionMax() };
  });
  check(!cap.has, `주머니를 다 사면 매대에 안 나온다 (한도 ${cap.max})`);

  console.log('\n[ 이어하기에 남는다 ]');
  const kept=await p.evaluate(()=>{
    state.pouches = 1; state.resumable = true; saveRun();
    const d = savedRun(); state.pouches = 0; loadRun(d, {});
    return { pouches: state.pouches, max: potionMax() };
  });
  check(kept.pouches === 1, `주머니가 남는다 (한도 ${kept.max})`);

  console.log('\n에러:', errs.length?errs.join(' | '):'없음');
  console.log(fails?`\n실패 ${fails}건`:'\n전부 통과');
  await b.close(); srv.close();
})();
