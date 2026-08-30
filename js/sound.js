/* =========================================================
   sound.js — 소리를 파일 없이 그 자리에서 만든다

   음원을 쓰지 않는 이유:
     1) 아티팩트는 HTML 한 장이라 음원도 데이터 URI로 구워야 하는데,
        그러면 소리가 그림보다 무거워진다.
     2) 픽셀아트에는 녹음된 소리보다 합성음이 맞는다.
     3) 층이 오를수록 배경음을 낮추는 것 같은 일이 코드 한 줄로 끝난다.

   브라우저는 사용자가 무언가를 누르기 전에는 소리를 내주지 않는다.
   그래서 AudioContext 는 첫 클릭에서 깨운다 (unlock).
   ========================================================= */

const Sound = {
  ctx: null,
  master: null,
  muted: false,
  voices: 0,          // 지금 울리고 있는 소리 수
  last: {},           // 같은 소리가 연달아 날 때를 위한 시각 기록
  drone: null,
  droneHz: 0,
  crackleTimer: null,

  /* ---------- 준비 ---------- */

  init() {
    const save = loadData() || {};
    this.muted = !!save.muted;
  },

  // 첫 사용자 입력에서 부른다. 이걸 빼먹으면 "왜 소리가 안 나지"로 한참 헤맨다.
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
    } catch (e) { this.ctx = null; }
  },

  setMuted(on) {
    this.muted = on;
    if (this.master) this.master.gain.value = on ? 0 : 0.5;
    const save = loadData() || {};
    save.muted = on;
    saveData(save);
    return this.muted;
  },

  toggleMute() { return this.setMuted(!this.muted); },

  /* ---------- 재료 ---------- */

  now() { return this.ctx.currentTime; },

  // 소리가 몰리면 찢어진다. 턴제라 한 턴에 여러 개가 한꺼번에 날 수 있다.
  canPlay(name, minGap) {
    if (!this.ctx || this.muted) return false;
    if (this.voices > 8) return false;
    const t = this.ctx.currentTime;
    if (this.last[name] && t - this.last[name] < (minGap || 0.03)) return false;
    this.last[name] = t;
    return true;
  },

  env(node, t, vol, attack, hold, release) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol), t + attack);
    g.gain.setValueAtTime(Math.max(0.0001, vol), t + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
    node.connect(g);
    g.connect(this.master);
    this.voices++;
    return { g, end: t + attack + hold + release };
  },

  // 음 하나. from → to 로 미끄러지게 할 수 있다.
  tone(o) {
    const t = this.now() + (o.delay || 0);   // 음을 차례로 놓을 때 쓴다
    const osc = this.ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.from, t);
    if (o.to && o.to !== o.from) osc.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
    const { end } = this.env(osc, t, o.vol == null ? 0.2 : o.vol,
                             o.attack || 0.005, o.dur, o.release || 0.05);
    osc.start(t);
    osc.stop(end + 0.02);
    osc.onended = () => { this.voices--; };
  },

  // 잡음 한 조각. 타격·발소리처럼 음정이 없는 소리에 쓴다.
  noise(o) {
    const t = this.now();
    const len = Math.max(0.02, o.dur);
    const buf = this.ctx.createBuffer(1, Math.ceil(this.ctx.sampleRate * len), this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;

    const f = this.ctx.createBiquadFilter();
    f.type = o.type || 'bandpass';
    f.frequency.setValueAtTime(o.freq || 900, t);
    if (o.freqTo) f.frequency.exponentialRampToValueAtTime(o.freqTo, t + len);
    f.Q.value = o.q == null ? 1.2 : o.q;

    src.connect(f);
    const { end } = this.env(f, t, o.vol == null ? 0.25 : o.vol, 0.004, len * 0.6, len * 0.5);
    src.start(t);
    src.stop(end + 0.02);
    src.onended = () => { this.voices--; };
  },

  chord(freqs, o) {
    freqs.forEach((f, i) => setTimeout(() => {
      if (this.ctx) this.tone({ from: f, to: f, dur: o.dur, vol: o.vol, type: o.type || 'sine',
                                release: o.release || 0.3 });
    }, i * (o.spread || 0)));
  },

  /* ---------- 사건별 소리 ---------- */

  play(name) {
    if (!this.canPlay(name, GAP[name])) return;
    const r = () => 0.94 + Math.random() * 0.12;      // 같은 소리도 매번 조금씩 다르게

    switch (name) {
      case 'step':
        this.tone({ from: 150 * r(), to: 90, dur: 0.035, vol: 0.055, type: 'triangle', release: 0.03 });
        break;

      case 'hit':                      // 내가 때린다
        this.noise({ dur: 0.07, freq: 1400 * r(), freqTo: 500, vol: 0.16, q: 0.8 });
        this.tone({ from: 320 * r(), to: 120, dur: 0.06, vol: 0.13, type: 'square' });
        break;

      case 'magic':                    // 마법으로 때린다
        this.tone({ from: 420 * r(), to: 980, dur: 0.15, vol: 0.13, type: 'sine', release: 0.12 });
        break;

      case 'throw':                    // 원거리
        this.tone({ from: 700 * r(), to: 260, dur: 0.12, vol: 0.1, type: 'triangle' });
        break;

      /* 내가 맞는다.
         처음엔 110→48Hz 로 만들었더니 "소리가 안 난다"는 말을 들었다.
         재생은 되고 있었지만 노트북 스피커는 150Hz 아래를 거의 못 낸다.
         그래서 중음대에 실체를 얹고 저음은 무게로만 남긴다. */
      case 'hurt':
        this.noise({ dur: 0.12, freq: 620 * r(), freqTo: 180, vol: 0.3, type: 'bandpass', q: 0.7 });
        this.tone({ from: 300 * r(), to: 120, dur: 0.13, vol: 0.24, type: 'square', release: 0.1 });
        this.tone({ from: 110, to: 60, dur: 0.18, vol: 0.16, type: 'sawtooth', release: 0.14 });
        break;

      case 'cast':                     // 적이 주문을 준비한다 — 지금 움직이라는 신호
        this.tone({ from: 300, to: 620, dur: 0.26, vol: 0.16, type: 'sine', release: 0.12 });
        this.tone({ from: 452, to: 930, dur: 0.26, vol: 0.09, type: 'triangle', release: 0.12 });
        break;

      case 'spell':                    // 그 주문이 나에게 꽂힌다
        this.tone({ from: 880 * r(), to: 220, dur: 0.2, vol: 0.24, type: 'sawtooth', release: 0.16 });
        this.noise({ dur: 0.16, freq: 1600, freqTo: 400, vol: 0.16, q: 1.4 });
        break;

      case 'miss':                     // 빗나갔다 — 피한 보람이 들려야 한다
        this.tone({ from: 700, to: 1500, dur: 0.13, vol: 0.1, type: 'sine', release: 0.1 });
        break;

      case 'fireball':                 // 불덩이가 날아간다
        this.noise({ dur: 0.22, freq: 340, freqTo: 1100, vol: 0.14, type: 'bandpass', q: 1.6 });
        this.tone({ from: 180, to: 520, dur: 0.2, vol: 0.12, type: 'sawtooth', release: 0.1 });
        break;

      case 'blast':                    // 그리고 터진다
        this.noise({ dur: 0.34, freq: 1200, freqTo: 140, vol: 0.3, type: 'bandpass', q: 0.5 });
        this.tone({ from: 320, to: 70, dur: 0.3, vol: 0.24, type: 'square', release: 0.24 });
        break;

      case 'key':                      // 열쇠를 주웠다
        this.tone({ from: 1046, to: 1046, dur: 0.05, vol: 0.12, type: 'triangle', release: 0.1 });
        setTimeout(() => this.ctx && this.tone({ from: 1568, to: 1568, dur: 0.08, vol: 0.11,
                                                 type: 'triangle', release: 0.2 }), 70);
        break;

      case 'unlock':                   // 문이 열린다
        this.noise({ dur: 0.12, freq: 2200, freqTo: 700, vol: 0.16, q: 2 });
        this.tone({ from: 180, to: 90, dur: 0.35, vol: 0.2, type: 'sawtooth', release: 0.3 });
        break;

      case 'kill':
        [440, 330, 220].forEach((f, i) => setTimeout(() => {
          if (this.ctx) this.tone({ from: f, to: f * 0.96, dur: 0.06, vol: 0.11, type: 'square' });
        }, i * 45));
        break;

      case 'gold':
        this.tone({ from: 880 * r(), to: 880, dur: 0.04, vol: 0.1, type: 'triangle', release: 0.06 });
        setTimeout(() => this.ctx && this.tone({ from: 1320, to: 1320, dur: 0.05, vol: 0.09,
                                                 type: 'triangle', release: 0.1 }), 55);
        break;

      case 'potion':
        this.tone({ from: 300, to: 760, dur: 0.18, vol: 0.12, type: 'sine', release: 0.14 });
        break;

      case 'gearCommon': this.chord([392, 523], { dur: 0.1, vol: 0.1, spread: 45 }); break;
      case 'gearFine':   this.chord([392, 523, 659], { dur: 0.14, vol: 0.11, spread: 50 }); break;
      case 'gearAncient':                          // 고대의 — 확실히 다르게 들려야 한다
        this.chord([330, 494, 659, 988], { dur: 0.5, vol: 0.12, spread: 70, release: 0.6 });
        break;

      case 'stairs':
        this.tone({ from: 160, to: 70, dur: 0.3, vol: 0.16, type: 'sawtooth', release: 0.3 });
        break;

      case 'camp':
        this.chord([220, 330], { dur: 0.5, vol: 0.1, release: 0.5 });
        break;

      case 'buy':
        this.tone({ from: 660, to: 990, dur: 0.07, vol: 0.11, type: 'square' });
        break;

      case 'ember':
        this.noise({ dur: 0.18, freq: 700, freqTo: 250, vol: 0.1, type: 'lowpass' });
        break;

      /* 보스 예고 — 화면을 안 보고 있어도 "피해야 한다"가 들려야 한다.
         그래서 협화음을 피하고(증4도), 다른 어떤 소리보다 크게 낸다. */
      case 'bossWarn':
        this.tone({ from: 233, to: 233, dur: 0.28, vol: 0.22, type: 'sawtooth', release: 0.1 });
        this.tone({ from: 330, to: 330, dur: 0.28, vol: 0.18, type: 'sawtooth', release: 0.1 });
        break;

      case 'bossHit':
        this.noise({ dur: 0.3, freq: 900, freqTo: 160, vol: 0.34, type: 'bandpass', q: 0.6 });
        this.tone({ from: 260, to: 70, dur: 0.32, vol: 0.3, type: 'square', release: 0.22 });
        this.tone({ from: 90, to: 45, dur: 0.4, vol: 0.2, type: 'sawtooth', release: 0.3 });
        break;

      case 'memory':                   // 기억을 되찾는 순간 — 커튼 연출에 얹힌다
        this.chord([523, 784, 1047], { dur: 0.9, vol: 0.13, spread: 130, release: 1.1 });
        break;

      case 'death':
        this.tone({ from: 420, to: 70, dur: 0.9, vol: 0.26, type: 'sawtooth', release: 0.5 });
        this.tone({ from: 210, to: 45, dur: 1.0, vol: 0.2, type: 'triangle', release: 0.6 });
        break;

      case 'endLight':                 // 밝은 화음 — 세상은 밝아진다
        this.chord([262, 330, 392, 523], { dur: 1.4, vol: 0.13, spread: 180, release: 1.6 });
        break;

      case 'endLeave':                 // 같은 자리에서 단조로 — 어둠은 그대로다
        this.chord([262, 311, 392, 466], { dur: 1.4, vol: 0.13, spread: 180, release: 1.6 });
        break;

      case 'burn':                     // 지지직 — 짧고 거칠게
        this.noise({ dur: 0.13, freq: 2200, freqTo: 700, vol: 0.16, type: 'bandpass', q: 1.4 });
        break;

      case 'level':                    // 올라가는 세 음 — 기억을 되찾는 소리와 헷갈리지 않게 더 짧고 밝게
        this.tone({ from: 392, to: 523, dur: 0.10, vol: 0.13, type: 'triangle', release: 0.10 });
        this.tone({ from: 523, to: 659, dur: 0.10, vol: 0.12, type: 'triangle', release: 0.14, delay: 0.07 });
        this.tone({ from: 659, to: 880, dur: 0.16, vol: 0.12, type: 'triangle', release: 0.26, delay: 0.14 });
        break;

      case 'ach':
        this.chord([784, 1047], { dur: 0.12, vol: 0.1, spread: 60, release: 0.2 });
        break;

      case 'ui':
        this.tone({ from: 520, to: 520, dur: 0.02, vol: 0.07, type: 'square', release: 0.03 });
        break;
    }
  },

  /* ---------- 배경 ----------
     음악이라기보다 공기. 낮은 드론 하나와 이따금 튀는 불씨 소리.
     층이 오를수록 드론이 낮아진다 — 조여드는 느낌이 공짜로 생긴다. */

  /* 옥상 바람.

     드론은 좁은 데서 조여드는 소리라 사방이 트인 옥상에는 안 맞는다.
     짧은 잡음을 반복 재생하면서 필터를 아주 느리게 흔든다 — 그게 바람으로 들린다. */
  startWind() {
    if (this.wind || !this.ctx) return;
    const len = Math.floor(this.ctx.sampleRate * 2);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    const src = this.ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 460; f.Q.value = 0.7;
    const g = this.ctx.createGain(); g.gain.value = 0.0001;
    src.connect(f); f.connect(g); g.connect(this.master);

    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine'; lfo.frequency.value = 0.09;      // 열 몇 초에 한 번 부는 결
    const amt = this.ctx.createGain(); amt.gain.value = 250;
    lfo.connect(amt); amt.connect(f.frequency);
    lfo.start(); src.start();
    g.gain.exponentialRampToValueAtTime(0.07, this.now() + 3);
    this.wind = { src, f, g, lfo };
  },

  stopWind() {
    if (!this.wind) return;
    const w = this.wind; this.wind = null;
    const t = this.now();
    w.g.gain.cancelScheduledValues(t);
    w.g.gain.setValueAtTime(Math.max(0.0001, w.g.gain.value), t);
    w.g.gain.exponentialRampToValueAtTime(0.0001, t + 1);
    setTimeout(() => { try { w.src.stop(); w.lfo.stop(); } catch (e) {} }, 1400);
  },

  setFloor(depth) {
    if (!this.ctx) return;
    const base = 58 * Math.pow(2, -(depth - 1) / 26);

    if (!this.drone) {
      const g = this.ctx.createGain();
      g.gain.value = 0.0001;
      g.connect(this.master);
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 240;
      f.connect(g);
      const a = this.ctx.createOscillator(); a.type = 'sawtooth';
      const b = this.ctx.createOscillator(); b.type = 'sine';
      // 처음 주파수를 바로 박아 둔다.
      // 안 그러면 오실레이터 기본값 440Hz 에서 미끄러져 내려오는 소리가 들린다.
      a.frequency.value = base;
      b.frequency.value = base * 1.503;
      a.connect(f); b.connect(f);
      a.start(); b.start();
      this.drone = { a, b, g, f };
      g.gain.exponentialRampToValueAtTime(0.05, this.now() + 2);
      this.startCrackle();
    }
    // 램프는 "직전에 예약된 값"에서 출발한다. .value 만 건드려 놓고 램프를 걸면
    // 출발점이 없어서 두 번째 층부터 아무 일도 일어나지 않는다.
    // 그래서 지금 값을 명시적으로 못박은 뒤 이어 붙인다.
    // 맨 위층은 밖이다. 드론을 접고 바람으로 갈아탄다.
    const roof = depth >= CFG.TOP_FLOOR;
    const t = this.now();
    if (roof) {
      this.startWind();
      const g = this.drone.g.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(Math.max(0.0001, g.value), t);
      g.exponentialRampToValueAtTime(0.0001, t + 2.5);
    } else {
      this.stopWind();
      const g = this.drone.g.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(Math.max(0.0001, g.value), t);
      g.exponentialRampToValueAtTime(0.05, t + 1.5);
    }

    this.droneHz = base;
    for (const [osc, mul] of [[this.drone.a, 1], [this.drone.b, 1.503]]) {   // 살짝 어긋나게
      const f = osc.frequency;
      f.cancelScheduledValues(t);
      f.setValueAtTime(f.value, t);
      f.exponentialRampToValueAtTime(base * mul, t + 1.5);
    }
  },

  startCrackle() {
    const tick = () => {
      if (!this.ctx) return;
      if (!this.muted && this.voices < 6) {
        this.noise({ dur: 0.05 + Math.random() * 0.06, freq: 900 + Math.random() * 1200,
                     freqTo: 300, vol: 0.03, type: 'bandpass', q: 2 });
      }
      this.crackleTimer = setTimeout(tick, 1800 + Math.random() * 4200);
    };
    this.crackleTimer = setTimeout(tick, 2000);
  },

  stopAmbience() {
    if (this.crackleTimer) clearTimeout(this.crackleTimer);
    if (this.drone) {
      this.drone.g.gain.exponentialRampToValueAtTime(0.0001, this.now() + 0.8);
    }
  },
};

// 같은 소리가 이 간격 안에 다시 나면 건너뛴다 (초)
const GAP = {
  step: 0.05, hit: 0.04, hurt: 0.05, magic: 0.05, gold: 0.06,
  kill: 0.06, bossWarn: 0.4, bossHit: 0.3, memory: 1, death: 1,
  cast: 0.12, spell: 0.1, miss: 0.15, fireball: 0.1, blast: 0.12, key: 0.2, unlock: 0.3,
};
