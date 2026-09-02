/* =========================================================
   shell.js — 앱 껍데기 안에서만 필요한 것들

   웹에서는 이 파일이 거의 아무 일도 하지 않는다. 브라우저에는 뒤로가기 버튼이
   따로 없고 노치도 없기 때문이다. 앱(Capacitor)으로 감쌌을 때만 깨어난다.

   ── 뒤로가기를 History 로 다루는 이유 ──
   Capacitor 의 App 플러그인으로 잡는 방법도 있지만, 그러면 브라우저에서
   시험할 수가 없어서 「폰에 올려 봐야 아는 코드」가 된다.
   대신 없는 페이지를 하나 밀어 넣고 popstate 로 받는다 —
   안드로이드 뒤로가기는 웹뷰에서 곧 히스토리 뒤로이므로 그대로 걸리고,
   브라우저에서도 똑같이 걸려서 검사를 쓸 수 있다.
   진짜 「앱 종료」만 플러그인이 필요하고, 그건 없으면 그냥 안 한다.

   ── 웹에서는 걸지 않는다 ──
   앱에서 뒤로가기는 「창을 닫는 것」이어야 한다. 홈으로 나가 버리면 안 되니까.
   웹에서는 반대다 — 뒤로가기를 누른 사람은 오던 데로 돌아갈 줄 알고 누른다.
   같은 동작이 한쪽에서는 안전장치고 다른 쪽에서는 덫이라, 앱에서만 건다.

   ── 무엇을 닫고 무엇을 안 닫는가 ──
   Esc 가 하는 것과 똑같이 군다. 손과 키가 다른 데로 가면 안 된다.
   모닥불·동행·결말은 **닫는 키가 없는 것이 의도**이므로 뒤로가기도 아무 일을 안 한다 —
   불 앞에서 아무것도 안 하고 지나갈 수 있으면 그건 선택이 아니라 무시해도 되는 창이 된다.
   대장장이만 그 창을 빌려 쓰면서 나갈 수 있고(`UI.campCanLeave()`), 폰에는 Esc 가
   없으므로 **뒤로가기가 거기서 유일한 나갈 길**이다.
   ========================================================= */

const Shell = {
  MARK: 'cinder-back',      // 밀어 넣은 가짜 페이지의 표
  EXIT_MS: 2000,            // 이 안에 한 번 더 누르면 나간다
  lastBack: 0,

  native() {
    try {
      return !!(window.Capacitor && typeof Capacitor.isNativePlatform === 'function'
        && Capacitor.isNativePlatform());
    } catch (e) { return false; }
  },

  // 플러그인은 있으면 쓰고 없으면 만다. 없다고 게임이 멈추면 안 된다.
  plugin(name) {
    try { return (window.Capacitor && Capacitor.Plugins && Capacitor.Plugins[name]) || null; }
    catch (e) { return null; }
  },

  /* 앱일 때만 켠다.

     브라우저에서도 켜면 뒤로가기가 사이트를 뜨는 대신 게임 창부터 닫는다.
     앱에서는 그게 맞지만(홈으로 나가 버리면 안 되니까) 웹에서는 아니다 —
     여기까지 온 사람은 뒤로가기로 오던 데로 돌아갈 줄 알고 누른다.
     같은 동작이 한쪽에서는 안전장치고 다른 쪽에서는 덫이 된다.

     검사는 armBack() 을 직접 부른다. 브라우저에서 시험할 수 있게 History 로
     짠 것이라, 자동으로 안 걸린다고 시험까지 못 하게 되면 뜻이 없다. */
  init() {
    if (!this.native()) return;
    document.documentElement.classList.add('in-app');
    this.paintStatusBar();
    this.armBack();
  },

  /* 상태바를 배경과 같은 어둠으로 맞춘다. 안 맞추면 게임 위에 밝은 띠가 하나 뜬다.
     화면은 그 아래까지 쓰고(안쪽 여백은 CSS 의 safe-area 가 준다). */
  paintStatusBar() {
    const bar = this.plugin('StatusBar');
    if (!bar) return;
    try {
      bar.setOverlaysWebView({ overlay: true });
      bar.setStyle({ style: 'DARK' });        // 어두운 바탕 → 밝은 글자
      bar.setBackgroundColor({ color: '#0C0A08' });
    } catch (e) { /* 늙은 껍데기. 그냥 둔다 */ }
  },

  armBack() {
    if (typeof history === 'undefined' || !history.pushState) return;
    this.push();
    window.addEventListener('popstate', () => {
      if (this.back()) this.exit();
      else this.push();               // 아직 나갈 때가 아니면 가짜 페이지를 다시 깐다
    });
  },

  push() {
    try { history.pushState({ [this.MARK]: true }, ''); } catch (e) {}
  },

  /* 눌렀을 때 무엇을 할지. 「이제 나가야 한다」면 true 를 돌려준다.

     순서는 onKeyDown 의 순서를 그대로 따른다 — 위에 있는 창일수록 먼저 닫힌다. */
  back() {
    // 되짚기·크레딧이 흐르는 중이면 빨리 감는다 (건너뛰지는 않는다)
    if (typeof Story !== 'undefined' && Story.open()) { Story.setFast(true); return false; }
    if (UI.creditsOpen()) {
      if (UI.creditsRolling()) UI.creditsFast(true);
      else UI.hideCredits();
      return false;
    }

    if (UI.codexOpen()) { UI.hideCodex(); return false; }

    // 장비 비교창은 그냥 닫으면 안 된다. Esc 와 같이 「그대로 두기」로 끝낸다.
    if (UI.bagOpen && UI.bagOpen()) { UI.hideBag(); return false; }

    if (UI.shopOpen()) { UI.hideShop(); return false; }

    /* 모닥불과 동행은 닫는 길이 없는 것이 의도다 — 불 앞에서 아무것도 안 하고
       지나갈 수 없어야 그게 선택이 된다. 결말도 마찬가지다.

       대장장이는 상인이지 관문이 아니다. 살 것이 없으면 나갈 수 있어야 한다 —
       삼켜 버리면 골드가 없을 때 창에 갇혀 판이 멈춘다.
       (예전에는 모닥불 창을 빌려 써서 campCanLeave 로 갈랐는데,
        지금은 제 창이 따로 있다) */
    if (UI.forgeOpen && UI.forgeOpen()) { UI.hideForge(); return false; }
    if (UI.campOpen()) {
      if (UI.campCanLeave()) UI.hideCamp();
      return false;
    }
    if (UI.endingOpen()) return false;

    if (UI.intro.active) { UI.skipIntro(); return false; }

    if (typeof Chat !== 'undefined' && Chat.open) { Chat.show(false); return false; }
    if (state.spectating) { Cast.unwatch(); return false; }

    /* 판을 하는 중이면 한 번에 안 나간다. 실수로 한 번 눌러서 판이 닫히면
       (이어하기가 있어도) 그건 그냥 사고다. 두 번 눌러야 나간다. */
    if (state.running) {
      const now = Date.now();
      if (now - this.lastBack < this.EXIT_MS) return true;
      this.lastBack = now;
      UI.toast('한 번 더 누르면 나갑니다', '하던 층은 저장되어 있습니다');
      return false;
    }

    return true;      // 타이틀·결과 화면 — 나가도 잃을 것이 없다
  },

  exit() {
    const app = this.plugin('App');
    if (app && app.exitApp) { try { app.exitApp(); return; } catch (e) {} }
    // 브라우저에서는 나갈 데가 없다. 가짜 페이지만 다시 깔아 둔다.
    this.push();
  },
};
