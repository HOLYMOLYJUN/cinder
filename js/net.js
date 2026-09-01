/* =========================================================
   net.js — 방 서버와의 연결. 화면은 하나도 모른다.

   여기서 다루는 것은 소켓 하나뿐이다 —
   붙이고, 끊기면 다시 붙이고, 봉투를 씌워 보내고, 열어서 나눠 준다.
   그린 것은 전부 chat.js 가 한다.

   ── 이 파일이 지키는 약속 ──
   연결이 안 되는 것은 오류가 아니다. NET.HOST 가 비어 있거나(배포 전),
   file:// 로 열었거나, 서버가 죽었어도 게임은 지금과 똑같이 돌아가야 한다.
   그래서 이 파일의 모든 함수는 꺼진 상태에서 조용히 아무것도 하지 않는다.

   PartySocket 을 쓰지 않은 이유 —
   그 패키지는 ESM/CJS 로만 나오고 UMD 빌드가 없다. 이 게임은 <script> 로
   전역 스크립트를 순서대로 읽고 build.js 가 그걸 통째로 이어붙이는 구조라,
   import 를 섞으면 아티팩트 단일 HTML 이 깨진다. 재접속은 아래 40줄이면 된다.
   ========================================================= */

const Net = {
  /* ---------- 상태 ---------- */
  ws: null,
  room: null,
  name: null,
  self: null,          // 서버가 준 내 연결 id — 내 말과 남의 말을 가른다
  peers: 0,
  status: 'off',       // off · connecting · open · retry
  wanted: false,       // 사용자가 "붙어 있어라"라고 했는가
  tries: 0,
  timers: { retry: 0, ping: 0, dead: 0 },
  handlers: {},

  /* ---------- 구독 ----------
     chat.js 가 여기에 붙는다. 'status' 는 이 파일이 스스로 쏘는 것이고,
     나머지는 서버가 보낸 봉투의 t 를 그대로 쓴다. */
  on(type, fn) {
    (this.handlers[type] || (this.handlers[type] = [])).push(fn);
  },

  emit(type, data) {
    const list = this.handlers[type];
    if (!list) return;
    for (const fn of list) {
      // 듣는 쪽이 터져도 소켓은 계속 살아 있어야 한다
      try { fn(data); } catch (e) { console.error('[net]', type, e); }
    }
  },

  /* ---------- 켜져 있는가 ----------
     배포 전에는 NET.HOST 가 비어 있다. 그때는 채팅 자체가 없는 것으로 친다. */
  enabled() {
    // CHAT 이 꺼져 있으면 소켓 자체를 열지 않는다. 흔적은 소켓이 아니라
    // 그냥 HTTP 라서 이것과 무관하게 계속 돈다.
    return !!(typeof NET !== 'undefined' && NET.HOST && NET.CHAT !== false);
  },

  /* 방 이름은 URL 의 일부가 된다. 사람이 불러 줄 수 있는 글자만 남긴다. */
  cleanRoom(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32);
  },

  cleanName(s) {
    return String(s || '').replace(/\s+/g, ' ').trim().slice(0, NET.MAX_NAME);
  },

  url() {
    // https → wss, http → ws. 로컬 개발 주소도 그대로 통한다.
    const base = NET.HOST.replace(/\/+$/, '').replace(/^http/, 'ws');
    return base + '/parties/' + NET.PARTY + '/' + this.room;
  },

  /* ---------- 붙기 ---------- */
  connect(room, name) {
    if (!this.enabled()) return false;

    const r = this.cleanRoom(room);
    if (!r) return false;

    this.room = r;
    this.name = this.cleanName(name) || '누군가';
    this.wanted = true;
    this.tries = 0;
    this.open();
    return true;
  },

  open() {
    if (!this.wanted || !this.enabled()) return;
    this.close(false);

    this.setStatus('connecting');
    let ws;
    try {
      ws = new WebSocket(this.url());
    } catch (e) {
      // 주소가 틀렸거나 file:// 에서 열었다 — 다시 시도해도 같다
      this.setStatus('off');
      this.emit('fail', { reason: 'url' });
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      if (this.ws !== ws) return;              // 이미 갈아탄 소켓
      this.tries = 0;
      this.setStatus('open');
      this.beat();
    };

    ws.onmessage = ev => {
      if (this.ws !== ws) return;
      this.alive();                            // 뭐라도 왔으면 살아 있는 것
      let m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (!m || m.v !== NET.PROTO) return;     // 다른 판 번호는 조용히 버린다

      if (m.t === 'pong') return;
      if (m.t === 'hello') {
        this.self = m.you;
        this.peers = 1;
      }
      if (m.t === 'presence') this.peers = m.count;

      this.emit(m.t, m);
    };

    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.stopBeat();
      if (this.wanted) this.retry();
      else this.setStatus('off');
    };

    // onerror 뒤에는 언제나 onclose 가 온다. 재시도는 거기 한 곳에서만 건다.
    ws.onerror = () => {};
  },

  /* ---------- 다시 붙기 ----------
     지수 백오프에 흔들림(jitter)을 섞는다. 두 사람이 같은 순간에 끊겼을 때
     똑같은 간격으로 동시에 두드리면 서로를 밀어낸다. */
  retry() {
    this.setStatus('retry');
    clearTimeout(this.timers.retry);

    const step = Math.min(NET.RETRY_BASE * Math.pow(2, this.tries), NET.RETRY_MAX);
    const wait = step * (0.75 + Math.random() * 0.5);
    this.tries++;

    this.timers.retry = setTimeout(() => this.open(), wait);
  },

  /* ---------- 심장박동 ----------
     중간의 무엇이든 조용한 연결을 끊어 버린다. 주기적으로 한 마디 보내고,
     한참 아무것도 안 오면 살아 있다고 우기지 말고 스스로 끊는다.
     (소켓이 "열림"인 채로 죽어 있는 것이 제일 고약하다 — 끊긴 줄도 모른다) */
  beat() {
    this.stopBeat();
    this.timers.ping = setInterval(() => this.send({ t: 'ping' }), NET.PING_MS);
    this.alive();
  },

  alive() {
    clearTimeout(this.timers.dead);
    this.timers.dead = setTimeout(() => {
      if (this.ws) this.ws.close();            // onclose 가 재시도를 건다
    }, NET.DEAD_MS);
  },

  stopBeat() {
    clearInterval(this.timers.ping);
    clearTimeout(this.timers.dead);
  },

  /* ---------- 보내기 ---------- */
  send(obj) {
    const ws = this.ws;
    if (!ws || ws.readyState !== 1) return false;
    try {
      ws.send(JSON.stringify(Object.assign({ v: NET.PROTO }, obj)));
      return true;
    } catch (e) { return false; }
  },

  say(text) {
    const t = String(text || '').trim().slice(0, NET.MAX_TEXT);
    if (!t) return false;
    return this.send({ t: 'chat', name: this.name, text: t });
  },

  /* ---------- 끊기 ---------- */
  close(forget) {
    if (forget !== false) this.wanted = false;
    clearTimeout(this.timers.retry);
    this.stopBeat();
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
      try { ws.close(); } catch (e) {}
    }
    if (forget !== false) {
      this.self = null;
      this.peers = 0;
      this.setStatus('off');
    }
  },

  setStatus(s) {
    if (this.status === s) return;
    this.status = s;
    this.emit('status', { status: s, peers: this.peers });
  },

  /* ---------- 깨어남 ----------
     폰에서 화면을 껐다 켜면 소켓은 이미 죽어 있는데 onclose 가 늦게 오거나
     아예 안 온다. 돌아왔을 때 한 번 찔러 보고, 죽었으면 바로 다시 붙는다. */
  init() {
    if (typeof window === 'undefined') return;

    const poke = () => {
      if (!this.wanted) return;
      if (!this.ws || this.ws.readyState > 1) {
        this.tries = 0;                        // 사람이 돌아왔으니 기다리게 하지 않는다
        clearTimeout(this.timers.retry);
        this.open();
      }
    };

    window.addEventListener('online', poke);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) poke();
    });
    window.addEventListener('pagehide', () => this.close(false));
  },
};
