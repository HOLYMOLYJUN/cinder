/* =========================================================
   story.js — 되짚기

   등불지기가 무너진 뒤, 결말을 고르기 전에 흐른다.

   왜 고르기 전인가.
     지금까지는 아무것도 모르는 채로 「불을 붙인다 / 붙이지 않는다」를 골랐다.
     그러면 그건 선택이 아니라 동전 던지기다.
     자기가 무슨 짓을 했는지 알고 나서 고르면 같은 두 단추가 다른 무게를 갖는다.

   왜 기억을 다 못 찾아도 전부 보여주는가.
     처음에는 못 찾은 장면을 긁힌 글자로 가리려 했다. 그런데 기억 아홉 개를
     다 모으는 데 열 판이 넘게 걸린다 — 대부분은 이야기를 끝까지 못 보고 그만둔다.
     **감추는 것이 아까워서 만든 이야기를 아무도 못 보게 되면 그건 장치가 아니라 손해다.**
     그래서 전부 보여준다. 기억은 계속 스탯으로 값을 하고, 이야기는 이야기대로 준다.

   그림은 팩에서 가져오지 않는다. 사각형과 선으로만 그린다 —
     이 게임의 그림체가 원래 그렇고, 무엇보다 여기서 필요한 것은 삽화가 아니라
     "무슨 일이 있었는지"를 가리키는 표식이다. 불 하나, 계단 하나, 이름 한 줄.
   ========================================================= */

/* 한 장면이 여러 쪽으로 넘어간다.

   pages 의 한 덩어리가 한 번에 뜨는 글이다. 다 찍히고 잠깐 머물렀다가
   다음 덩어리로 갈린다. 그림은 장면이 끝날 때까지 그대로 있고,
   쪽이 넘어간 만큼(prog)에 맞춰 천천히 변한다 — 불이 사그라들거나
   이름이 채워지는 것이 글과 같이 간다.

   한 화면에 다 쏟지 않는 이유는 분량이 아니라 호흡이다. 「당신은 잠시 붓을
   멈췄다」와 「하지만 해야 할 일이었다」 사이의 침묵이 이 이야기의 값이라,
   그 사이를 화면이 비워 줘야 한다. */
const STORY = [
  {
    key: 'climb',
    title: '오르던 발',
    draw: 'stairs',
    pages: [
      ['매일 이 계단을 올랐다.',
       '그곳에서 일을 했다.'],
    ],
  },
  {
    key: 'roster',
    title: '명부',
    draw: 'roster',
    pages: [
      ['당신이 하던 일은 이름을 적는 것이었다.'],
      ['이름을 적고,', '그 사람을 불렀다.'],
      ['그러면 그 사람은 계단을 올라갔다.'],
      ['한 번 올라간 사람은', '다시는 내려오지 않았다.'],
    ],
  },
  {
    key: 'first',
    title: '첫 번째 이름',
    draw: 'small',
    pages: [
      ['처음 적은 이름은', '어린아이였다.'],
      ['이름을 부르자', '아이가 대답했다.'],
      ['당신은 잠시 붓을 멈췄다.'],
      ['하지만 해야 할 일이었다.'],
      ['당신은 다시 이름을 적었고,', '아이는 계단을 올라갔다.'],
      ['그 뒤로도', '수많은 이름을 적었다.'],
    ],
  },
  {
    key: 'fire',
    title: '불을 만지던 손',
    draw: 'flame',
    pages: [
      ['사람이 올라갈 때마다', '탑의 불이 하나씩 켜졌다.'],
      ['처음에는 그게 무엇인지 몰랐다.'],
      ['나중에는 알게 됐다.'],
      ['그 불은', '사람이 올라가야만 타올랐다.'],
      ['당신은 그 사실을 알고도', '계속 이름을 적었다.'],
    ],
  },
  {
    key: 'throw',
    title: '던지던 손',
    draw: 'throw',
    pages: [
      ['어느 날,', '또 하나의 이름이 들어왔다.'],
      ['당신은 붓을 들었다가', '한참을 그대로 있었다.'],
      ['그리고 붓을 던졌다.'],
      ['그날은 이름을 적지 않았다.'],
      ['하지만 다음 날이 되자', '당신은 다시 붓을 주웠다.'],
      ['그리고 아무 일도 없었던 것처럼', '다시 이름을 적었다.'],
    ],
  },
  {
    key: 'night',
    title: '돌아선 밤',
    draw: 'turn',
    pages: [
      ['열두 번째 층에서', '당신은 또 하나의 이름을 받았다.'],
      ['이번에는 붓을 들지 않았다.'],
      ['오랫동안 그 자리에 서 있었다.'],
      ['그리고 아래를 바라봤다.'],
      ['지금까지 자신이 올려보낸 사람들이',
       '얼마나 많았는지 그제야 알 것 같았다.'],
      ['그날, 당신은 돌아섰다.'],
      ['그리고 처음으로', '계단을 내려가기 시작했다.'],
    ],
  },
  {
    key: 'douse',
    title: '끄던 손',
    draw: 'douse',
    pages: [
      ['당신은 탑에 남아 있던 불을', '하나씩 껐다.'],
      ['불이 꺼질 때마다', '탑은 조금씩 어두워졌다.'],
      ['마지막 불을 끄고 나자', '더 이상 아무도 올라오지 않았다.'],
      ['당신은 명부를 덮었다.'],
      ['그리고 탑을 떠났다.'],
    ],
  },
  {
    key: 'warmth',
    title: '남겨진 온기',
    draw: 'ember',
    pages: [
      ['그런데 탑 아래에', '작은 불 하나가 남아 있었다.'],
      ['누군가 당신을 위해', '피워둔 불이었다.'],
      ['당신은 그 불을 바라봤다.'],
      ['누가 남긴 것인지', '떠올리려고 했지만 기억나지 않았다.'],
      ['분명 알고 있었던 사람 같았다.'],
      ['하지만 끝내', '그 얼굴은 떠오르지 않았다.'],
    ],
  },
  {
    key: 'face',
    title: '당신의 얼굴',
    draw: 'twins',
    pages: [
      ['당신은 기억을 두고 내려왔다.'],
      ['이름을 적었던 일도,',
       '사람들을 올려보냈던 일도,',
       '마지막으로 불을 껐던 일도.'],
      ['모두 잊었다.'],
      ['남은 것은', '탑 아래에서 발견한 작은 불씨 하나뿐이었다.'],
      ['당신은 다시 명부를 펼쳤다.'],
      ['그리고 한참 동안', '빈 장부를 바라봤다.'],
    ],
  },
];

