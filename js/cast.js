/* =========================================================
   cast.js — 방송과 관전

   새로 만든 것이 거의 없다. resume.js 가 이미 판 하나를 몇 KB 로 접고 있었고
   render.js 는 state 를 보고 그리므로, **접은 것을 소켓으로 흘려보내고
   받은 쪽이 자기 state 에 펼치면** 그게 곧 관전이다.
   전송 포맷을 따로 만들지 않은 이유이자, 이 파일이 짧은 이유다.

   ── 지키는 것 두 가지 ──
   1. 남의 판이 내 판을 덮지 않는다. 관전은 전역 state 를 통째로 갈아치우므로,
      받았다고 바로 들어가지 않고 반드시 사람이 «보기»를 눌러야 시작한다.
      내 판은 그동안 localStorage 에 그대로 있고(관전 중에는 저장이 걸리지 않는다),
      관전을 끝내면 그 자리에서 이어진다.
   2. 관전 중에는 아무것도 보내지 않는다. packRun() 이 state.spectating 을 보고
      스스로 물러서므로, 남의 판을 내 이름으로 다시 방송하는 일이 없다.
   ========================================================= */

const Cast = {
  on: false,           // 내가 방송 중인가
  watching: null,      // 보고 있는 사람의 연결 id
  watchName: '',
  first: true,         // 이번 관전의 첫 장인가 (창을 열고 로그를 비울 것인가)
  /* 아래 둘은 나중에야 값이 붙지만 여기 적어 둔다. 안 적으면 콘솔에서
     Cast.offer 가 undefined 로 나와, "아직 안 왔다"인지 "그런 것이 없다"인지
     구분이 안 된다 — 붙는지 안 붙는지 볼 때 제일 먼저 두드리는 자리다. */
  offer: null,         // 도착한 방송 부름 (아직 «보기» 를 안 누른 것)
  hadRun: false,       // 관전을 시작할 때 내 하던 판이 있었는가
  el: {},

  /* 매 턴 그대로 내보내면 방향키를 누르고 있을 때 초당 여러 장이 나간다.
     한 장이 4KB 남짓이라 금세 낭비가 된다. 대신 마지막 것을 반드시 보낸다 —
     조이느라 마지막 장을 흘리면 관전 화면이 한 턴 뒤처진 채로 멈춘다. */
  MIN_GAP: 250,
  lastSent: 0,
  pending: null,
  timer: 0,

  init() {
    const $ = id => document.getElementById(id);
    this.el = {
      bar: $('cast-bar'), text: $('cast-text'),
      go: $('cast-go'), stop: $('cast-stop'),
      toggle: $('chat-cast'),
    };
    if (!this.el.bar) return;

    /* 확성기가 꺼져 있으면 관전도 없다. 방송을 켜는 버튼이 확성기 창 안에 있고,
       볼 사람과 붙는 길도 그 소켓이라 반쪽만 살릴 수가 없다.
       (흔적은 소켓을 안 쓰므로 이것과 상관없이 돈다) */
    if (!Net.enabled()) return;

    Net.on('state', m => this.gotState(m));
    Net.on('over', m => this.gotOver(m));
    Net.on('status', s => { if (s.status !== 'open') this.roomGone(); });

    if (this.el.go) this.el.go.addEventListener('click', () => this.watch());
    if (this.el.stop) this.el.stop.addEventListener('click', () => this.unwatch());
    if (this.el.toggle) this.el.toggle.addEventListener('click', () => this.toggleCast());
  },

  /* ---------- 방송 ---------- */

  toggleCast() {
    if (this.on) { this.stopCast(); return; }
    if (Net.status !== 'open') { Chat.system('방에 들어간 뒤에 켤 수 있습니다.'); return; }
    if (state.spectating) { Chat.system('관전 중에는 방송할 수 없습니다.'); return; }
    this.on = true;
    this.paint();
    Chat.system('방송을 켰습니다. 같은 방 사람이 내 판을 볼 수 있습니다.');
    saveRun();                      // 지금 상태를 한 장 바로 보낸다
  },

  stopCast() {
    this.on = false;
    clearTimeout(this.timer);
    this.pending = null;
    this.paint();
    Chat.system('방송을 껐습니다.');
  },

  // resume.js 의 saveRun() 이 부른다. 방송 중이 아니면 아무 일도 하지 않는다.
  push(blob) {
    if (!this.on || typeof Net === 'undefined' || Net.status !== 'open') return;

    const gap = Date.now() - this.lastSent;
    if (gap >= this.MIN_GAP) { this.flush(blob); return; }

    // 너무 이르다 — 들고 있다가 시간이 되면 그때의 마지막 것을 보낸다
    this.pending = blob;
    if (!this.timer) {
      this.timer = setTimeout(() => {
        this.timer = 0;
        const b = this.pending;
        this.pending = null;
        if (b) this.flush(b);
      }, this.MIN_GAP - gap);
    }
  },

  flush(blob) {
    this.lastSent = Date.now();
    Net.send({ t: 'state', name: Net.name, blob: blob });
  },

  // 판이 끝났다. 스냅샷은 살아 있을 때만 나가므로 이것까지 보내야
  // 관전자 화면이 마지막으로 살아있던 순간에 멈춰 있지 않는다.
  over(reachedTop) {
    if (!this.on || Net.status !== 'open') return;
    clearTimeout(this.timer);
    this.timer = 0;
    this.pending = null;
    Net.send({ t: 'over', name: Net.name, top: !!reachedTop, depth: state.depth });
  },

  /* ---------- 관전 ---------- */

  gotState(m) {
    if (this.on) return;                       // 내가 방송 중이면 남의 판에 끌려가지 않는다
    if (!m.blob) return;

    if (this.watching === m.id) { this.apply(m.blob); return; }
    if (this.watching) return;                 // 다른 사람 것은 지금 보지 않는다

    // 아직 아무도 안 보는 중 — 들어갈지 말지는 사람이 정한다
    this.offer = m;
    this.paint();
  },

  // «보기» 를 눌렀을 때 비로소 남의 판이 내 화면에 들어온다
  watch() {
    const m = this.offer;
    if (!m) return;
    this.offer = null;
    this.watching = m.id;
    this.watchName = m.name || '누군가';
    this.first = true;
    state.spectating = true;

    /* 내 판은 localStorage 에 그대로 있다. 관전 중에는 packRun 이 물러서므로
       덮어쓰이지 않고, 그만두면 그 자리에서 이어진다. */
    this.hadRun = !!savedRun();
    this.apply(m.blob);
    UI.log(this.watchName + ' 님의 판을 봅니다. 「관전 그만」 을 누르면 돌아옵니다.', 'sys');
  },

  apply(blob) {
    loadRun(blob, { spectate: true, quiet: !this.first });
    this.first = false;
    this.paint();
  },

  gotOver(m) {
    if (this.watching !== m.id) return;
    UI.log(this.watchName + ' 님의 판이 끝났습니다 — ' +
      (m.top ? '탑의 끝에 닿았습니다.' : (m.depth || '?') + '층에서 쓰러졌습니다.'), 'hurt');
    this.paint();
  },

  unwatch() {
    if (!this.watching) return;
    this.watching = null;
    this.watchName = '';
    state.spectating = false;
    setHeroOverride(null);          // 내 사람으로 돌아온다

    // 하던 판이 있으면 그 자리에서, 없으면 첫 화면으로
    if (this.hadRun && resumeRun()) UI.log('내 판으로 돌아왔습니다.', 'sys');
    else { state.running = false; UI.clearLog(); UI.showTitle(); }
    this.paint();
  },

  // 방에서 떨어지면 관전도 끝난다 — 다음 장이 올 리가 없다
  roomGone() {
    this.offer = null;
    if (this.on) this.stopCast();
    if (this.watching) this.unwatch();
    this.paint();
  },

  /* ---------- 띠 ---------- */

  paint() {
    const bar = this.el.bar;
    if (!bar) return;

    if (this.el.toggle) {
      this.el.toggle.textContent = this.on ? '방송 끄기' : '방송 시작';
      this.el.toggle.classList.toggle('warn', this.on);
    }

    let show = true;
    if (this.watching) {
      this.el.text.textContent = this.watchName + ' 님의 판을 보는 중';
      this.el.go.classList.add('hidden');
      this.el.stop.classList.remove('hidden');
    } else if (this.offer) {
      this.el.text.textContent = (this.offer.name || '누군가') + ' 님이 방송 중입니다';
      this.el.go.classList.remove('hidden');
      this.el.stop.classList.add('hidden');
    } else if (this.on) {
      this.el.text.textContent = '방송 중';
      this.el.go.classList.add('hidden');
      this.el.stop.classList.add('hidden');
    } else {
      show = false;
    }
    bar.classList.toggle('hidden', !show);

    /* 화면들은 inset:0 으로 겹쳐 놓은 것이라 띠가 흐름에서 밀어내지 못한다.
       띠가 뜬 만큼 안쪽을 내려 준다 — 안 그러면 하트 줄을 덮는다. */
    const app = document.getElementById('app');
    if (app) app.classList.toggle('has-cast', show);
  },
};
