/* =========================================================
   capacitor.config.js — 안드로이드 껍데기 설정

   게임은 그대로 두고 이것만 씌운다. `dist/app/index.html` 한 장이
   그림·소리까지 전부 안고 있으므로 웹뷰가 파일 하나만 열면 끝이고,
   비행기 안에서도 돈다 (흔적만 인터넷이 있을 때 붙는다).
   ========================================================= */

module.exports = {
  /* ⚠️ 한 번 스토어에 올리면 영원히 못 바꾼다.
     같은 이름으로 다른 앱을 낼 수도 없고, 바꾸려면 새 앱으로 처음부터다.
     올리기 전에 이 줄만은 다시 한 번 보라. */
  appId: 'com.holymolyjun.cinder',

  // 폰 홈 화면에 뜨는 이름. 이건 나중에 바꿔도 된다.
  appName: '잿불',

  /* build.js --app 이 뱉는 자리. 여기 있는 것을 통째로 앱 안에 넣는다.
     아티팩트용 dist/jaetbul.html 과 다른 파일이다 — 그쪽은 확성기가 꺼져 있고
     <head> 도 없다. */
  webDir: 'dist/app',

  /* 첫 프레임이 그려지기 전의 바탕색. 기본값인 흰색으로 두면
     앱을 열 때마다 어두운 게임 앞에 흰 화면이 한 번 번쩍인다. */
  backgroundColor: '#0C0A08',

  android: {
    backgroundColor: '#0C0A08',

    /* 웹뷰 안에서 링크를 눌렀을 때 앱 안에서 열지 말고 브라우저로 넘긴다.
       게임 안의 링크는 전부 바깥 것(에셋 출처 같은)이라 앱 안에서 열리면
       뒤로 나올 길이 없다. */
    allowMixedContent: false,
  },

  server: {
    // https 로 서빙해야 localStorage 와 crypto.getRandomValues 가 제 노릇을 한다
    androidScheme: 'https',
  },
};
