/* =========================================================
   ui.js — HUD, 로그, 층 진입 연출, 결과 화면
   ========================================================= */

const UI = {
  el: {},

  init() {
    const $ = id => document.getElementById(id);
    this.el = {
      title:    $('title-screen'),
      game:     $('game-screen'),
      intro:    $('floor-intro'),
      introFloor: $('intro-floor'),
      introLine:  $('intro-line'),
      introHint:  $('intro-hint'),
      result:   $('result-screen'),
      resultTitle: $('result-title'),
      resultLine:  $('result-line'),
      resultStats: $('result-stats'),
      bagModal:  $('bag-modal'),
      bagPanel:  $('bag-panel'),
      bagSlots:  $('bag-slots'),
      bagEquip:   $('bag-equip'),
      equipSlots: $('equip-slots'),
      bagDetail: $('bag-detail'),
      gearStrip: $('gear-strip'),
      shopModal: $('shop-modal'),
      shopList:  $('shop-list'),
      shopGold:  $('shop-gold'),
      shopSay:   $('shop-say'),
      log:      $('log'),
      hpText:   $('hp-text'),
      floor:    $('stat-floor'),
      tag:      $('stat-tag'),
      level:    $('stat-level'),
      xpFill:   $('xp-fill'),
      lvChip:   $('lv-chip'),
      potion:   $('stat-potion'),
      gold:     $('stat-gold'),
      record:   $('best-record'),
    };
  },

  /* ---------- 로그 ---------- */
  log(msg, cls) {
    const d = document.createElement('div');
    if (cls) d.className = cls;
    d.textContent = msg;
    this.el.log.appendChild(d);
    while (this.el.log.children.length > 60) this.el.log.removeChild(this.el.log.firstChild);
    this.el.log.scrollTop = this.el.log.scrollHeight;
  },

  clearLog() { this.el.log.innerHTML = ''; },

  /* ---------- HUD ---------- */

  // 체력은 하트로 보여준다. 막대보다 로그라이크답고,
  // 한 칸이 몇 점인지 몸에 익으면 숫자를 안 읽어도 위험한지 알 수 있다.
  HEART: 6,
  /* 하트가 몇 개까지 늘어나도 되는가.
     최대 체력은 레벨·반지·재·셋으로 계속 자라는데 한 칸을 6점으로 못 박아 두면
     후반에 스무 개가 넘어간다. 좁은 화면에서는 그게 여러 줄로 접히면서
     HUD 가 아래를 밀어내고, 로그가 한 줄로 눌린다.
     그래서 개수를 묶고 대신 한 칸의 값을 키운다 — 숫자는 옆에 그대로 있다. */
  HEART_MAX: 12,

  // 이 판에서 하트 한 칸이 몇 점인가
  heartUnit(maxHp) {
    return Math.max(this.HEART, Math.ceil(maxHp / this.HEART_MAX));
  },

  updateHearts(p) {
    const box = document.getElementById('hearts');
    if (!box || typeof SPRITES === 'undefined' || !SPRITES.heartFull) return;
    const unit = this.heartUnit(p.maxHp);
    const total = Math.max(1, Math.ceil(p.maxHp / unit));

    // 최대 체력이 바뀔 때만 다시 짓는다 (매 턴 새로 만들면 깜빡인다)
    if (box.childElementCount !== total) {
      box.innerHTML = '';
      for (let i = 0; i < total; i++) {
        const im = document.createElement('img');
        im.className = 'heart';
        box.appendChild(im);
      }
    }
    for (let i = 0; i < total; i++) {
      /* 마지막 칸은 한 칸을 다 못 채우는 경우가 있다 (50 = 8칸 + 2).
         그때도 한 칸으로 그리면, 가득 찬 상태인데 반 칸으로 보인다 —
         칸의 크기를 남은 만큼으로 잡아야 「가득」이 가득으로 그려진다. */
      const cap = Math.min(unit, p.maxHp - i * unit);
      const v = clamp(p.hp - i * unit, 0, cap);
      const key = v >= cap * 0.75 ? 'heartFull'
                : v >= cap * 0.25 ? 'heartHalf' : 'heartEmpty';
      const src = SPRITES[key].f[0];
      if (box.children[i].src !== src) box.children[i].src = src;
    }
  },

  paintIcons() {
    if (typeof SPRITES === 'undefined') return;
    const set = (id, key) => {
      const el = document.getElementById(id);
      if (el && SPRITES[key]) el.style.backgroundImage = `url(${SPRITES[key].f[0]})`;
    };
    set('ico-potion', 'potion');
    set('ico-gold', 'coin');
  },

  updateHud(state) {
    const p = state.player;
    this.updateHearts(p);
    this.el.hpText.textContent = Math.max(0, p.hp) + ' / ' + p.maxHp;
    this.el.floor.textContent = state.depth;
    this.updateFloorTag(state);
    this.updateLevel(state);
    this.el.potion.textContent = state.potions;
    this.el.gold.textContent = state.gold;
    this.updateGearStrip(p);
    this.updateBossBar(state);
  },

  /* 이 층의 성격을 층수 옆에 남긴다.

     진입 문구는 한 번 흐르고 사라진다. 그런데 「어둠」인 층에서 시야가 좁은 것을
     세 방쯤 지나면 잊어버리고, 그러면 그건 성격이 아니라 그냥 이상한 층이 된다.
     머무는 내내 보이면 「아 이 층이 그래서 그렇지」가 되고, 그때부터 판단에 쓰인다.

     성격 없는 층에서는 아예 감춘다 — 「없음」이라고 적어 두면 그 자리가
     늘 차 있어서, 있을 때의 눈에 띔이 사라진다. */
  updateFloorTag(state) {
    const el = this.el.tag;
    if (!el) return;
    const t = state.floorTag;
    const name = t && t.id && typeof FLOOR_TAG_NAME !== 'undefined' ? FLOOR_TAG_NAME[t.id] : '';
    el.textContent = name || '';
    el.classList.toggle('hidden', !name);
  },

  updateLevel(state) {
    const lv = state.level || 1;
    if (this.el.level.textContent !== String(lv)) {
      this.el.level.textContent = lv;
      // 껐다 켜야 같은 애니메이션이 다시 돈다
      this.el.lvChip.classList.remove('up');
      void this.el.lvChip.offsetWidth;
      this.el.lvChip.classList.add('up');
    }
    const need = LV.need(lv);
    const pct = lv >= LV.MAX ? 100 : clamp((state.xp || 0) / need, 0, 1) * 100;
    this.el.xpFill.style.width = pct + '%';
  },

  updateBossBar(state) {
    const bar = document.getElementById('boss-bar');
    const b = state.boss;
    // 한 번이라도 마주친 뒤에만 보여준다 — 층에 들어서자마자 알려주면 긴장이 없다
    if (!b || !b.alive || !b.seen) { bar.classList.add('hidden'); return; }
    bar.classList.remove('hidden');
    document.getElementById('boss-name').textContent = b.name;
    document.getElementById('boss-fill').style.width =
      clamp(b.hp / b.maxHp, 0, 1) * 100 + '%';
  },

  /* ---------- 모닥불 선택 ----------
     안식처가 회복소이기만 하면 밟는 것 말고 할 일이 없다.
     같은 자리에서 무엇을 얻을지 고르게 하면 판마다 다른 길이 난다. */
  /* canLeave — 아무것도 안 고르고 나갈 수 있는가.
     모닥불과 동행은 못 나간다(고르는 것이 그 자리의 전부다). 대장장이는 나갈 수 있다 —
     상인이지 관문이 아니다. 이걸 안 갈랐더니 골드가 없을 때 창에 갇혔다. */
  showCamp(options, onPick, say, title, canLeave) {
    const box = document.getElementById('camp-choices');
    // 쪽지도 이 창을 빌려 쓴다. 제목까지 빌리면 벽에 긁는 창에 「모닥불」이라고 뜬다
    document.getElementById('camp-title').textContent = title || '모닥불';
    this._campLeave = !!canLeave;
    document.getElementById('camp-say').textContent =
      say || '불이 아직 살아 있습니다. 무엇에 쓰겠습니까.';
    box.innerHTML = '';

    /* 모닥불은 셋이라 큼직한 카드가 어울리지만, 쪽지 낱말은 열둘이다.
       같은 틀로 그리면 화면 밖으로 넘쳐서 아래가 잘린다.
       설명줄이 없는 짧은 것이 여럿이면 격자로 눕힌다 — 고르는 창이지
       읽는 창이 아니므로 한눈에 다 보이는 편이 낫다. */
    const compact = options.length > 4 && options.every(o => !o.desc);
    // 낱말(「함정」)과 문장(「함정을 잊지 마라」)은 같은 폭을 쓸 수 없다.
    // 좁은 화면에서 문장을 낱말 칸에 넣으면 뒤가 잘려서 무엇을 고르는지 모르게 된다.
    const wide = compact && options.some(o => String(o.name).length > 6);
    box.className = 'ending-choices' + (compact ? ' camp-grid' : '') + (wide ? ' wide' : '');

    options.forEach((o, i) => {
      const b = document.createElement('button');
      b.className = 'ending-pick' + (o.disabled ? ' locked' : '');
      // 숫자키는 아홉까지다. 없는 키를 적어 두면 눌러 보고 안 되는 것보다 나쁘다
      const key = i < 9 ? ` <span class="k">${i + 1}</span>` : '';
      b.innerHTML = `<b>${o.name}${key}</b>` + (o.desc ? `<span>${o.desc}</span>` : '');
      if (o.disabled) b.disabled = true;
      else b.addEventListener('click', () => onPick(o.id));
      box.appendChild(b);
    });
    this._campPick = onPick;
    this._campOptions = options;
    document.getElementById('camp-modal').classList.remove('hidden');
  },
  /* ---------- 대장장이 ----------
     상인과 같은 부류의 자리라 같은 틀을 쓴다. 자리 넷이 가로로 눕는다 —
     목록이 아니라 몸이라, 몸은 한눈에 들어와야 한다. */
  showForge(cards, gold, onPick) {
    document.getElementById('forge-gold').textContent = gold;

    // 머리글의 망치 — 쇠망치 도트를 그대로 빌린다. 대장간에 망치보다 맞는 그림이 없다.
    const hammer = document.getElementById('forge-hammer');
    const hs = typeof SPRITES !== 'undefined' && SPRITES['gear.쇠망치'];
    if (hammer && hs) hammer.src = hs.f[0]; else if (hammer) hammer.hidden = true;

    const grid = document.getElementById('forge-grid');
    grid.innerHTML = '';
    cards.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'forge-card' + (c.empty ? ' empty' : '');
      b.disabled = !!c.disabled;

      let ico = '<span class="ico"></span>';
      if (c.gear) {
        const src = this.gearIcon(c.gear);
        if (src) ico = `<span class="ico"><img style="${this.iconStyle(c.gear, 30, 2)}" src="${src}" alt=""></span>`;
        else ico = '<span class="ico">?</span>';
      }
      const name = c.gear && !c.gear.unknown
        ? `<span class="nm r-${c.gear.rarity}">${gearFullName(c.gear)}</span>`
        : `<span class="nm">${c.name || '비어 있음'}</span>`;

      b.innerHTML =
        ico +
        `<span class="slot">${c.label}<span class="k">${i + 1}</span></span>` +
        name +
        `<span class="sub">${c.sub || ''}</span>` +
        `<span class="price">${c.price != null ? c.price + ' G' : ''}</span>`;
      if (!c.disabled) b.addEventListener('click', () => onPick(c.id));
      grid.appendChild(b);
    });

    this._forgePick = onPick;
    this._forgeCards = cards;
    document.getElementById('forge-modal').classList.remove('hidden');
  },
  hideForge() { document.getElementById('forge-modal').classList.add('hidden'); },
  forgeOpen() { return !document.getElementById('forge-modal').classList.contains('hidden'); },
  forgePickIndex(i) {
    const c = this._forgeCards && this._forgeCards[i];
    if (c && !c.disabled && this._forgePick) this._forgePick(c.id);
  },

  hideCamp() { document.getElementById('camp-modal').classList.add('hidden'); },
  campOpen() { return !document.getElementById('camp-modal').classList.contains('hidden'); },
  campCanLeave() { return !!this._campLeave; },
  // 숫자키로도 고를 수 있게 — 상점과 같은 조작이다
  campPickIndex(i) {
    const o = this._campOptions && this._campOptions[i];
    if (o && !o.disabled && this._campPick) this._campPick(o.id);
  },

  /* ---------- 크레딧 ----------

     혼자 만든 것이라 모든 자리에 같은 이름이 들어간다. 그게 농담이면서 사실이라,
     굳이 줄이지 않고 그대로 늘어놓는다 — 줄이면 농담이 아니라 그냥 짧은 목록이 된다.

     흐르는 시간은 글 길이로 정한다. 화면 높이가 기기마다 다른데 초를 박아 두면
     좁은 화면에서는 끝나기 전에 멈추고 넓은 화면에서는 한참 빈 채로 흐른다. */
  CREDITS: [
    { big: 'Cinder' },
    { sub: '잿불' },
    { gap: 1 },

    { role: 'Game Design',        who: 'Lee Sangjun' },
    { role: 'Programming',        who: 'Lee Sangjun' },
    { role: 'Level Design',       who: 'Lee Sangjun' },
    { role: 'Combat Balancing',   who: 'Lee Sangjun' },
    { role: 'Writing',            who: 'Lee Sangjun' },
    { role: 'Sound Design',       who: 'Lee Sangjun' },
    { role: 'UI / UX',            who: 'Lee Sangjun' },
    { role: 'Quality Assurance',  who: 'Lee Sangjun' },
    { role: 'Producer',           who: 'Lee Sangjun' },
    { role: 'Special Thanks',     who: 'Lee Sangjun' },
    { gap: 1 },
    { note: 'A game by one person, who kept giving himself notes.' },
    { gap: 2 },

    { head: 'Art' },
    { line: '0x72 — Dungeon Tileset II (CC0)' },
    { line: 'nijikokun — Extended pack (CC0)' },
    { line: '0x72 — Sewers (CC0)' },
    { line: 'Armour, trinkets and the dragon drawn for this game' },
    { gap: 2 },

    { head: 'Sound' },
    { line: 'Synthesised at runtime with Web Audio.' },
    { line: 'No audio files were used.' },
    { gap: 2 },

    { head: 'Built with' },
    { line: 'Plain HTML, CSS and JavaScript. No framework.' },
    { line: 'One file, if you want it that way.' },
    { gap: 3 },

    { note: 'Thank you for climbing.' },
    { gap: 1 },
  ],

  showCredits(onDone) {
    const box = document.getElementById('credits-roll');
    box.innerHTML = this.CREDITS.map(r => {
      if (r.gap)  return `<div class="cr-gap" style="height:${r.gap * 40}px"></div>`;
      if (r.big)  return `<div class="cr-big">${r.big}</div>`;
      if (r.sub)  return `<div class="cr-sub">${r.sub}</div>`;
      if (r.head) return `<div class="cr-head">${r.head}</div>`;
      if (r.note) return `<div class="cr-note">${r.note}</div>`;
      if (r.line) return `<div class="cr-line">${r.line}</div>`;
      return `<div class="cr-row"><b>${r.role}</b><span>${r.who}</span></div>`;
    }).join('');

    const screen = document.getElementById('credits-screen');
    const close = document.getElementById('credits-close');
    const hint = document.getElementById('credits-hint');
    screen.classList.remove('hidden');
    close.classList.add('hidden');
    hint.classList.remove('hidden');
    this._creditsDone = onDone || null;

    /* 건너뛰기는 한 번 본 사람에게만. 되짚기와 같은 규칙이다 —
       처음 보는 사람에게 내밀면 「넘겨도 되는 것」으로 먼저 읽힌다.
       끝으로 감는 것이므로 「돌아간다」가 그 자리에 뜬다. */
    const skip = document.getElementById('credits-skip');
    if (skip) {
      const seen = !!((loadData() || {}).sawCredits);
      skip.classList.toggle('hidden', !seen);
      skip.onclick = () => this.endCredits();
    }

    /* CSS 애니메이션이 아니라 직접 굴린다.
       누르고 있는 동안 빨라져야 하는데, 애니메이션은 도중에 속도를 바꾸면
       진행한 만큼을 잃고 처음부터 다시 흐른다. 위치를 우리가 들고 있으면
       배속만 곱하면 되고, 어디까지 흘렀는지도 그대로 남는다. */
    const view = screen.querySelector('.credits-view').clientHeight;
    this._creditDist = box.scrollHeight + view;
    this._creditPos = 0;
    this._creditFast = false;
    box.style.animation = 'none';
    box.style.transform = 'translateY(0)';

    cancelAnimationFrame(this._creditRaf);
    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      this._creditPos += this.CREDIT_SPEED * (this._creditFast ? 6 : 1) * dt;
      if (this._creditPos >= this._creditDist) { this.endCredits(); return; }
      box.style.transform = `translateY(${-this._creditPos}px)`;
      this._creditRaf = requestAnimationFrame(tick);
    };
    this._creditRaf = requestAnimationFrame(tick);
  },

  CREDIT_SPEED: 46,          // 평소 흐르는 속도 (초당 픽셀)

  // 누르고 있는 동안만 빨라진다. 건너뛰는 게 아니라 감는 것이라
  // 지나간 이름은 그대로 다 지나간다.
  creditsFast(on) {
    if (this.creditsRolling()) this._creditFast = !!on;
  },

  // 끝까지 흘렀을 때 — 멈추고 돌아갈 길을 연다
  endCredits() {
    cancelAnimationFrame(this._creditRaf);
    this._creditRaf = 0;
    this._creditFast = false;
    const box = document.getElementById('credits-roll');
    box.style.animation = 'none';
    box.style.transform = 'translateY(0)';
    document.getElementById('credits-close').classList.remove('hidden');
    document.getElementById('credits-hint').classList.add('hidden');
    const skip = document.getElementById('credits-skip');
    if (skip) skip.classList.add('hidden');
    // 건너뛰어서 끝났어도 「봤다」로 친다 (되짚기와 같은 이유)
    try {
      const save = loadData() || {};
      if (!save.sawCredits) { save.sawCredits = true; saveData(save); }
    } catch (e) {}
  },

  hideCredits() {
    cancelAnimationFrame(this._creditRaf);
    this._creditRaf = 0;
    document.getElementById('credits-screen').classList.add('hidden');
    const done = this._creditsDone;
    this._creditsDone = null;
    if (done) done();
  },

  creditsOpen() {
    return !document.getElementById('credits-screen').classList.contains('hidden');
  },
  creditsRolling() {
    return this.creditsOpen() && !!this._creditRaf;
  },

  /* ---------- 결말 ---------- */
  showEnding() { document.getElementById('ending-screen').classList.remove('hidden'); },
  hideEnding() { document.getElementById('ending-screen').classList.add('hidden'); },
  endingOpen() { return !document.getElementById('ending-screen').classList.contains('hidden'); },

  /* ---------- 장착 중인 장비 ---------- */
  updateGearStrip(player) {
    const parts = SLOTS.map(slot => {
      const g = player.gear[slot];
      if (!g) return `<span class="g-slot"><i>${SLOT_NAME[slot]}</i><b class="g-empty">없음</b></span>`;
      const c = RARITY[g.rarity].color;
      const ic = this.gearIcon(g);
      // 그림이 있을 때만 라벨에 g-lab 을 단다. 좁은 화면에서 이것만 숨겨
      // 자리를 벌기 위해서다 — 빈 슬롯과 능력치는 라벨이 사라지면 안 읽힌다.
      return `<span class="g-slot"><i${ic ? ' class="g-lab"' : ''}>${SLOT_NAME[slot]}</i>` +
             (ic ? `<img class="g-ico" src="${ic}" alt="">` : '') +
             `<b style="color:${c}">${gearFullName(g)}</b></span>`;
    });
    /* 갖춰 입은 것 — 몇 조각인지 보여야 「하나만 더」가 생긴다.
       한 조각뿐이면 안 적는다. 그건 아직 셋이 아니라 그냥 장비다. */
    for (const [k, n] of Object.entries(wornSets(player))) {
      if (n < 2) continue;
      const s = SETS[k];
      parts.push(`<span class="g-slot g-set"><i>${s.name}</i>` +
                 `<b>${n}/${s.pieces.length}</b></span>`);
    }
    // 곁에 있는 것 — 스탯이 왜 그런지 설명하는 자리라 능력치 옆에 둔다
    if (typeof PET !== 'undefined' && PET.has()) {
      const d = PET.current();
      parts.push(`<span class="g-slot"><i>동행</i><b style="color:var(--ember)">${d.name}</b></span>`);
    }
    const s = player.stats;
    parts.push(`<span class="g-slot"><i>공${s.atk} 주${s.sp} 방${s.def} 마${s.md} 속${s.spd}</i></span>`);
    this.el.gearStrip.innerHTML = parts.join('');
  },

  /* ---------- 가방 ----------

     주운 것은 여기로 들어오고, 낄지는 여기서 정한다.

     왼쪽에 몸(자리 다섯), 오른쪽에 가방. 몸이 먼저 읽혀야 가방의 물건을
     견줄 수 있다 — 「지금 무엇을 끼고 있나」를 모르면 +3 이 좋은 건지 모른다.

     칸을 두드리면 아래에 그 물건의 값이 뜨고, 거기서 끼거나 버린다.
     두 번 두드려 바로 끼게 할 수도 있었지만, 그러면 실수로 저주받은 것을
     끼는 일이 생긴다 — 한 번 더 묻는 자리를 둔다. */
  showBag(onEquip, onUnequip, onDrop) {
    /* 판 그림. 다른 그림들과 같은 자리(sprites.js)에서 온다 — 앱 한 장에서도 뜬다.
       크기도 그림이 정하게 둔다: aspect-ratio 를 여기서 박아야 CSS 와
       tools/make-inventory.js 의 숫자가 갈라질 일이 없다. */
    const put = (el, key, box) => {
      const s = typeof SPRITES !== 'undefined' && SPRITES[key];
      if (s) el.style.backgroundImage = 'url(' + s.f[0] + ')';
      el.style.aspectRatio = box.w + ' / ' + box.h;
    };
    put(this.el.bagEquip, 'ui.equip', BAG_UI.equip);
    put(this.el.bagPanel, 'ui.bag', BAG_UI.bag);

    this._bagPick = null;
    this._bagHandlers = { equip: onEquip, unequip: onUnequip, drop: onDrop };
    this.paintBag();
    this.el.bagModal.classList.remove('hidden');
  },

  paintBag() {
    const p = state.player;
    const bag = state.bag || [];
    const eqBox = this.el.equipSlots, bagBox = this.el.bagSlots;
    eqBox.innerHTML = ''; bagBox.innerHTML = '';

    /* 판 그림 위에 칸을 얹는다. 자리는 tools/make-inventory.js 가 그림과 함께
       내놓은 것(BAG_UI)이라, 그림을 고치면 좌표도 같이 바뀐다 — 둘이 갈라질
       수가 없다. 판이 몇 배로 커지든 %로 놓으므로 그대로 따라간다. */
    const place = (el, panel, x, y, w, h) => {
      el.style.left   = (x / panel.w * 100) + '%';
      el.style.top    = (y / panel.h * 100) + '%';
      el.style.width  = ((w || BAG_UI.cell) / panel.w * 100) + '%';
      el.style.height = ((h || BAG_UI.cell) / panel.h * 100) + '%';
    };

    /* ---- 서 있는 모습 ----
       입은 칸과 든 칸 사이가 비어 있었다. 거기에 지금 모습을 세우면
       「무기」가 글자가 아니라 손에 든 것으로 보인다 — 던전에서도
       같은 자세로 그려지므로 갈아끼기 전에 미리 보는 셈이 된다. */
    const body = BAG_UI.equip.body;
    if (body) {
      const cv = document.createElement('canvas');
      cv.className = 'bag-body';
      cv.width = body.w * 3; cv.height = body.h * 3;   // 판이 확대되어 뜨므로 넉넉히
      place(cv, BAG_UI.equip, body.x, body.y, body.w, body.h);
      eqBox.appendChild(cv);
      this._bagBody = cv;
      this.tickBagBody();
    }

    // ---- 입은 것 · 든 것 ----
    BAG_UI.equip.worn.forEach(s => {
      const g = p.gear[s.id];
      const b = document.createElement('button');
      b.className = 'bag-cell' +
        (this._bagPick && this._bagPick.where === 'worn' && this._bagPick.slot === s.id ? ' on' : '');
      b.title = SLOT_NAME[s.id];
      b.dataset.slot = s.id;
      const ic = g ? this.gearIcon(g) : null;
      if (ic) b.innerHTML = `<img style="${this.iconStyle(g, BAG_UI.cell - 3, 1)}" src="${ic}" alt="">`;
      place(b, BAG_UI.equip, s.x, s.y);
      b.addEventListener('click', () => { this._bagPick = { where: 'worn', slot: s.id }; this.paintBag(); });
      eqBox.appendChild(b);
    });

    // ---- 가방 ----
    BAG_UI.bag.cells.forEach((s, i) => {
      const g = bag[i];
      const b = document.createElement('button');
      b.className = 'bag-cell' +
        (this._bagPick && this._bagPick.where === 'bag' && this._bagPick.i === i ? ' on' : '');
      b.dataset.bag = i;
      if (g) {
        const ic = this.gearIcon(g);
        b.innerHTML = ic ? `<img style="${this.iconStyle(g, BAG_UI.cell - 3, 1)}" src="${ic}" alt="">`
                         : '<span class="q">?</span>';
        b.addEventListener('click', () => { this._bagPick = { where: 'bag', i }; this.paintBag(); });
      }
      place(b, BAG_UI.bag, s.x, s.y);
      bagBox.appendChild(b);
    });

    this.paintBagDetail();
  },

  /* 고른 것의 값과 할 수 있는 일. 여기가 예전 비교창이 하던 일을 대신한다 —
     다만 「지금 낀 것과의 차이」는 그대로 보여준다. 그게 이 게임에서
     제일 잘 만든 화면이었으므로 없앨 이유가 없다. */
  paintBagDetail() {
    const box = this.el.bagDetail;
    const pick = this._bagPick;
    const p = state.player;
    if (!pick) {
      box.innerHTML = '<span class="hint">칸을 두드리면 무엇인지 보입니다.</span>';
      return;
    }
    const g = pick.where === 'worn' ? p.gear[pick.slot] : (state.bag || [])[pick.i];
    if (!g) {
      box.innerHTML = '<span class="hint">비어 있습니다.</span>';
      return;
    }

    const slotLine = g.slot === 'weapon'
      ? kindName(g) + (kindNote(g) ? '  ·  ' + kindNote(g) : '')
      : SLOT_NAME[g.slot];

    let rows = '';
    if (g.unknown) {
      rows = '<div class="cx-mod">열어 보기 전에는 알 수 없습니다. 좋은 것일 수도, 저주일 수도.</div>';
    } else if (pick.where === 'bag') {
      // 가방의 것은 지금 낀 것과 견준다
      const cur = p.gear[equipSlotFor(g, p)];
      rows = '<table class="gear-table"><thead><tr><th></th><th>지금</th><th>바꾸면</th><th></th></tr></thead><tbody>' +
        compareRows(g, cur).map(r => {
          const cls = r.diff > 0 ? 'up' : (r.diff < 0 ? 'down' : 'same');
          const sign = r.diff > 0 ? '+' : '';
          return `<tr><td>${r.label}</td><td>${r.now || '—'}</td><td>${r.next || '—'}</td>` +
                 `<td class="${cls}">${r.diff === 0 ? '' : sign + r.diff}</td></tr>`;
        }).join('') + '</tbody></table>';
    } else {
      // 몸에 낀 것은 그 값만
      rows = '<div class="cx-mod">' +
        STAT_ORDER.filter(k => g.mod[k]).map(k => `${STAT_LABEL[k]} ${g.mod[k] > 0 ? '+' : ''}${g.mod[k]}`).join(' · ') +
        '</div>';
    }

    const acts = [];
    if (pick.where === 'bag') {
      if (!g.unknown) acts.push('<button data-act="equip">낀다</button>');
      acts.push('<button data-act="drop" class="ghost">버린다</button>');
    } else {
      acts.push('<button data-act="unequip" class="ghost">벗는다</button>');
    }

    box.innerHTML =
      `<div class="bag-name r-${g.rarity}">${gearFullName(g)}</div>` +
      `<div class="bag-slotline">${slotLine}</div>` + rows +
      `<div class="bag-acts">${acts.join('')}</div>`;

    box.querySelectorAll('[data-act]').forEach(btn => {
      btn.addEventListener('click', () => {
        const h = this._bagHandlers || {};
        const act = btn.dataset.act;
        if (act === 'equip') h.equip && h.equip(pick.i);
        else if (act === 'drop') h.drop && h.drop(pick.i);
        else if (act === 'unequip') h.unequip && h.unequip(pick.slot);
        this._bagPick = null;
        this.paintBag();
      });
    });
  },

  /* 가만히 서 있는 그림도 숨을 쉬는다(프레임 네 장). 한 장으로 군히면
     옆의 칸들과 같은 「정지한 아이콘」이 되어 사람으로 안 읽힌다. */
  tickBagBody() {
    cancelAnimationFrame(this._bagRaf || 0);
    const step = () => {
      if (!this.bagOpen() || !this._bagBody || !this._bagBody.isConnected) return;
      Render.portrait(this._bagBody, state.player);
      this._bagRaf = requestAnimationFrame(step);
    };
    this._bagRaf = requestAnimationFrame(step);
  },

  hideBag() {
    cancelAnimationFrame(this._bagRaf || 0);
    this._bagBody = null;
    this.el.bagModal.classList.add('hidden');
  },
  bagOpen() { return !this.el.bagModal.classList.contains('hidden'); },

  /* ---------- 상점 ---------- */
  showShop(stock, gold, player, onBuy, reroll) {
    this.el.shopGold.textContent = gold;
    this.el.shopList.innerHTML = '';

    stock.forEach((entry, i) => {
      const btn = document.createElement('button');
      btn.className = 'shop-row';
      const afford = !entry.sold && gold >= entry.price;
      btn.disabled = !afford;
      if (entry.sold) btn.classList.add('sold');

      let name, sub;
      // 그림이 없는 줄에도 빈 칸을 넣는다 — 안 그러면 격자가 한 칸씩 밀린다
      let icon = '<span class="shop-ico"></span>';
      if (entry.kind === 'potion') {
        const ps = typeof SPRITES !== 'undefined' && SPRITES.potion;
        if (ps) icon = `<img class="shop-ico" src="${ps.f[0]}" alt="">`;
        name = '<span class="nm">물약</span>';
        // 회복량은 상수에서 읽는다 — 여기 숫자를 손으로 적어 두면 균형을 만질 때마다 어긋난다
        sub = `<span class="sub">체력 ${POTION_HEAL} 회복` +
              (entry.sold ? '' : ` · 남은 ${entry.stock}개`) + '</span>';
      } else if (entry.kind === 'pouch') {
        const bs = typeof SPRITES !== 'undefined' && SPRITES.pouch;
        if (bs) icon = `<img class="shop-ico" src="${bs.f[0]}" alt="">`;
        name = '<span class="nm">물약 주머니</span>';
        sub = `<span class="sub">들 수 있는 물약 +${POUCH_GAIN} ` +
              `· 지금 ${potionMax()}개 → ${potionMax() + POUCH_GAIN}개</span>`;
      } else {
        const g = entry.gear;
        const ic = this.gearIcon(g);
        if (ic) icon = `<img class="shop-ico" style="${this.iconStyle(g, 26, 1.6)}" src="${ic}" alt="">`;
        name = `<span class="nm r-${g.rarity}">${gearFullName(g)}</span>`;
        const cur = player.gear[equipSlotFor(g, player)];
        const diffs = compareRows(g, cur)
          .filter(r => r.diff !== 0)
          .map(r => `<span class="${r.diff > 0 ? 'up' : 'down'}">${r.label} ${r.diff > 0 ? '+' : ''}${r.diff}</span>`)
          .join('  ');
        sub = `<span class="sub">${SLOT_NAME[g.slot]} · ${diffs || '변화 없음'}</span>`;
      }

      btn.innerHTML = `<span class="num">${i + 1}</span>${icon}<span>${name}${sub}</span>` +
                      `<span class="price">${entry.sold ? '팔림' : entry.price + ' G'}</span>`;
      btn.addEventListener('click', () => onBuy(i));
      this.el.shopList.appendChild(btn);
    });

    /* 매대를 다시 깐다. 살 것이 하나도 없는 매대를 만나면 안식처가
       그냥 지나가는 층이 되는데, 그때 골드를 쓸 자리를 만들어 준다.
       물건이 아니라 「기회」를 사는 것이라 맨 아래에 따로 둔다. */
    if (reroll) {
      const b = document.createElement('button');
      b.className = 'shop-row shop-reroll';
      b.disabled = gold < reroll.price;
      b.innerHTML = `<span class="num">R</span><span class="shop-ico"></span>` +
        `<span><span class="nm">매대를 다시 깐다</span>` +
        `<span class="sub">${reroll.done ? reroll.done + '번 바꿨다 · ' : ''}물건이 전부 새로 나온다</span></span>` +
        `<span class="price">${reroll.price} G</span>`;
      b.addEventListener('click', reroll.onPick);
      this.el.shopList.appendChild(b);
    }

    this.el.shopModal.classList.remove('hidden');
  },
  hideShop() { this.el.shopModal.classList.add('hidden'); },
  shopOpen() { return !this.el.shopModal.classList.contains('hidden'); },
  setShopSay(t) { this.el.shopSay.textContent = t; },

  /* ---------- 층 진입 연출 ----------
     암전 1.5초, 문장은 한 글자씩. 아무 키나 누르면 스킵되지만
     첫 0.5초는 막아둔다 — 연타 중에 문장을 놓치지 않도록. */
  intro: { active: false, skippable: false, typing: false, timers: [], onDone: null },

  showFloorIntro(depth, line, hint, onDone) {
    this.showCurtain(depth + '층', line, hint, onDone);
  },

  // 암전 위에 큰 제목 한 줄과 문장 하나.
  // 층 진입과 기억을 되찾는 순간이 같은 화법을 쓴다 —
  // 둘 다 "무언가가 열리는" 순간이기 때문이다.
  showCurtain(title, line, hint, onDone) {
    const I = this.intro;
    I.timers.forEach(clearTimeout);
    I.timers = [];
    I.active = true;
    I.skippable = false;
    I.typing = true;
    I.onDone = onDone;
    this._fullLine = line || '';

    this.el.intro.classList.remove('hidden', 'fading');
    this.el.introFloor.textContent = title;
    this.el.introFloor.classList.toggle('long', String(title).length > 4);
    this.el.introLine.innerHTML = '';
    this.el.introHint.innerHTML = this._nl(hint || '');
    this.el.introHint.classList.remove('show');

    I.timers.push(setTimeout(() => { I.skippable = true; }, 500));

    // 한 글자씩
    const chars = [...(line || '')];
    let i = 0;
    const tick = () => {
      if (!I.active) return;
      if (i >= chars.length) {
        I.typing = false;
        this.el.introLine.innerHTML = this._nl(line);
        if (hint) this.el.introHint.classList.add('show');
        I.timers.push(setTimeout(() => this.closeIntro(), 1500));
        return;
      }
      i++;
      this.el.introLine.innerHTML = this._nl(chars.slice(0, i).join('')) +
        '<span class="caret">▍</span>';
      I.timers.push(setTimeout(tick, 34));
    };
    I.timers.push(setTimeout(tick, 420));
  },

  // 입력이 들어왔을 때: 타이핑 중이면 끝까지 보여주고, 이미 끝났으면 닫는다
  skipIntro() {
    const I = this.intro;
    if (!I.active || !I.skippable) return true;   // 아직 스킵 불가 — 입력만 삼킨다
    if (I.typing) {
      I.timers.forEach(clearTimeout);
      I.timers = [];
      I.typing = false;
      this.el.introLine.innerHTML = this._nl(this._fullLine);
      if (this.el.introHint.textContent) this.el.introHint.classList.add('show');
      I.timers.push(setTimeout(() => this.closeIntro(), 900));
    } else {
      this.closeIntro();
    }
    return true;
  },

  closeIntro() {
    const I = this.intro;
    if (!I.active) return;
    I.timers.forEach(clearTimeout);
    I.timers = [];
    I.active = false;
    this.el.intro.classList.add('fading');
    setTimeout(() => {
      this.el.intro.classList.add('hidden');
      this.el.intro.classList.remove('fading');
      if (I.onDone) I.onDone();
    }, 500);
  },

  _fullLine: '',
  _nl(s) { return String(s).replace(/\n/g, '<br>'); },

  /* ---------- 결과 ----------

     끝난 방식에 따라 나가는 문이 다르다.

     쓰러진 판은 「다시 오른다」다 — 그 자리에서 한 번 더 하고 싶은 마음이
     아직 남아 있고, 그걸 붙잡는 것이 로그라이크가 하는 일이다.

     이야기를 끝낸 판은 「로비로 돌아간다」다. 결말을 보고 이름까지 지나간 뒤에
     곧장 1층에 떨어뜨리면 방금 끝낸 것이 없던 일이 된다.
     한 번 첫 화면으로 돌려보내면 거기서 다시 시작할지는 사람이 정한다. */
  showResult(title, line, rows, opts) {
    this.el.resultTitle.textContent = title;
    this.el.resultLine.innerHTML = String(line).replace(/\n/g, '<br>');
    this.el.resultStats.innerHTML = '';
    for (const [k, v] of rows) {
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = v;
      this.el.resultStats.append(dt, dd);
    }
    const toLobby = !!(opts && opts.toLobby);
    this._resultToLobby = toLobby;
    const btn = document.getElementById('btn-retry');
    if (btn) btn.textContent = toLobby ? '로비로 돌아간다' : '다시 오른다';
    this.el.result.classList.remove('hidden');
  },
  resultToLobby() { return !!this._resultToLobby; },
  hideResult() { this.el.result.classList.add('hidden'); },

  /* ---------- 화면 전환 ---------- */
  showTitle() {
    this.el.title.classList.remove('hidden');
    this.el.game.classList.add('hidden');
  },
  showGame() {
    this.el.title.classList.add('hidden');
    this.el.game.classList.remove('hidden');
  },
  /* ---------- 캐릭터 선택 ----------
     그림과 한 줄 설명, 그리고 여섯 스탯을 그대로 보여준다.
     "빠름·강함" 같은 별점보다 숫자가 정직하고, 이 게임은 숫자로 굴러간다. */
  renderHeroPick() {
    const box = document.getElementById('hero-pick');
    if (!box) return;
    const cur = currentHero();
    box.innerHTML = '';

    for (const h of HEROES) {
      const b = document.createElement('button');
      b.className = 'hero' + (h.id === cur.id ? ' on' : '');
      b.dataset.hero = h.id;
      const s = h.base;
      // 그림은 대기 애니메이션의 첫 장을 쓴다 (열쇠가 hero.<id>.idle 이다)
      const sp = typeof SPRITES !== 'undefined' && SPRITES['hero.' + h.id + '.idle'];
      b.innerHTML =
        (sp ? `<img class="hero-img" src="${sp.f[0]}" alt="">` : '<span class="hero-img"></span>') +
        `<span class="hero-name">${h.name}</span>` +
        `<span class="hero-stat">체${s.maxHp} 공${s.atk}` +
        (s.sp ? ` <em>주${s.sp}</em>` : '') +
        ` 방${s.def} 속${s.spd}</span>`;
      b.addEventListener('click', () => { chooseHero(h.id); this.renderHeroPick(); });
      box.appendChild(b);
    }
    // 고른 사람의 수치는 아래에서 한 번 더 보여준다.
    // 좁은 화면에서는 카드 안의 수치를 감추고 이쪽만 남긴다.
    const s = cur.base;
    const say = document.getElementById('hero-say');
    if (say) say.innerHTML =
      `<b>${cur.line}</b><span>${cur.note}</span>` +
      `<span class="hero-nums">체력 ${s.maxHp} · 공격 ${s.atk}` +
      (s.sp ? ` · <em>주문 ${s.sp}</em>` : '') +
      ` · 방어 ${s.def} · 마방 ${s.md} · 속도 ${s.spd}</span>`;
  },

  /* ---------- 도감 ----------
     조작법 · 몬스터 · 아이템 · 내 기억 · 업적이 탭 하나로 묶인 창 */

  showCodex(tab) {
    const save = loadData() || {};
    this.renderMonsterCodex(new Set(save.codex || []), save.killCount || {});
    this.renderItemCodex(new Set(save.itemCodex || []));
    this.renderMemories(new Set(save.memories || []));
    this.renderAchievements(new Set(save.achievements || []));
    this.codexTab(tab || 'keys');
    document.getElementById('codex-screen').classList.remove('hidden');
  },
  hideCodex() { document.getElementById('codex-screen').classList.add('hidden'); },
  codexOpen() { return !document.getElementById('codex-screen').classList.contains('hidden'); },

  codexTab(name) {
    document.querySelectorAll('#codex-tabs button[data-tab]').forEach(b =>
      b.classList.toggle('on', b.dataset.tab === name));
    document.querySelectorAll('.codex-body section').forEach(s =>
      s.hidden = s.dataset.panel !== name);
    document.querySelector('.codex-body').scrollTop = 0;
  },

  // 장비 그림. 무기는 팩에서, 갑옷·장신구는 tools/make-icons.js 가 그린 것에서 온다.
  gearIcon(gear) {
    if (gear.unknown) return null;      // 그림도 정체를 흘리면 안 된다
    const s = typeof SPRITES !== 'undefined' && SPRITES['gear.' + gear.name];
    return s ? s.f[0] : null;
  },

  /* 도트 그림을 상자에 앉힌다 — **꽉 채우지 않는다.**

     object-fit: contain 은 큰 축을 상자에 꽉 맞춘다. 그러면 6px 짜리 단검은
     세 배 넘게 부풀고 30px 짜리 창은 겨우 1.3배라, **작은 물건일수록 화면에서
     더 크고 굵게** 보인다. 상자를 열 때마다 아이콘 크기가 널뛰는 이유가 이것이다.

     배율에 뚜껑(cap)을 씌운다. 크기가 제각각이어도 픽셀 한 칸의 크기가
     비슷하면 눈은 「같은 세계의 물건들」로 읽는다. */
  fitIcon(el, gear, box, cap) {
    if (!el) return;
    const s = !gear.unknown && typeof SPRITES !== 'undefined' && SPRITES['gear.' + gear.name];
    if (!s || !s.w || !s.h) { el.style.width = ''; el.style.height = ''; return; }
    const k = Math.min(cap, box / s.w, box / s.h);
    el.style.width = Math.round(s.w * k) + 'px';
    el.style.height = Math.round(s.h * k) + 'px';
  },

  // 상점 줄처럼 문자열로 그리는 곳을 위한 같은 계산
  iconStyle(gear, box, cap) {
    const s = !gear.unknown && typeof SPRITES !== 'undefined' && SPRITES['gear.' + gear.name];
    if (!s || !s.w || !s.h) return '';
    const k = Math.min(cap, box / s.w, box / s.h);
    return `width:${Math.round(s.w * k)}px;height:${Math.round(s.h * k)}px`;
  },
  gearThumb(gear) {
    const src = this.gearIcon(gear);
    return src ? `<img class="cx-thumb" src="${src}" alt="">` : '<span class="cx-thumb"></span>';
  },

  // 그림은 이미 데이터 URI로 들어와 있으므로 그대로 <img> 에 꽂으면 된다
  thumb(key) {
    const s = typeof SPRITES !== 'undefined' && SPRITES[key];
    return s ? `<img class="cx-thumb" src="${s.f[0]}" alt="">` : '<span class="cx-thumb"></span>';
  },

  renderMonsterCodex(seen, tally) {
    const killed = tally || {};
    const rows = [`<thead><tr><th></th><th>이름</th><th>층</th><th>체력</th><th>공격</th>` +
                  `<th>주문</th><th>방어</th><th>마방</th><th>속도</th><th>잡음</th></tr></thead><tbody>`];
    for (const m of MONSTERS) {
      if (!seen.has(m.id)) {
        rows.push('<tr class="locked"><td></td><td>아직 마주치지 않았다</td>' +
                  '<td colspan="8"></td></tr>');
        continue;
      }
      const magic = m.sp > m.atk;
      // 마주치기만 하고 아직 못 잡은 것도 있다 — 그때는 숫자 대신 가운뎃점
      const n = killed[m.id] || 0;
      rows.push(`<tr><td>${this.thumb(m.id + '.idle')}</td>` +
        `<td class="cx-name">${m.name}${magic ? ' <span class="cx-tag">원거리</span>' : ''}</td>` +
        `<td>${m.min}</td><td>${m.hp}</td>` +
        `<td${magic ? '' : ' class="hi"'}>${m.atk}</td>` +
        `<td${magic ? ' class="hi mag"' : ''}>${m.sp}</td>` +
        `<td>${m.def}</td><td>${m.md}</td><td>${m.spd}</td>` +
        `<td class="cx-kills">${n ? n : '·'}</td></tr>`);
    }
    rows.push('</tbody>');
    // 엘리트는 몬스터가 아니라 몬스터에 붙는 것이므로 표 아래에 따로 적는다
    rows.push('<tbody><tr class="cx-note"><td colspan="10" class="cx-mod" style="padding-top:14px">' +
      '<b>이름 앞에 붙는 것</b> — 3층부터, 위로 갈수록 자주 붙습니다. 발밑이 빛납니다.<br>' +
      ELITES.map(e => `「${e.name}」 ${e.note}`).join(' · ') +
      '</td></tr></tbody>');
    document.getElementById('codex-monsters').innerHTML = rows.join('');
  },

  renderItemCodex(seen) {
    const rows = [`<thead><tr><th></th><th>이름</th><th>자리</th><th>층</th><th>효과</th></tr></thead><tbody>`];
    for (const g of GEAR) {
      if (!seen.has(g.name)) {
        rows.push('<tr class="locked"><td></td><td>아직 손에 넣지 못했다</td><td colspan="3"></td></tr>');
        continue;
      }
      const mods = STAT_ORDER.filter(k => g.mod[k])
        .map(k => `${STAT_LABEL[k]} ${g.mod[k] > 0 ? '+' : ''}${g.mod[k]}`).join(' · ');
      const only = g.only ? ` <span class="cx-tag">${(HEROES.find(h => h.id === g.only) || {}).name || g.only} 전용</span>` : '';
      const set = SET_OF[g.name]
        ? ` <span class="cx-tag cx-set">${SETS[SET_OF[g.name]].name} 셋</span>` : '';
      rows.push(`<tr><td>${this.gearThumb(g)}</td>` +
        `<td class="cx-name" style="color:${RARITY[g.rarity].color}">` +
        `${gearFullName(g)}${only}${set}</td><td>${SLOT_NAME[g.slot]}</td><td>${g.min}</td>` +
        `<td class="cx-mod">${mods}</td></tr>`);
    }
    rows.push('</tbody>');

    /* 셋은 장비가 아니라 장비들 사이의 관계라 표 아래에 따로 적는다.
       엘리트를 몬스터 표 아래에 적는 것과 같은 자리다. */
    const setRows = Object.values(SETS).map(s => {
      const worn = STAT_ORDER.filter(k => s.three[k])
        .map(k => `${STAT_LABEL[k]} +${s.three[k]}`).join(' · ');
      const two = STAT_ORDER.filter(k => s.two[k])
        .map(k => `${STAT_LABEL[k]} +${s.two[k]}`).join(' · ');
      /* 아직 손에 넣지 못한 조각은 이름을 가린다. 도감의 규칙이 「마주친 것만
         열린다」인데, 셋 목록이 그걸 통째로 흘리면 표를 잠가 둔 뜻이 없어진다.
         (검사가 이걸 잡았다 — 「갑옷」이 잠긴 도감에서 읽혔다.) */
      const names = s.pieces.map(n => seen.has(n) ? n : '<span class="locked">???</span>');
      return `<b>${s.name}</b> — ${names.join(' · ')}<br>` +
             `<span class="cx-mod">둘 갖추면 ${two} / 셋 다 갖추면 ${worn} (겹쳐 붙습니다)</span>`;
    });
    rows.push('<tbody><tr class="cx-note"><td colspan="5" class="cx-mod" style="padding-top:14px">' +
      '<b>갖춰 입기</b> — 같은 셋을 두 조각 이상 걸치면 값이 더 붙습니다. ' +
      '한 조각을 걸치면 나머지가 더 자주 나옵니다.<br><br>' +
      setRows.join('<br><br>') + '</td></tr></tbody>');

    document.getElementById('codex-items').innerHTML = rows.join('');
  },

  renderMemories(owned) {
    const box = document.getElementById('memory-list');
    box.innerHTML = '';
    for (const m of MEMORIES) {
      const has = owned.has(m.id);
      const row = document.createElement('div');
      row.className = 'mem-row' + (has ? ' got' : '');
      row.innerHTML = has
        ? `<div class="mem-name">${m.name}</div>` +
          `<div class="mem-line">${m.line}</div>` +
          `<div class="mem-eff">${m.effect}</div>`
        : `<div class="mem-name">아직 기억나지 않는다</div><div class="mem-line">&nbsp;</div>`;
      box.appendChild(row);
    }
  },

  renderAchievements(got) {
    const box = document.getElementById('ach-list');
    box.innerHTML = '';
    for (const a of ACHIEVEMENTS) {
      const has = got.has(a.id);
      const row = document.createElement('div');
      row.className = 'ach-row' + (has ? ' got' : '');
      row.innerHTML = `<span class="ach-mark">${has ? '✦' : '·'}</span>` +
        `<span class="ach-name">${a.name}</span>` +
        `<span class="ach-desc">${a.desc}</span>`;
      box.appendChild(row);
    }
    document.getElementById('codex-tabs')
      .querySelector('[data-tab="achievements"]').textContent = `업적 ${got.size}/${ACHIEVEMENTS.length}`;
  },

  /* ---------- 업적 알림 ----------
     한 판을 끊지 않도록 구석에 잠깐 뜨고 사라진다 */
  toast(title, desc) {
    let box = document.getElementById('toasts');
    if (!box) {
      box = document.createElement('div');
      box.id = 'toasts';
      document.getElementById('app').appendChild(box);
    }
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<b>${title}</b><span>${desc}</span>`;
    box.appendChild(el);
    setTimeout(() => el.classList.add('out'), 3200);
    setTimeout(() => el.remove(), 3900);
  },

  setRecord(text) { this.el.record.textContent = text; },


};
