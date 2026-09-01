/* =========================================================
   marks.js — 층에 남는 흔적 (죽은 자리 · 벽의 쪽지)

   확성기와 관전은 둘 다 「동시에 두 명」이 있어야 쓸모가 생긴다.
   혼자 하는 게임에서 그런 순간은 거의 안 온다. 흔적은 비동기라
   **아무도 접속해 있지 않아도 남이 지나간 자리가 내 판에 남아 있다.**
   이 게임에 서버가 있어서 얻는 것 중 값이 제일 큰 자리가 여기다.

   그리고 세계관과 정확히 맞물린다 — 이 탑은 원래
   「이름을 적으면 그 사람이 올라갔고, 아무도 내려오지 않았다」는 곳이다.
   남의 시체가 층에 쌓여 있는 것이 설정 그 자체다.

   NET.HOST 가 비면 통째로 없는 기능처럼 군다 (확성기와 같은 규칙).
   ========================================================= */

/* ---------- 쪽지 문구 ----------

   자유 입력은 하지 않는다. 낯선 사람의 글이 남의 화면에 뜨는 순간
   욕설·광고·스포일러를 전부 감당해야 한다.

   다크소울처럼 **틀에 낱말을 끼운다.** 서버에는 문장이 아니라 번호 둘만 간다 —
   그래서 검열할 것이 아예 없고, 나중에 다른 말로 옮길 때도 여기만 고치면 된다.

   조사는 josa() 가 맞춘다. 「불을 잊지 마라」/「적을 잊지 마라」가 저절로 갈린다. */
const NOTE_WORDS = [
  '함정', '적', '불', '어둠', '계단', '문',
  '길', '물약', '보물', '죽음', '뒤', '위',
];

const NOTE_FORMS = [
  { id: 0, make: w => w + ' 조심' },
  { id: 1, make: w => josa(w, '이', '가') + ' 있다' },
  { id: 2, make: w => josa(w, '은', '는') + ' 없다' },
  { id: 3, make: w => '여기서 ' + w },
  { id: 4, make: w => w + ' 쪽으로' },
  { id: 5, make: w => josa(w, '을', '를') + ' 잊지 마라' },
];

function noteText(a, b) {
  const form = NOTE_FORMS[a] || NOTE_FORMS[0];
  const word = NOTE_WORDS[b] || NOTE_WORDS[0];
  return form.make(word);
}

const Marks = {
  list: [],            // 이 층의 흔적
  uid: '',             // 내가 누구인지 (기기 하나에 하나)
  wroteThisFloor: false,
  nodded: null,        // 이번 판에 끄덕인 것들
  pending: null,       // 쪽지 쓰는 중 — { step, word }

  /* 파일로 열었으면(file://) 통째로 없는 기능이다.
     그 경우 Origin 이 null 이라 서버가 어차피 거절하고, 브라우저는 그것을
     CORS 오류로 콘솔에 쏟는다 — 더블클릭으로 열어도 멀쩡해야 하는 게임에서
     콘솔이 빨개지는 것은 「꺼진 것」이 아니라 「고장 난 것」으로 읽힌다.
     확성기가 NET.HOST 로 꺼지는 것과 같은 자리다. */
  on() {
    if (typeof NET === 'undefined' || !NET.HOST) return false;
    const p = location.protocol;
    return p === 'http:' || p === 'https:';
  },

  init() {
    this.nodded = new Set();
    try {
      let id = localStorage.getItem('jaetbul.uid');
      if (!id) {
        /* 이름이 아니라 표다. 던전을 만드는 난수가 아니라 열쇠를 만드는 난수를 쓴다 —
           방 이름과 같은 이유다(js/net.js 참고). */
        const b = new Uint8Array(9);
        crypto.getRandomValues(b);
        id = [...b].map(v => v.toString(36)).join('').slice(0, 12);
        localStorage.setItem('jaetbul.uid', id);
      }
      this.uid = id;
    } catch (e) { this.uid = ''; }
  },

  who() {
    try {
      const c = JSON.parse(localStorage.getItem('jaetbul.chat.v1') || '{}');
      return (c && c.name) || '누군가';
    } catch (e) { return '누군가'; }
  },

  url(p) { return NET.HOST.replace(/\/+$/, '') + '/marks' + p; },

  /* 층에 들어설 때 한 번. 못 받아도 게임은 그대로 돈다 —
     서버가 꺼져 있다고 판이 멈추면 그건 없는 편이 나은 기능이다.

     날짜가 열쇠에 들어간다. 탑이 매일 새로 서므로 어제의 좌표는 오늘
     지형에서 아무 뜻도 없다 — 날짜를 안 섞으면 흔적이 벽 속에 박힌다.
     대신 아침마다 층이 비므로, 길잡이는 서버가 아니라 이쪽에서 채운다. */
  async enterFloor(depth, map) {
    this.list = Guide.forFloor(depth, state.day, map);
    this.wroteThisFloor = false;
    if (!this.on()) return;
    try {
      const r = await fetch(this.url('/floor/' + state.day + '/' + depth +
                                     '?uid=' + encodeURIComponent(this.uid)));
      if (!r.ok) return;
      const d = await r.json();
      if (d && Array.isArray(d.marks)) this.list = this.list.concat(d.marks);
    } catch (e) { /* 조용히 없던 일로 */ }
  },

  at(x, y) {
    return this.list.find(m => m.x === x && m.y === y) || null;
  },

  /* 벽 쪽지는 그 벽에 손이 닿는 자리에서 읽힌다 — 맞닿은 네 칸 어디서든.
     쓰는 쪽이 네 방향 벽에 다 긁을 수 있으므로 읽는 쪽도 같아야 한다.
     한쪽만 넓히면 남길 수는 있는데 아무도 못 읽는 쪽지가 생긴다. */
  noteNear(x, y) {
    return this.list.find(m => m.kind === 'note' &&
                               Math.abs(m.x - x) + Math.abs(m.y - y) === 1) || null;
  },

  text(m) { return noteText(m.a, m.b); },

  async add(kind, x, y, extra) {
    if (!this.on() || !this.uid) return;
    const body = Object.assign({
      v: 1, uid: this.uid, kind: kind, day: state.day, floor: state.depth,
      x: x, y: y, by: this.who(),
    }, extra || {});
    try {
      await fetch(this.url('/add'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (e) { /* 남기지 못해도 판은 계속된다 */ }
  },

  async nod(m) {
    if (!m || m.mine || this.nodded.has(m.id)) return false;
    this.nodded.add(m.id);
    m.nods = (m.nods || 0) + 1;
    // 길잡이는 탑이 남긴 말이라 서버에 셀 것이 없다. 끄덕임은 화면에서만 산다.
    if (!this.on() || m.guide) return true;
    try {
      await fetch(this.url('/nod'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ v: 1, uid: this.uid, day: state.day, floor: state.depth, id: m.id }),
      });
    } catch (e) {}
    return true;
  },

  /* 내가 남긴 말을 몇 명이 읽었는가. 타이틀에서 한 번 부른다.
     접속해 있지도 않은 사람과 이어져 있다는 느낌은 이 숫자 하나가 만든다. */
  async myNods() {
    if (!this.on() || !this.uid) return 0;
    try {
      const r = await fetch(this.url('/nods?uid=' + encodeURIComponent(this.uid)));
      if (!r.ok) return 0;
      const d = await r.json();
      return Number(d && d.nods) || 0;
    } catch (e) { return 0; }
  },
};