/* 고르고 난 뒤에 한 장면씩 더. 둘 다 명부로 끝난다 —
   태울 것을 정하는 일이 이 이야기의 한가운데였으므로.

   불을 붙이는 쪽의 마지막 세 줄은 타이틀 화면의 문장 그대로다
   (「불이 꺼진 탑 아래에서 깨어났다. 기억은 없고, 손에 불씨 하나」).
   순환이 이어졌다는 것을 설명하지 않고 같은 말로 보여준다. */
const STORY_END = {
  light: {
    title: '불을 붙였다',
    draw: 'door',
    pages: [
      ['당신은 불씨에 불을 붙였다.'],
      ['꺼져 있던 탑의 불이', '하나씩 다시 살아났다.'],
      ['그리고 아래에서', '문이 열리는 소리가 들렸다.'],
      ['누군가 들어온다.'],
      ['손에는 불씨 하나.'],
      ['기억은 없다.'],
    ],
  },
  leave: {
    title: '붙이지 않았다',
    draw: 'blank',
    pages: [
      ['당신은 불씨를 그대로 둔다.'],
      ['탑은 다시 어두워진다.'],
      ['당신은 명부를 펼친다.'],
      ['그리고 이번에는', '아무 이름도 적지 않는다.'],
    ],
  },
};

/* 되짚기를 한 번이라도 끝까지 봤는가. 판을 넘어 남는다 —
   건너뛰기를 내밀지 말지가 여기에 달려 있다. */
function storySeen() {
  return !!((loadData() || {}).sawStory);
}

function markStorySeen() {
  const save = loadData() || {};
  if (save.sawStory) return;
  save.sawStory = true;
  saveData(save);
}

