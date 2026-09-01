/* =========================================================
   test-reach.js — 무기 갈래마다 닿는 자리가 다른가

     node tools/test-reach.js

   갈래를 나눠 놓고 검사를 안 두면, 나중에 무기를 하나 더 넣다가
   kind 를 안 적었을 때 그게 조용히 검이 되어 버린다.
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
  await new Promise(r=>srv.listen(8126,'127.0.0.1',r));
  const b=await chromium.launch(); const p=await b.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://127.0.0.1:8126/index.html'); await p.waitForTimeout(600);

  console.log('\n[ 검은 세 칸을 쓸어낸다 ]');
  const sweep=await p.evaluate(()=>{
    chooseHero('knight'); startRun(); UI.closeIntro();
    const s=state, pl=s.player, m=s.map;
    const room=m.rooms.reduce((a,r)=>(r.w*r.h>a.w*a.h?r:a),m.rooms[0]);
    pl.x=Math.floor(room.x+room.w/2); pl.y=Math.floor(room.y+room.h/2);
    pl.gear.weapon=makeGear(GEAR.find(g=>g.name==='짧은 검')); recalcStats(pl);
    s.monsters.length=0;
    const put=(dx,dy)=>{const x=pl.x+dx,y=pl.y+dy; if(!isWalkable(m,x,y))return null;
      const mo=makeMonster(MONSTERS[0],x,y); mo.hp=mo.maxHp=99; s.monsters.push(mo); return mo;};
    const front=put(1,0), up=put(1,-1), down=put(1,1), behind=put(-1,0);
    const hp0=[front,up,down,behind].map(x=>x&&x.hp);
    meleeSwing(DIRS.right);
    return {before:hp0, after:[front,up,down,behind].map(x=>x&&x.hp)};
  });
  const [f0,u0,d0,b0]=sweep.before, [f1,u1,d1,b1]=sweep.after;
  check(f1<f0, `정면이 맞는다 (${f0}→${f1})`);
  check(u1<u0 && d1<d0, `대각선 둘도 함께 쓸린다 (${u0}→${u1}, ${d0}→${d1})`);
  check((f0-f1) > (u0-u1), `대각선은 얕게 든다 (정면 ${f0-f1} vs 대각선 ${u0-u1})`);
  check(b1===b0, `뒤는 안 맞는다 (${b0}→${b1})`);

  console.log('\n[ 도끼는 앞 한 칸만 ]');
  const axe=await p.evaluate(()=>{
    const s=state, pl=s.player;
    pl.gear.weapon=makeGear(GEAR.find(g=>g.name==='손도끼')); recalcStats(pl);
    s.monsters.forEach(m=>{m.hp=m.maxHp=99; m.alive=true;});
    const [front,up]=s.monsters;
    const b=[front.hp,up.hp]; meleeSwing(DIRS.right);
    return {b, a:[front.hp,up.hp]};
  });
  check(axe.a[0]<axe.b[0] && axe.a[1]===axe.b[1], `정면만 맞는다 (앞 ${axe.b[0]}→${axe.a[0]}, 위 ${axe.b[1]}→${axe.a[1]})`);

  console.log('\n[ 창은 두 칸 밖에서 찌른다 ]');
  const spear=await p.evaluate(()=>{
    const s=state, pl=s.player, m=s.map;
    pl.gear.weapon=makeGear(GEAR.find(g=>g.name==='긴 창')); recalcStats(pl);
    s.monsters.length=0;
    const x=pl.x+2, y=pl.y;
    if(!isWalkable(m,x,y)) return {skip:true};
    const far=makeMonster(MONSTERS[0],x,y); far.hp=far.maxHp=99; s.monsters.push(far);
    const reachable=!!meleeReachTarget(DIRS.right);
    const before=far.hp;
    const px=pl.x;
    // 입력 경로 그대로 — 다만 playerAction 은 차례를 기다리는 중일 때만 듣는다
    s.awaitingInput=true; s.running=true;
    playerAction('right','move');           // 걷는 대신 찔러야 한다
    return {reachable, before, after:far.hp, moved:pl.x!==px};
  });
  check(!spear.skip && spear.reachable, '두 칸 밖 적을 겨눌 수 있다');
  check(spear.after<spear.before, `걷는 대신 찌른다 (${spear.before}→${spear.after})`);
  check(!spear.moved, '앞으로 걸어 들어가지 않는다');

  console.log('\n[ 단검은 앞 한 칸 + 독 ]');
  const dag=await p.evaluate(()=>{
    const s=state, pl=s.player, m=s.map;
    pl.gear.weapon=makeGear(GEAR.find(g=>g.name==='낡은 단검')); recalcStats(pl);
    s.monsters.length=0;
    const put=(dx,dy)=>{const x=pl.x+dx,y=pl.y+dy; if(!isWalkable(m,x,y))return null;
      const mo=makeMonster(MONSTERS[0],x,y); mo.hp=mo.maxHp=99; s.monsters.push(mo); return mo;};
    const front=put(1,0), up=put(1,-1);
    const b=[front.hp, up&&up.hp];
    meleeSwing(DIRS.right);
    return {b, a:[front.hp, up&&up.hp], poison:front.poison, amount:front.poisonAmount};
  });
  check(dag.a[0]<dag.b[0] && dag.a[1]===dag.b[1],
        `정면만 맞는다 (앞 ${dag.b[0]}→${dag.a[0]}, 위 ${dag.b[1]}→${dag.a[1]})`);
  check(dag.poison>0, `독이 묻는다 (${dag.poison}턴, 턴당 ${dag.amount})`);

  console.log('\n에러:', errs.length?errs.join(' | '):'없음');
  console.log(fails?`\n실패 ${fails}건`:'\n전부 통과');
  await b.close(); srv.close();
})();
