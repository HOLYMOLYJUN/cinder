/* =========================================================
   chat.js — 확성기. 친구와 같은 방에서 한 줄씩 주고받는 창.

   net.js 가 소켓을 맡고, 이 파일은 그리는 것만 맡는다.

   ── 이 창이 지키는 세 가지 ──
   1. 받은 글자는 언제나 textContent 로만 넣는다. innerHTML 로 넣는 순간
      상대가 보낸 한 줄이 그대로 스크립트가 된다.
   2. 입력칸에 포커스가 있으면 게임 키가 먹지 않아야 한다.
      안 그러면 "wasd"라고 치는 동안 캐릭터가 네 칸 움직이고 물약을 마신다.
   3. 한글 조합 중(isComposing)에는 Enter 를 보내지 않는다.
      "안녕"의 'ㅕ'를 고르는 Enter 가 문장을 반토막 내서 날려 버린다.
   ========================================================= */

const Chat = {
  el: {},
  ready: false,
  open: false,
  unread: 0,
  lines: 0,

  /* 방 이름은 친구에게 말로 불러 줘야 한다. 읽어 주기 쉬운 것만 쓴다. */
  WORDS: ['ember', 'ash', 'torch', 'cinder', 'dusk', 'soot', 'flint', 'kiln'],

  /* ---------- 저장 ----------
     기억(save)·이어하기(run)와 수명이 다르므로 칸을 따로 쓴다.
     여기 들어가는 것은 별명과 마지막 방뿐이다. */
  store(v) {
    try { localStorage.setItem(NET.KEY, JSON.stringify(v)); } catch (e) {}
  },

  restore() {
    try {
      const raw = localStorage.getItem(NET.KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  },

  /* ---------- 게임 키를 막아야 하는가 ----------
     이 게임에서 글자를 받는 칸은 확성기뿐이다. 그래서 판정이 이만큼 단순해도 된다.
     game.js 의 onKeyDown 맨 앞이 이걸 보고 물러선다. */
  typing() {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA';
  },

  /* ---------- 시작 ---------- */
  init() {
    const $ = id => document.getElementById(id);
    this.el = {
      panel: $('chat'),      tab:   $('chat-tab'),
      dot:   $('chat-dot'),  where: $('chat-where'),
      close: $('chat-close'),
      join:  $('chat-join'), live:  $('chat-live'),
      name:  $('chat-name'), room:  $('chat-room'),
      enter: $('chat-enter'), dice: $('chat-dice'),
      leave: $('chat-leave'),
      lines: $('chat-lines'),
      form:  $('chat-form'), text:  $('chat-text'),
      badge: $('chat-badge'),
    };
    if (!this.el.panel) return;

    /* 배포 전(NET.HOST 가 빔)이거나 file:// 로 연 경우에는
       이 기능이 아예 없는 것처럼 둔다. 안 되는 버튼을 보여 주는 것이
       없는 것보다 나쁘다. */
    if (!Net.enabled()) return;

    this.ready = true;
    this.el.tab.classList.remove('hidden');

    const saved = this.restore() || {};
    this.el.name.value = saved.name || '';
    this.el.room.value = saved.room || '';

    /* ---------- 소켓에서 오는 것 ---------- */
    Net.on('status', s => this.paintStatus(s.status));
    Net.on('hello', m => {
      this.toLive();
      this.clear();
      for (const line of m.history || []) this.push(line);
      this.system('「' + m.room + '」 방에 들어왔습니다.');
    });
    Net.on('chat', m => this.push(m));
    Net.on('system', m => this.system(m.text));
    Net.on('presence', m => this.paintStatus(Net.status));
    Net.on('error', m => {
      if (m.reason === 'rate') this.system('너무 빠릅니다. 잠깐 쉬었다 보내세요.');
    });
    Net.on('fail', () => this.system('주소가 잘못되었거나 연결할 수 없습니다.'));

    /* ---------- 버튼 ---------- */
    this.el.tab.addEventListener('click', () => this.show(true));
    this.el.close.addEventListener('click', () => this.show(false));
    this.el.enter.addEventListener('click', () => this.join());
    this.el.dice.addEventListener('click', () => {
      this.el.room.value = choice(this.WORDS) + '-' + randInt(1000, 9999);
    });
    this.el.leave.addEventListener('click', () => {
      Net.close();
      this.toJoin();
    });

    // 방 이름 칸에서 Enter 로도 들어가진다
    this.el.room.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); this.join(); }
    });

    this.el.form.addEventListener('submit', e => { e.preventDefault(); this.send(); });

    this.el.text.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      // 한글 조합 중의 Enter 는 글자를 고르는 것이지 보내라는 뜻이 아니다.
      // isComposing 을 안 보는 브라우저를 위해 keyCode 229 도 같이 본다.
      if (e.isComposing || e.keyCode === 229) return;
      e.preventDefault();
      this.send();
    });

    /* 버튼에 포커스가 남으면 Space 가 그 버튼을 다시 누르면서
       게임에서는 한 턴을 흘려 보낸다. 누른 뒤에는 포커스를 놓는다. */
    for (const b of this.el.panel.querySelectorAll('button')) {
      b.addEventListener('click', () => b.blur());
    }

    // 지난번에 들어가 본 방이 있으면 알아서 다시 붙는다
    if (saved.joined && saved.room && saved.name) {
      Net.connect(saved.room, saved.name);
    }
    this.paintStatus(Net.status);
  },

  /* ---------- 여닫기 ---------- */
  show(v) {
    if (!this.ready) return;
    this.open = v;
    this.el.panel.classList.toggle('hidden', !v);
    this.el.tab.classList.toggle('hidden', v);
    if (v) {
      this.unread = 0;
      this.paintBadge();
      const box = Net.status === 'off' ? this.el.room : this.el.text;
      if (box && box.offsetParent) box.focus();
      this.scroll();
    }
  },

  toggle() { this.show(!this.open); },

  join() {
    const name = this.el.name.value;
    const room = this.el.room.value;
    if (!Net.connect(room, name)) {
      this.system('방 이름은 영문·숫자·붙임표만 됩니다.');
      return;
    }
    this.store({ name: Net.name, room: Net.room, joined: true });
    this.el.name.value = Net.name;
    this.el.room.value = Net.room;
  },

  send() {
    const t = this.el.text.value;
    if (!t.trim()) return;
    if (!Net.say(t)) { this.system('아직 연결되지 않았습니다.'); return; }
    this.el.text.value = '';
  },

  toLive() {
    this.el.join.classList.add('hidden');
    this.el.live.classList.remove('hidden');
  },

  toJoin() {
    this.el.live.classList.add('hidden');
    this.el.join.classList.remove('hidden');
    this.clear();
    const saved = this.restore() || {};
    this.store({ name: saved.name, room: saved.room, joined: false });
  },

  /* ---------- 그리기 ---------- */
  clear() {
    this.el.lines.innerHTML = '';
    this.lines = 0;
  },

  atBottom() {
    const b = this.el.lines;
    return b.scrollHeight - b.scrollTop - b.clientHeight < 40;
  },

  scroll() {
    this.el.lines.scrollTop = this.el.lines.scrollHeight;
  },

  add(node) {
    const stick = this.atBottom();
    this.el.lines.appendChild(node);
    this.lines++;
    // 오래 켜 두면 끝없이 쌓인다. 서버가 들고 있는 만큼만 남긴다.
    while (this.el.lines.children.length > 80) {
      this.el.lines.removeChild(this.el.lines.firstChild);
    }
    if (stick) this.scroll();
  },

  push(m) {
    const row = document.createElement('div');
    row.className = 'chat-line' + (m.id && m.id === Net.self ? ' mine' : '');

    const who = document.createElement('b');
    who.textContent = m.name;                 // 남이 보낸 글자다. 절대 innerHTML 이 아니다.

    const say = document.createElement('span');
    say.textContent = m.text;

    row.appendChild(who);
    row.appendChild(say);
    this.add(row);

    if (!this.open && m.id !== Net.self) { this.unread++; this.paintBadge(); }
  },

  system(text) {
    if (!this.ready) return;
    const row = document.createElement('div');
    row.className = 'chat-line sys';
    row.textContent = text;
    this.add(row);
  },

  paintBadge() {
    const b = this.el.badge;
    if (!b) return;
    b.textContent = this.unread > 9 ? '9+' : String(this.unread);
    b.classList.toggle('hidden', this.unread === 0);
  },

  paintStatus(s) {
    const words = {
      off:        ['꺼짐', ''],
      connecting: ['붙는 중', 'wait'],
      retry:      ['다시 붙는 중', 'wait'],
      open:       [Net.peers > 1 ? '둘 이상' : '나 혼자', 'on'],
    };
    const [label, cls] = words[s] || words.off;
    this.el.where.textContent = s === 'open' && Net.room
      ? Net.room + ' · ' + label
      : label;
    this.el.dot.className = 'chat-dot ' + cls;

    if (s === 'off') this.toJoin();
  },
};