const Story = {
  cv: null, ctx: null,
  scenes: [], at: 0, page: 0, t: 0, sceneT: 0, typed: 0,
  fast: false, raf: 0, done: null,

  LINE_MS: 46,          // 한 글자
  HOLD: 1.5,            // 다 찍히고 머무는 시간(초)
  BEAT: 0.35,           // 쪽이 갈릴 때의 빈 사이 — 여기가 침묵이다

  /* scenes 를 다 흘리고 onDone 을 부른다.
     ending 을 주면 그 결말의 마지막 장면 하나만 흐른다. */
  show(onDone, ending) {
    const screen = document.getElementById('story-screen');
    if (!screen) { if (onDone) onDone(); return; }

    this.scenes = ending ? [STORY_END[ending]].filter(Boolean) : STORY.slice();
    if (!this.scenes.length) { if (onDone) onDone(); return; }

    this.done = onDone || null;
    this.at = 0; this.page = 0; this.t = 0; this.sceneT = 0;
    this.typed = 0; this.fast = false;

    /* 건너뛰기는 **언제나** 보인다.

       예전에는 한 번 끝까지 본 사람에게만 내밀었다. 처음 보는 사람에게 내밀면
       「읽을 만한 것」이 아니라 「넘겨도 되는 것」으로 먼저 읽힌다는 이유였다.
       그럴듯했지만 값이 컸다 — 처음 온 사람이 이 이야기에 관심이 없으면
       갇힌 채로 끝날 때까지 기다려야 하고, 그건 이야기를 아끼는 것이 아니라
       사람을 붙잡아 두는 것이다.

       읽게 만드는 것은 나가는 문을 잠그는 일이 아니라 이야기 자체가 할 일이다. */
    const skip = document.getElementById('story-skip');
    if (skip) {
      skip.hidden = false;
      skip.classList.remove('hidden');
      skip.onclick = () => this.finish();
    }

    screen.classList.remove('hidden');
    this.cv = document.getElementById('story-canvas');
    this.ctx = this.cv.getContext('2d');
    this.resize();
    document.getElementById('story-title').textContent = '';
    document.getElementById('story-lines').innerHTML = '';

    cancelAnimationFrame(this.raf);
    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000) * (this.fast ? 4 : 1);
      last = now;
      this.step(dt);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  },

  open() {
    const s = document.getElementById('story-screen');
    return s && !s.classList.contains('hidden');
  },

  // 크레딧과 같은 조작 — 누르고 있으면 빨라진다. 건너뛰지는 않는다.
  setFast(on) { if (this.open()) this.fast = !!on; },

  /* 두 번 두드리면 다음 쪽으로 — **처음 보는 사람도.**

     건너뛰기 단추는 한 번 본 사람에게만 준다(아래 show 참고). 그 판단은
     그대로 두되, 읽는 속도가 찍히는 속도보다 빠른 사람을 붙잡아 두는 것도
     벌이다. 다 읽었으면 제 손으로 넘길 수 있어야 한다.

     한 번 두드림은 여전히 「누르는 동안 빨리」다. 두 번째 두드림이
     350ms 안에 오면 그때 넘긴다 — 첫 두드림의 뜻을 바꾸지 않는 경계값이다. */
  lastTap: 0,
  tap() {
    if (!this.open()) return;
    const now = performance.now();
    if (now - this.lastTap < 350) {
      this.lastTap = 0;                 // 세 번째 두드림이 또 넘기지 않게
      this.next();
      return;
    }
    this.lastTap = now;
    this.fast = true;
  },

  resize() {
    if (!this.cv) return;
    const r = this.cv.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cv.width = Math.max(1, Math.round(r.width * dpr));
    this.cv.height = Math.max(1, Math.round(r.height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  },

  step(dt) {
    const sc = this.scenes[this.at];
    if (!sc) return;
    this.t += dt;
    this.sceneT += dt;

    const lines = sc.pages[this.page] || [];

    // 글자가 하나씩 찍힌다 — 층 진입 연출과 같은 말투
    const total = lines.join('').length;
    const want = Math.floor(((this.t - this.BEAT) * 1000) / this.LINE_MS);
    const now = Math.max(0, Math.min(total, want));
    if (now !== this.typed) {
      /* 글자가 찍힐 때 타닥거린다. 한 프레임에 몇 글자가 찍히든 소리는
         한 번만 — 글자마다 내면 소리가 겹쳐 드르륵이 되는데, 어차피
         Sound 쪽 간격 제한(GAP)이 그 이상은 걸러 준다. */
      if (now > this.typed && typeof Sound !== 'undefined') Sound.play('type');
      this.typed = now;
      this.paintText(sc, lines);
    }

    /* 그림은 장면이 끝날 때까지 이어지고, 쪽이 넘어간 만큼에 맞춰 변한다.
       불이 사그라들거나 이름이 채워지는 것이 글과 같이 가야 한다. */
    const prog = sc.pages.length > 1 ? this.page / (sc.pages.length - 1) : 1;
    this.paintArt(sc, this.sceneT, prog);

    // 다 찍히고 잠깐 머물렀으면 다음 쪽
    const doneAt = this.BEAT + (total * this.LINE_MS) / 1000 + this.HOLD;
    if (this.typed >= total && this.t >= doneAt) this.next();
  },

  next() {
    const sc = this.scenes[this.at];
    this.t = 0; this.typed = 0;

    // 같은 장면 안에 남은 쪽이 있으면 글만 갈린다 (그림은 그대로)
    if (sc && this.page + 1 < sc.pages.length) {
      this.page++;
      document.getElementById('story-lines').innerHTML = '';
      return;
    }

    this.at++; this.page = 0; this.sceneT = 0;
    if (this.at >= this.scenes.length) { this.finish(); return; }
    document.getElementById('story-title').textContent = '';
    document.getElementById('story-lines').innerHTML = '';
  },

  finish() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.fast = false;
    /* 건너뛰어서 끝났어도 「봤다」로 친다. 끝까지 본 사람만 세면
       한 번 건너뛴 사람은 다음에도 건너뛰기를 못 보게 되는데, 그건 거꾸로다. */
    markStorySeen();
    document.getElementById('story-screen').classList.add('hidden');
    const d = this.done;
    this.done = null;
    if (d) d();
  },

  paintText(sc, lines) {
    document.getElementById('story-title').textContent = sc.title;
    const box = document.getElementById('story-lines');
    let left = this.typed;
    box.innerHTML = lines.map(l => {
      const take = Math.max(0, Math.min(l.length, left));
      left -= l.length;
      // 아직 안 찍힌 자리는 투명하게 남겨 둔다 — 줄이 밀려 올라가지 않게
      return `<div>${l.slice(0, take)}<span class="ghost">${l.slice(take)}</span></div>`;
    }).join('');
  },

  /* ---------- 그림 ----------

     처음에는 사각형과 선으로 그렸는데, 옆에 진짜 도트가 없으니 표식이 아니라
     그냥 못 그린 그림으로 보였다. **팩의 그림으로 장면을 짓는다.**
     계단·횃불·모닥불·문·사람은 이미 구워져 있고, 그것들을 한 칸 격자에 올려
     작은 방을 하나 세우면 그게 곧 이 게임의 한 장면이 된다.

     새로 그리는 것은 벽에 긁힌 자국뿐이다. 그건 원래 긁어 놓은 것이라
     선으로 그리는 게 맞다 — 4층의 「벽에 이름들이 긁혀 있습니다」가 그것이다. */

  im(key, frame) {
    const s = Render.img && Render.img[key];
    if (!s || !s.f.length) return null;
    const im = s.f[(frame || 0) % s.f.length];
    return (im && im.complete && im.naturalWidth) ? im : null;
  },

  // 바닥에 발을 붙여 놓는다 (게임 화면과 같은 규칙)
  put(c, key, x, footY, T, frame, alpha, tint) {
    const im = this.im(key, frame);
    if (!im) return;
    const k = T / 16;
    const w = im.width * k, h = im.height * k;
    const src = tint ? Render.tinted(im, tint[0], tint[1]) : im;
    c.save();
    c.globalAlpha = alpha === undefined ? 1 : alpha;
    if (tint === 'flip') { c.translate(x + w / 2, footY - h); c.scale(-1, 1); c.drawImage(im, 0, 0, w, h); }
    else c.drawImage(src, x - w / 2, footY - h, w, h);
    c.restore();
  },

  glow(c, x, y, r, a) {
    const g = c.createRadialGradient(x, y, 1, x, y, r);
    g.addColorStop(0, `rgba(255,175,85,${a})`);
    g.addColorStop(1, 'rgba(255,140,60,0)');
    c.fillStyle = g;
    c.fillRect(x - r, y - r, r * 2, r * 2);
  },

  /* 작은 방 하나. 뒤에 벽 한 줄, 그 아래로 바닥.
     실제 층을 그리는 규칙(벽 몸통 + 위 마감)을 그대로 쓴다. */
  stage(c, W, H, T, sewer) {
    const cols = Math.ceil(W / T) + 2;
    const floorTop = Math.round(H * 0.42);
    const key = k => (sewer && Render.img['sewer.' + k]) ? 'sewer.' + k : k;
    for (let i = -1; i < cols; i++) {
      const x = i * T - T / 2;
      // 뒷벽 두 줄
      for (let r = 1; r <= 2; r++) {
        const im = this.im(key('wallFace'));
        if (im) c.drawImage(im, x, floorTop - T * r, T, T);
      }
      const top = this.im(key('wallTop'));
      if (top) c.drawImage(top, x, floorTop - T * 2, T, T);
      // 바닥
      for (let r = 0; r < Math.ceil((H - floorTop) / T) + 1; r++) {
        const f = this.im(key('floor'), (i * 3 + r * 5) % 8);
        if (f) c.drawImage(f, x, floorTop + T * r, T, T);
      }
    }
    return floorTop;
  },

  // 벽에 긁힌 이름들. n 개까지 보인다. skip 자리는 비워 둔다 (적지 않은 날).
  scratches(c, W, floorTop, T, n, skip) {
    c.save();
    c.strokeStyle = 'rgba(226,214,196,.55)';
    c.lineWidth = Math.max(1, T / 18);
    const cols = 6, rows = 4;
    const x0 = W / 2 - (cols * T * 0.42) / 2 * 1.0;
    for (let i = 0; i < Math.min(n, cols * rows); i++) {
      if (skip !== undefined && i === skip) continue;
      const cxi = i % cols, cyi = (i / cols) | 0;
      const x = W / 2 + (cxi - cols / 2 + 0.5) * T * 0.72;
      const y = floorTop - T * 1.85 + cyi * T * 0.42;
      c.beginPath();
      c.moveTo(x - T * 0.22, y);
      c.lineTo(x + T * 0.22, y - T * 0.05);
      c.stroke();
    }
    c.restore();
  },

  paintArt(sc, t, prog) {
    const P = prog === undefined ? 1 : prog;
    const c = this.ctx;
    if (!c || !Render.ready) return;
    const W = this.cv.clientWidth, H = this.cv.clientHeight;
    c.clearRect(0, 0, W, H);
    c.imageSmoothingEnabled = false;

    const T = Math.max(18, Math.round(W / 11));       // 한 칸
    const cx = W / 2;
    const hero = (typeof heroSprite === 'function') ? heroSprite() + '.idle' : 'player.idle';
    const f4 = Math.floor(t * 6) % 4;                 // 사람 숨쉬는 프레임
    const f8 = Math.floor(t * 9) % 8;                 // 불 프레임
    const sewer = sc.draw === 'ember';                // 아래층은 하수도로 — 되찾은 자리

    let floorTop = this.stage(c, W, H, T, false);
    const feet = floorTop + T * 2.2;

    switch (sc.draw) {
      case 'stairs':                          // 위로 이어지는 계단 앞
        this.put(c, 'stairs', cx, floorTop + T, T);
        this.put(c, 'torchWall', cx - T * 3, floorTop - T * 0.2, T, f8, 0.95);
        this.glow(c, cx - T * 3, floorTop - T * 0.9, T * 2.6, 0.22);
        this.put(c, hero, cx, feet, T, f4);
        break;

      case 'roster':                          // 벽에 이름이 하나씩 늘어난다
        this.scratches(c, W, floorTop, T, Math.round(P * 20) + 2);
        this.put(c, 'torchWall', cx + T * 3.2, floorTop - T * 0.2, T, f8, 0.95);
        this.glow(c, cx + T * 3.2, floorTop - T * 0.9, T * 2.8, 0.24);
        this.put(c, hero, cx - T * 0.6, feet, T, f4);
        break;

      /* 어른 앞에 선 아주 작은 하나.

         예전에는 주인공을 0.62배로 줄여 세웠다. 그러면 아이가 나와 똑같이
         생기는데, 그건 「작아진 나」이지 다른 사람이 아니다. 게다가 이 게임에는
         **당신의 얼굴을 한 것이 이미 하나 있다** — 최종 보스 등불지기다.
         아이까지 내 얼굴이면 그 장치가 묽어진다.

         이제는 실루엣이 다른 그림을 줄인다. 크기보다 그게 먼저다. */
      case 'small':
        this.put(c, 'stairs', cx + T * 2.4, floorTop + T, T);
        this.put(c, hero, cx - T * 1.4, feet, T, f4);
        this.put(c, 'child.idle', cx + T * 1.1, feet, T * 0.62, f4, 0.92);
        this.glow(c, cx + T * 1.1, feet - T * 0.6, T * 1.8, 0.12);
        break;

      case 'flame':                           // 크게 타오르는 불
        this.put(c, 'camp', cx, floorTop + T * 1.3, T, Math.floor(t * 6) % 3);
        this.put(c, 'campFlame', cx, floorTop + T * 1.1, T * 1.9, f8);
        this.glow(c, cx, floorTop + T * 0.4, T * 4.2, 0.3);
        this.put(c, hero, cx - T * 2.6, feet, T, f4);
        break;

      case 'throw':                           // 한 자리를 비워 둔 벽
        // 쪽이 넘어가면서 한 칸이 비었다가 다시 채워진다
        this.scratches(c, W, floorTop, T, 14, P > 0.3 && P < 0.85 ? 9 : undefined);
        this.put(c, 'torchWall', cx + T * 3.2, floorTop - T * 0.2, T, f8, 0.7);
        this.glow(c, cx + T * 3.2, floorTop - T * 0.9, T * 2.4, 0.16);
        this.put(c, hero, cx - T * 0.6, feet, T, f4);
        break;

      case 'turn':                            // 계단을 등지고 선 사람
        this.put(c, 'stairs', cx + T * 2.6, floorTop + T, T, 0, 0.6);
        this.put(c, hero, cx - T * 0.8, feet, T, f4, 1, 'flip');
        this.glow(c, cx - T * 0.8, feet - T, T * 2.2, 0.10);
        break;

      case 'douse': {                         // 하나씩 꺼져 가는 횃불
        const a = Math.max(0.03, 1 - P);
        for (let i = -1; i <= 1; i++) {
          const on = (i + 1) / 2 < a + 0.34;
          const x = cx + i * T * 3;
          this.put(c, 'torchWall', x, floorTop - T * 0.2, T, f8 + i * 3, on ? 0.95 : 0.14);
          if (on) this.glow(c, x, floorTop - T * 0.9, T * 2.6, 0.2 * a);
        }
        this.put(c, hero, cx, feet, T, f4, 0.4 + a * 0.6);
        break;
      }

      case 'ember':                           // 아래에 남겨진 작은 불
        floorTop = this.stage(c, W, H, T, true);
        this.put(c, 'camp', cx, floorTop + T * 1.6, T * 0.8, Math.floor(t * 6) % 3);
        this.put(c, 'campFlame', cx, floorTop + T * 1.45, T * 1.0, f8);
        this.glow(c, cx, floorTop + T * 0.9, T * 2.6, 0.26);
        this.put(c, hero, cx - T * 2.2, floorTop + T * 2.4, T, f4);
        break;

      case 'twins':                           // 마주 선 같은 둘
        this.put(c, hero, cx - T * 1.7, feet, T, f4, 1, 'flip');
        this.put(c, hero, cx + T * 1.7, feet, T, f4, 1, [COLORS.ember, 0.55]);
        this.glow(c, cx + T * 1.7, feet - T, T * 2.8, 0.24);
        break;

      case 'door':                            // 다시 살아나는 불, 그리고 열리는 문
        this.put(c, 'camp', cx, floorTop + T * 1.3, T, Math.floor(t * 6) % 3);
        this.put(c, 'campFlame', cx, floorTop + T * 1.1, T * (0.5 + P * 1.6), f8);
        this.glow(c, cx, floorTop + T * 0.4, T * (1.5 + P * 3), 0.16 + P * 0.24);
        this.put(c, 'door', cx - T * 3.4, floorTop + T * 0.02, T);
        this.glow(c, cx - T * 3.4, floorTop - T * 0.5, T * 2.4 * P, 0.3 * P);
        if (P > 0.55) this.put(c, hero, cx - T * 3.4, feet, T * 0.9, f4, (P - 0.55) / 0.45);
        break;

      case 'blank':                           // 아무것도 적지 않은 벽
        this.scratches(c, W, floorTop, T, 20);
        this.put(c, 'camp', cx + T * 3, floorTop + T * 1.3, T, 0, 0.5);
        this.put(c, hero, cx - T * 0.6, feet, T, f4, 0.9);
        break;
    }

    /* 가장자리를 어둡게 — 이 게임은 불씨 반경 밖이 늘 어둡다.
       장면도 같은 규칙을 따라야 같은 세계로 보인다. */
    const vg = c.createRadialGradient(cx, H * 0.52, Math.min(W, H) * 0.22,
                                      cx, H * 0.52, Math.max(W, H) * 0.72);
    vg.addColorStop(0, 'rgba(6,5,4,0)');
    vg.addColorStop(1, 'rgba(6,5,4,.95)');
    c.fillStyle = vg;
    c.fillRect(0, 0, W, H);
  },
};
