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

const STORY = [
  {
    key: 'climb',
    title: '오르던 발',
    lines: ['매일 이 계단을 올랐다.',
            '오르러 온 것이 아니라, 일하러 왔다.'],
    draw: 'stairs',
  },
  {
    key: 'roster',
    title: '명부',
    lines: ['당신이 하던 일은 이름을 적는 것이었다.',
            '적으면 그 사람이 올라갔다.',
            '아무도 내려오지 않았다.'],
    draw: 'roster',
  },
  {
    key: 'first',
    title: '첫 번째 이름',
    lines: ['처음 적어 올린 이름이 있다.',
            '어렸다.',
            '이름을 부르니 대답했다.'],
    draw: 'small',
  },
  {
    key: 'fire',
    title: '불을 만지던 손',
    lines: ['불은 사람을 태워야 탄다.',
            '당신은 그것을 알고 있었고,',
            '알고도 계속 적었다.'],
    draw: 'flame',
  },
  {
    key: 'throw',
    title: '던지던 손',
    lines: ['어느 날 붓을 던졌다.',
            '그리고 다시 주웠다.'],
    draw: 'throw',
  },
  {
    key: 'night',
    title: '돌아선 밤',
    lines: ['열두 번째 층에서 돌아섰다.',
            '그날은 적지 않았다.'],
    draw: 'turn',
  },
  {
    key: 'douse',
    title: '끄던 손',
    lines: ['대신 불을 껐다.',
            '탑이 어두워졌다.',
            '그날부터 아무도 올라가지 않았다.'],
    draw: 'douse',
  },
  {
    key: 'warmth',
    title: '남겨진 온기',
    lines: ['그런데 아래에 불이 하나 남아 있었다.',
            '누군가 당신을 위해 피워둔 것이었다.',
            '누구였는지는 끝내 떠오르지 않는다.'],
    draw: 'ember',
  },
  {
    key: 'face',
    title: '당신의 얼굴',
    lines: ['당신은 기억을 두고 내려갔다.',
            '두고 간 자리가 지금 여기다.'],
    draw: 'twins',
  },
];

/* 고르고 난 뒤에 한 장면씩 더. 둘 다 명부로 끝난다 —
   태울 것을 정하는 일이 이 이야기의 한가운데였으므로. */
const STORY_END = {
  light: {
    title: '불을 붙였다',
    lines: ['불이 살아난다.',
            '아래에서 문이 열리는 소리가 난다.',
            '누군가 들어온다. 손에 불씨 하나, 기억은 없이.'],
    draw: 'door',
  },
  leave: {
    title: '붙이지 않았다',
    lines: ['어둠은 그대로다.',
            '당신은 명부를 편다.',
            '아무 이름도 적지 않는다.'],
    draw: 'blank',
  },
};

