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

  /* 방 이름이 곧 열쇠다. 링크로 건네므로 외울 필요가 없고, 그래서 길어도 된다.
     앞의 단어는 사람이 "아 그 방" 하고 알아보라고 붙인 꼬리표일 뿐이다. */
  WORDS: ['ember', 'ash', 'torch', 'cinder', 'dusk', 'soot', 'flint', 'kiln'],

  /* 헷갈리는 l·1·o·0 을 뺀 32글자. 32 가 256 을 나누어떨어지므로
     바이트를 그냥 나머지 연산해도 한쪽으로 치우치지 않는다. */
  ALPHA: 'abcdefghijkmnpqrstuvwxyz23456789',

  /* Math.random 을 쓰지 않는다. 이 게임의 난수는 던전을 만드는 것이고
     이건 열쇠를 만드는 것이다 — 예측 가능한 난수로 열쇠를 깎으면 안 된다. */
  token(n) {
    const out = [];
    const cr = window.crypto;
    if (cr && cr.getRandomValues) {
      const b = new Uint8Array(n);
      cr.getRandomValues(b);
      for (let i = 0; i < n; i++) out.push(this.ALPHA[b[i] % this.ALPHA.length]);
    } else {
      // 아주 오래된 브라우저. 없느니 낫다.
      for (let i = 0; i < n; i++) {
        out.push(this.ALPHA[Math.floor(Math.random() * this.ALPHA.length)]);
      }
    }
    return out.join('');
  },

  newRoom() {
    return choice(this.WORDS) + '-' + this.token(8);   // 8.8조 가지
  },

  /* ---------- 링크 ----------
     방 이름을 주소의 해시에 담는다. `?r=` 가 아니라 `#r=` 인 이유는
     해시가 서버로 전송되지 않기 때문이다 — 물음표로 넣으면 방 이름이
     정적 호스팅의 접근 로그에 그대로 남는다. 열쇠 노릇을 하는 값을 로그에 남길 이유가 없다.
     (같은 이유로 바깥으로 나가는 Referer 에도 안 실린다) */
  roomFromHash() {
    const m = String(location.hash || '').match(/[#&]r=([A-Za-z0-9-]{1,32})/);
    return m ? Net.cleanRoom(m[1]) : '';   // 걸러내는 규칙은 Net 한 곳에만 둔다
  },

  link() {
    return location.origin + location.pathname + '#r=' + Net.room;
  },

  // 주소창 자체가 곧 초대장이 되도록. 뒤로 가기 기록은 늘리지 않는다.
  setHash(room) {
    try { history.replaceState(null, '', location.pathname + '#r=' + room); } catch (e) {}
  },

  clearHash() {
    try { history.replaceState(null, '', location.pathname); } catch (e) {}
  },

  copyLink() {
    const url = this.link();
    const show = () => {
      this.el.linkBox.classList.remove('hidden');
      this.el.linkBox.value = url;
      this.el.linkBox.select();
      this.system('복사가 막혔습니다. 위 주소를 직접 복사하세요.');
    };
    // 클립보드는 https 나 localhost 에서만 열린다. 막히면 직접 고르게 한다.
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(url).then(
        () => this.system('링크를 복사했습니다. 친구에게 보내세요.'), show);
    } else show();
  },

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
      copy:  $('chat-copy'), linkBox: $('chat-link'),
    };
    if (!this.el.panel) return;

    /* 배포 전(NET.HOST 가 빔)이거나 file:// 로 연 경우에는
       이 기능이 아예 없는 것처럼 둔다. 안 되는 버튼을 보여 주는 것이
       없는 것보다 나쁘다. */
    if (!Net.enabled()) return;

    this.ready = true;
    this.el.tab.classList.remove('hidden');

    const saved = this.restore() || {};
    const invited = this.roomFromHash();          // 링크를 타고 들어온 경우

    this.el.name.value = saved.name || '';
    this.el.room.value = invited || saved.room || '';

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
      this.el.room.value = this.newRoom();
    });
    this.el.copy.addEventListener('click', () => this.copyLink());

    /* 같은 탭에 다른 초대 링크를 붙여 넣었을 때. 새로고침 없이 그 방으로 옮겨 간다. */
    window.addEventListener('hashchange', () => {
      const r = this.roomFromHash();
      if (r && r !== Net.room) {
        this.el.room.value = r;
        this.join();
      }
    });
    this.el.leave.addEventListener('click', () => {
      Net.close();
      this.clearHash();     // 스스로 나간 것이므로 주소의 초대장도 거둔다.
      this.toJoin();        // (그냥 끊긴 것과 달라서 toJoin 에 넣지 않았다 —
    });                     //  링크로 들어와 아직 별명을 못 넣은 사람의 해시를 지우면 안 된다)

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

    /* 링크를 타고 왔으면 그 방이 우선이다. 다만 별명이 없으면 바로 넣지 않는다 —
       이름도 모르는 채로 남의 방에 떨어뜨려 놓으면 "누구세요"가 된다.
       그때는 방만 채워 두고 별명 칸에 커서를 둔다. */
    if (invited) {
      if (saved.name) this.join();
      else { this.show(true); this.el.name.focus(); }
    } else if (saved.joined && saved.room && saved.name) {
      // 지난번에 들어가 본 방이 있으면 알아서 다시 붙는다
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
    const raw = this.el.room.value.trim();

    /* 비워 둔 채로 들어가면 아무도 모르는 새 방이 열린다.
       여기에 기본값을 두면 — 플레이스홀더든 상수든 — 아무 생각 없이 누른 사람들이
       전부 같은 방에서 만난다. 적어 두지 않은 이름이 곧 아무나 들어올 수 있는 이름이다.
       다만 뭔가 치기는 했는데 걸러내고 나니 빈 것은 다른 얘기다 —
       그건 오타이므로 조용히 딴 방을 파 주는 대신 말해 준다. */
    let room;
    if (!raw) {
      room = this.newRoom();
    } else {
      room = Net.cleanRoom(raw);
      if (!room) { this.system('방 이름은 영문·숫자·붙임표만 됩니다.'); return; }
    }

    if (!Net.connect(room, name)) {
      this.system('방에 들어가지 못했습니다.');
      return;
    }
    this.store({ name: Net.name, room: Net.room, joined: true });
    this.el.name.value = Net.name;
    this.el.room.value = Net.room;
    this.setHash(Net.room);          // 주소창 자체가 초대장이 된다
    this.el.linkBox.classList.add('hidden');
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
    this.el.linkBox.classList.add('hidden');
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
