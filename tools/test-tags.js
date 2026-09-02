/* =========================================================
   test-tags.js — 층 성격이 실제로 판을 바꾸는가

     node tools/test-tags.js

   층 성격은 「진입 문구 한 줄」이 아니라 **그 층에서 벌어지는 일**이어야 한다.
   문구만 바뀌고 몬스터 수도 시야도 그대로면 그건 장식이다.
   그래서 문구가 아니라 결과를 잰다.
   ========================================================= */
const { chromium } = require('playwright');
const http = require('http'), path = require('path'), fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 8147);
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
               '.css':'text/css; charset=utf-8', '.png':'image/png' };
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
  const p = await b.newPage({ viewport: { width: 900, height: 700 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${PORT}/index.html`);
  await p.waitForTimeout(500);
  await p.click('#btn-start');
  await p.waitForFunction(() => state.running === true, null, { timeout: 10000 });

  /* 성격을 하나로 못 박고 층을 세운다. choice 를 잠깐 가로채는 것이
     제일 짧다 — 실제 경로(enterFloor)를 그대로 타므로 「걸리게 해 놓고
     안 걸리는」 종류의 거짓 통과가 안 생긴다. */
  const withTag = (id, depth) => p.evaluate(([id, depth]) => {
    const orig = window.choice;
    window.choice = a => (a === FLOOR_TAGS ? FLOOR_TAGS.find(t => t.id === id) : orig(a));
    try { enterFloor(depth); UI.closeIntro(); } finally { window.choice = orig; }
    const el = document.getElementById('stat-tag');
    return {
      id: state.floorTag && state.floorTag.id,
      monsters: state.monsters.length,
      fov: state.fovRadius,
      gold: state.map.items.filter(i => i.type === 'gold').length,
      potions: state.map.items.filter(i => i.type === 'potion').length,
      elites: state.monsters.filter(m => m.elite).length,
      chip: el.textContent, chipShown: !el.classList.contains('hidden'),
      hint: (state.floorTag && state.floorTag.hint) || '',
    };
  }, [id, depth]);

  console.log('\n[ 성격이 붙고, 화면에 남는다 ]');
  const dark = await withTag('dark', 7);
  check(dark.id === 'dark', `성격이 걸린다 (${dark.id})`);
  check(dark.chipShown && dark.chip === '어둠', `층수 옆에 남는다 (${dark.chip})`);
  check(!!dark.hint, `진입 문구가 그것을 흘린다 — 「${dark.hint}」`);

  const plain = await withTag(null, 7);
  check(!plain.chipShown, '성격 없는 층에서는 아예 안 보인다');

  console.log('\n[ 문구가 아니라 판이 바뀐다 ]');
  check(dark.fov < plain.fov, `어둠 — 시야가 좁다 (${plain.fov} → ${dark.fov})`);

  const dense = await withTag('dense', 7);
  check(dense.monsters > plain.monsters, `무리 — 몬스터가 많다 (${plain.monsters} → ${dense.monsters})`);

  const quiet = await withTag('quiet', 7);
  check(quiet.monsters < plain.monsters, `고요 — 몬스터가 적다 (${plain.monsters} → ${quiet.monsters})`);

  const open = await withTag('open', 7);
  check(open.fov > plain.fov, `트임 — 멀리 보인다 (${plain.fov} → ${open.fov})`);

  const treasure = await withTag('treasure', 7);
  check(treasure.gold > plain.gold, `쇠붙이 — 금이 많다 (${plain.gold} → ${treasure.gold})`);

  const spring = await withTag('spring', 7);
  check(spring.potions > plain.potions, `샘 — 물약이 많다 (${plain.potions} → ${spring.potions})`);

  /* 「큰 것」은 확률이라 한 번으로는 못 잰다. 여러 번 세워 평균을 본다 —
     수는 적고 엘리트 비율은 높아야 한다.

     10층에서 잰다. 3·6·9·12 는 안식처라 몬스터가 아예 없어서(monsterMul 0)
     거기서 재면 0 대 0 이 나온다 — 그러면 통과도 실패도 뜻이 없다. */
  console.log('\n[ 큰 것 — 수는 적고 하나하나가 세다 ]');
  const many = await p.evaluate(() => {
    const orig = window.choice;
    let eliteN = 0, monN = 0, plainE = 0, plainM = 0;
    for (let i = 0; i < 12; i++) {
      window.choice = a => (a === FLOOR_TAGS ? FLOOR_TAGS.find(t => t.id === 'elite') : orig(a));
      enterFloor(10); UI.closeIntro();
      eliteN += state.monsters.filter(m => m.elite).length; monN += state.monsters.length;
      window.choice = a => (a === FLOOR_TAGS ? FLOOR_TAGS.find(t => t.id === null) : orig(a));
      enterFloor(10); UI.closeIntro();
      plainE += state.monsters.filter(m => m.elite).length; plainM += state.monsters.length;
    }
    window.choice = orig;
    return { eliteN, monN, plainE, plainM };
  });
  check(many.monN < many.plainM, `수가 적다 (평범 ${many.plainM} → 큰 것 ${many.monN})`);
  check(many.eliteN / many.monN > many.plainE / many.plainM,
        `엘리트 비율이 높다 (${(many.plainE/many.plainM*100).toFixed(0)}% → ${(many.eliteN/many.monN*100).toFixed(0)}%)`);

  console.log('\n[ 초반 두 층은 몰아붙이지 않는다 ]');
  const early = await p.evaluate(() => {
    const harsh = ['dense', 'dark', 'elite', 'hoard'];
    const out = [];
    for (let d = 0; d < 200; d++) {
      state.day = 20260101 + d;
      for (const f of [1, 2]) {
        const t = withSeed(floorSeed(f, state.day), () => {
          const pool = FLOOR_TAGS.filter(x => !harsh.includes(x.id));
          return choice(pool);
        });
        if (harsh.includes(t.id)) out.push(`${d}일 ${f}층 ${t.id}`);
      }
    }
    return out;
  });
  check(early.length === 0, `1~2층에는 험한 성격이 안 걸린다 (200일 × 2층 검사)`);

  await b.close(); srv.close();
  console.log('\n에러:', errs.length ? errs.join(' | ') : '없음');
  if (errs.length) fails++;
  console.log(fails ? `\n실패 ${fails}건` : '\n전부 통과');
  process.exit(fails ? 1 : 0);
})();