const Story = {
  cv: null, ctx: null,
  scenes: [], at: 0, t: 0, typed: 0, fast: false, raf: 0, done: null,

  LINE_MS: 46,          // 한 글자
  HOLD: 1.6,            // 다 찍히고 머무는 시간(초)
  FADE: 0.5,

  /* scenes 를 다 흘리고 onDone 을 부른다.
     ending 을 주면 그 결말의 마지막 장면 하나만 흐른다. */
  show(onDone, ending) {
    const screen = document.getElementById('story-screen');
    if (!screen) { if (onDone) onDone(); return; }

    this.scenes = ending ? [STORY_END[ending]].filter(Boolean) : STORY.slice();
    if (!this.scenes.length) { if (onDone) onDone(); return; }

    this.done = onDone || null;
    this.at = 0; this.t = 0; this.typed = 0; this.fast = false;

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

    // 글자가 하나씩 찍힌다 — 층 진입 연출과 같은 말투
    const total = sc.lines.join('').length;
    const want = Math.floor((this.t * 1000) / this.LINE_MS);
    if (want !== this.typed) {
      this.typed = Math.min(total, want);
      this.paintText(sc);
    }

    this.paintArt(sc, this.t);

    // 다 찍히고 잠깐 머물렀으면 다음 장면
    const typedAll = this.typed >= total;
    const doneAt = (total * this.LINE_MS) / 1000 + this.HOLD;
    if (typedAll && this.t >= doneAt) this.next();
  },

  next() {
    this.at++;
    this.t = 0; this.typed = 0;
    if (this.at >= this.scenes.length) { this.finish(); return; }
    document.getElementById('story-title').textContent = '';
    document.getElementById('story-lines').innerHTML = '';
  },

  finish() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.fast = false;
    document.getElementById('story-screen').classList.add('hidden');
    const d = this.done;
    this.done = null;
    if (d) d();
  },

  paintText(sc) {
    document.getElementById('story-title').textContent = sc.title;
    const box = document.getElementById('story-lines');
    let left = this.typed;
    box.innerHTML = sc.lines.map(l => {
      const take = Math.max(0, Math.min(l.length, left));
      left -= l.length;
      // 아직 안 찍힌 자리는 투명하게 남겨 둔다 — 줄이 밀려 올라가지 않게
      return `<div>${l.slice(0, take)}<span class="ghost">${l.slice(take)}</span></div>`;
    }).join('');
  },

  /* ---------- 그림 ----------
     전부 사각형과 선. 불빛 하나를 기준으로 어둠 속에서 형태만 드러낸다. */
  paintArt(sc, t) {
    const c = this.ctx;
    if (!c) return;
    const W = this.cv.clientWidth, H = this.cv.clientHeight;
    c.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2;
    const U = Math.max(6, Math.min(W, H) / 22);      // 한 칸
    const ember = '#E9954A', ink = '#D8CDBB', dim = 'rgba(216,205,187,.28)';

    const glow = (x, y, r, a) => {
      const g = c.createRadialGradient(x, y, 1, x, y, r);
      g.addColorStop(0, `rgba(233,149,74,${a})`);
      g.addColorStop(1, 'rgba(233,149,74,0)');
      c.fillStyle = g;
      c.fillRect(x - r, y - r, r * 2, r * 2);
    };
    const person = (x, y, col, s = 1) => {
      c.fillStyle = col;
      c.fillRect(x - U * 0.30 * s, y - U * 1.5 * s, U * 0.6 * s, U * 0.62 * s);  // 머리
      c.fillRect(x - U * 0.42 * s, y - U * 0.86 * s, U * 0.84 * s, U * 0.9 * s); // 몸
    };
    const flame = (x, y, size, a) => {
      glow(x, y, size * 3.2, 0.32 * a);
      c.globalAlpha = a;
      c.fillStyle = ember;
      c.fillRect(x - size * 0.5, y - size, size, size * 1.4);
      c.fillStyle = '#FACB3E';
      c.fillRect(x - size * 0.22, y - size * 0.75, size * 0.44, size * 0.8);
      c.globalAlpha = 1;
    };

    switch (sc.draw) {
      case 'stairs': {                       // 위로 이어지는 계단
        c.fillStyle = dim;
        for (let i = 0; i < 7; i++) {
          const w = U * 5, x = cx - w / 2 + i * U * 0.1;
          c.fillRect(x, cy + U * 3 - i * U * 0.9, w, U * 0.5);
        }
        person(cx, cy + U * 3.2, ink, 1);
        break;
      }
      case 'roster': {                       // 한 줄씩 채워지는 명부
        const w = U * 7, h = U * 8;
        c.strokeStyle = dim; c.lineWidth = 2;
        c.strokeRect(cx - w / 2, cy - h / 2, w, h);
        const rows = Math.min(9, Math.floor(t * 2.6));
        c.fillStyle = ink;
        for (let i = 0; i < rows; i++)
          c.fillRect(cx - w / 2 + U * 0.7, cy - h / 2 + U * 0.9 + i * U * 0.78,
                     w - U * 1.4, U * 0.16);
        break;
      }
      case 'small': {                        // 높은 어둠 아래 아주 작은 하나
        c.strokeStyle = dim; c.lineWidth = 2;
        c.strokeRect(cx - U * 3, cy - U * 5, U * 6, U * 10);
        person(cx, cy + U * 4, ink, 0.62);
        glow(cx, cy + U * 3.4, U * 2.4, 0.16);
        break;
      }
      case 'flame':                          // 크게 타는 불
        flame(cx, cy + U * 1.6, U * 1.9 + Math.sin(t * 6) * U * 0.14, 1);
        break;
      case 'throw': {                        // 던졌다가 다시 주운 것
        const p = (Math.sin(t * 1.5) + 1) / 2;
        c.strokeStyle = dim; c.lineWidth = 2;
        c.beginPath();
        for (let i = 0; i <= 24; i++) {
          const q = i / 24, x = cx - U * 3 + q * U * 6, y = cy + U * 2 - Math.sin(q * Math.PI) * U * 3;
          i ? c.lineTo(x, y) : c.moveTo(x, y);
        }
        c.stroke();
        const q = p, x = cx - U * 3 + q * U * 6, y = cy + U * 2 - Math.sin(q * Math.PI) * U * 3;
        c.fillStyle = ink;
        c.fillRect(x - U * 0.16, y - U * 0.16, U * 0.32, U * 0.32);
        break;
      }
      case 'turn': {                         // 계단을 등지고 선 사람
        c.fillStyle = dim;
        for (let i = 0; i < 6; i++)
          c.fillRect(cx + U * 0.6, cy + U * 2.4 - i * U * 0.9, U * 4, U * 0.5);
        person(cx - U * 2.2, cy + U * 2.6, ink, 1);
        break;
      }
      case 'douse': {                        // 꺼져 가는 불
        const a = Math.max(0, 1 - t / 2.6);
        flame(cx, cy + U * 1.6, U * 1.8 * a + 0.001, a);
        if (a < 0.35) {
          c.fillStyle = 'rgba(120,110,100,.5)';
          c.fillRect(cx - U * 1.2, cy + U * 1.5, U * 2.4, U * 0.2);
        }
        break;
      }
      case 'ember': {                        // 아래에 남겨진 작은 불
        c.strokeStyle = dim; c.lineWidth = 2;
        c.beginPath(); c.moveTo(cx - U * 5, cy - U * 2); c.lineTo(cx + U * 5, cy - U * 2); c.stroke();
        flame(cx, cy + U * 3, U * 0.8 + Math.sin(t * 5) * U * 0.08, 1);
        break;
      }
      case 'twins': {                        // 마주 선 같은 둘
        person(cx - U * 2.4, cy + U * 1.6, ink, 1);
        person(cx + U * 2.4, cy + U * 1.6, 'rgba(233,149,74,.75)', 1);
        glow(cx + U * 2.4, cy + U * 0.6, U * 2.6, 0.2);
        break;
      }
      case 'door': {                         // 아래에서 열리는 문
        const w = U * 3.4, h = U * 6;
        c.strokeStyle = dim; c.lineWidth = 2;
        c.strokeRect(cx - w / 2, cy - h / 2 + U, w, h);
        const open = Math.min(1, t / 2);
        c.fillStyle = ember;
        c.globalAlpha = 0.5 * open;
        c.fillRect(cx - w / 2 + 2, cy - h / 2 + U + 2, w * open, h - 4);
        c.globalAlpha = 1;
        glow(cx, cy + U, U * 4 * open, 0.24 * open);
        person(cx, cy + U * 3.6, ink, 0.8);
        break;
      }
      case 'blank': {                        // 아무것도 적지 않은 명부
        const w = U * 7, h = U * 8;
        c.strokeStyle = dim; c.lineWidth = 2;
        c.strokeRect(cx - w / 2, cy - h / 2, w, h);
        break;
      }
    }
  },
};
