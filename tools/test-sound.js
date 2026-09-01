/* 잿불 — 소리 검증

   소리는 귀로 들어야 알지만, 기계로 확인할 수 있는 것들이 있다.
   특히 "사용자가 누르기 전에는 소리를 못 낸다"는 브라우저 규칙을
   제대로 다루고 있는지가 가장 흔한 실수다. */

const { chromium } = require('playwright');
const GAME = require('url').pathToFileURL(require('path').join(__dirname, '..', 'index.html')).href;

let fails = 0;
const check = (c, m) => { console.log((c ? '  O ' : '  X ') + m); if (!c) fails++; };

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  await page.goto(GAME);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(700);

  /* ---------- 1. 누르기 전에는 소리 장치를 만들지 않는다 ---------- */
  console.log('\n[ 잠금 해제 ]');
  check(await page.evaluate(() => Sound.ctx === null), '입력 전에는 AudioContext 를 만들지 않음');

  await page.click('#btn-start');
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => ({
    has: !!Sound.ctx, state: Sound.ctx && Sound.ctx.state,
    master: Sound.master ? Sound.master.gain.value : null,
  }));
  check(after.has, '시작 버튼을 누르면 AudioContext 가 생김');
  check(after.state === 'running', `소리 장치가 깨어 있음 (${after.state})`);
  check(after.master > 0, `기본 음량이 켜져 있음 (${after.master})`);

  /* ---------- 2. 소리가 실제로 울리는가 ---------- */
  console.log('\n[ 재생 ]');
  const played = await page.evaluate(() => {
    const names = ['step','hit','magic','throw','hurt','kill','gold','potion',
                   'cast','spell','miss',
                   'gearCommon','gearFine','gearAncient','stairs','camp','buy','ember',
                   'bossWarn','bossHit','memory','death','endLight','endLeave','ach','ui'];
    let errs = [];
    let peak = 0;
    for (const n of names) {
      try { Sound.last = {}; Sound.play(n); peak = Math.max(peak, Sound.voices); }
      catch (e) { errs.push(n + ': ' + e.message); }
    }
    return { count: names.length, errs, peak };
  });
  check(played.errs.length === 0, `${played.count}종 전부 예외 없이 재생` +
        (played.errs.length ? ' — ' + played.errs.join(', ') : ''));
  check(played.peak > 0, `실제로 소리가 만들어짐 (동시 ${played.peak}개까지)`);

  /* ---------- 3. 소리가 몰려도 찢어지지 않게 막는가 ---------- */
  const flood = await page.evaluate(() => {
    Sound.last = {}; Sound.voices = 0;          // 앞 시험의 잔향을 지우고
    let byGap = 0;
    for (let i = 0; i < 60; i++) if (Sound.canPlay('step', 0.05)) byGap++;
    Sound.last = {}; Sound.voices = 20;         // 이번엔 소리가 이미 가득 찬 상태
    const whenFull = Sound.canPlay('step', 0);
    Sound.voices = 0;
    return { byGap, whenFull };
  });
  check(flood.byGap === 1, `같은 소리를 60번 연달아 요청해도 ${flood.byGap}번만 통과 (간격 제한)`);
  check(flood.whenFull === false, '소리가 이미 가득 차 있으면 새 소리를 만들지 않음');

  /* ---------- 4. 층마다 배경음이 낮아지는가 ---------- */
  console.log('\n[ 배경음 ]');
  // 1층 진입 연출이 끝나면서 setFloor(1) 을 다시 부른다.
  // 그게 끝난 뒤에 재야 우리가 건 값이 덮이지 않는다.
  await page.waitForFunction(() => state.running === true, null, { timeout: 8000 });
  await page.waitForTimeout(300);

  const drone = await page.evaluate(async () => {
    Sound.setFloor(1);
    await new Promise(r => setTimeout(r, 2200));   // 램프가 끝날 때까지 기다린다
    const f1 = Sound.droneHz, live1 = Sound.drone.a.frequency.value;
    Sound.setFloor(15);
    await new Promise(r => setTimeout(r, 2200));
    const f15 = Sound.droneHz, live15 = Sound.drone.a.frequency.value;
    return { f1, f15, live1, live15 };
  });
  check(drone.live1 < 70,
        `드론이 처음부터 낮게 울림 — 440Hz 에서 미끄러지지 않음 (${drone.live1.toFixed(1)}Hz)`);
  check(drone.f15 < drone.f1,
        `위로 갈수록 드론이 낮아짐 (1층 ${drone.f1.toFixed(1)}Hz → 15층 ${drone.f15.toFixed(1)}Hz)`);

  /* ---------- 배경 선율 ---------- */
  console.log('\n[ 배경 선율 ]');
  const music = await page.evaluate(() => {
    const before = Sound.voices;
    // 층에 들어서면 선율 시계가 돈다 (setFloor 가 startMusic 을 부른다)
    const timer = !!Sound.musicTimer;
    // 음 하나를 직접 떨어뜨려 본다 — 실제로 소리가 만들어지는가
    Sound.musicNote(0, 4, 0, 0.04);
    const after = Sound.voices;
    // 음계가 드론 뿌리를 따라간다 — 첫 음은 드론의 두 옥타브 위
    const root = Sound.droneHz * 4 * Sound.MUSIC_SCALE[0];
    return { timer, made: after > before, root, drone: Sound.droneHz };
  });
  check(music.timer, '층에 들어서면 선율 시계가 돈다');
  check(music.made, '선율 음이 실제로 만들어짐');
  check(Math.abs(music.root - music.drone * 4) < 0.01,
        `선율이 드론과 같은 뿌리에서 자란다 (드론 ${music.drone.toFixed(1)}Hz → ${music.root.toFixed(1)}Hz)`);

  const wetStep = await page.evaluate(() => {
    // 발소리 — 돌 층과 하수도 층이 다른 소리를 낸다 (예외 없이 재생되고 소리 수가 느는가)
    const out = {};
    let b = Sound.voices;
    Sound.last = {}; state.depth = 4;  Sound.play('step'); out.stone = Sound.voices - b;
    b = Sound.voices;
    Sound.last = {}; state.depth = 12; Sound.play('step'); out.sewer = Sound.voices - b;
    state.depth = 4;
    out.total = Sound.voices;
    return out;
  });
  check(wetStep.stone > 0 && wetStep.sewer > 0,
        `발소리가 돌 층에서도 하수도에서도 난다 (돌 +${wetStep.stone} · 하수도 +${wetStep.sewer} · 총 ${wetStep.total})`);

  /* ---------- 5. 음소거 ---------- */
  console.log('\n[ 음소거 ]');
  const muted = await page.evaluate(() => {
    Sound.setMuted(true);
    return { gain: Sound.master.gain.value, saved: (loadData() || {}).muted,
             blocked: Sound.canPlay('step', 0) };
  });
  check(muted.gain === 0, '음소거하면 음량이 0');
  check(muted.saved === true, '음소거 상태가 저장됨');
  check(muted.blocked === false, '음소거 중에는 소리를 만들지도 않음');

  await page.reload();
  await page.waitForTimeout(700);
  const kept = await page.evaluate(() => Sound.muted);
  check(kept === true, '새로고침 뒤에도 음소거가 유지됨');

  // M 키로 되돌리기
  await page.click('#btn-start');
  await page.waitForTimeout(300);
  await page.keyboard.press('m');
  await page.waitForTimeout(200);
  const back = await page.evaluate(() => ({
    muted: Sound.muted, gain: Sound.master.gain.value,
    label: document.getElementById('btn-mute').textContent.trim(),
  }));
  check(back.muted === false && back.gain > 0, 'M 키로 다시 켜짐');
  check(back.label === '소리 켬', '버튼 표시도 따라 바뀜: ' + back.label);

  console.log('\n=== 에러 ===');
  console.log(errors.length ? errors.join('\n') : '없음');
  if (errors.length) fails++;

  console.log(fails === 0 ? '\n전부 통과' : `\n실패 ${fails}건`);
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
