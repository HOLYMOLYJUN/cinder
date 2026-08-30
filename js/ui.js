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
      gearModal: $('gear-modal'),
      gearSlot:  $('gear-slot'),
      gearName:  $('gear-name'),
      gearIconEl:$('gear-icon'),
      gearRows:  $('gear-rows'),
      gearOld:   $('gear-old'),
      gearStrip: $('gear-strip'),
      shopModal: $('shop-modal'),
      shopList:  $('shop-list'),
      shopGold:  $('shop-gold'),
      shopSay:   $('shop-say'),
      log:      $('log'),
      hpText:   $('hp-text'),
      floor:    $('stat-floor'),
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

  updateHearts(p) {
    const box = document.getElementById('hearts');
    if (!box || typeof SPRITES === 'undefined' || !SPRITES.heartFull) return;
    const total = Math.max(1, Math.ceil(p.maxHp / this.HEART));

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
      const v = clamp(p.hp - i * this.HEART, 0, this.HEART);
      const key = v >= this.HEART * 0.75 ? 'heartFull'
                : v >= this.HEART * 0.25 ? 'heartHalf' : 'heartEmpty';
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
    this.updateLevel(state);
    this.el.potion.textContent = state.potions;
    this.el.gold.textContent = state.gold;
    this.updateGearStrip(p);
    this.updateBossBar(state);
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
    const s = player.stats;
    parts.push(`<span class="g-slot"><i>공${s.atk} 주${s.sp} 방${s.def} 마${s.md} 속${s.spd}</i></span>`);
    this.el.gearStrip.innerHTML = parts.join('');
  },

  /* ---------- 장비 비교창 ---------- */
  showGearCompare(gear, current) {
    this.el.gearSlot.textContent = SLOT_NAME[gear.slot];
    this.el.gearName.textContent = gearFullName(gear);
    const icon = this.gearIcon(gear);
    this.el.gearIconEl.src = icon || '';
    this.el.gearIconEl.hidden = !icon;
    this.el.gearName.className = 'gear-name r-' + gear.rarity;

    this.el.gearRows.innerHTML = '';
    for (const r of compareRows(gear, current)) {
      const tr = document.createElement('tr');
      const cls = r.diff > 0 ? 'up' : (r.diff < 0 ? 'down' : 'same');
      const sign = r.diff > 0 ? '+' : '';
      tr.innerHTML =
        `<td>${r.label}</td>` +
        `<td>${r.now || '—'}</td>` +
        `<td>${r.next || '—'}</td>` +
        `<td class="${cls}">${r.diff === 0 ? '' : sign + r.diff}</td>`;
      this.el.gearRows.appendChild(tr);
    }

    this.el.gearOld.textContent = current
      ? '지금 낀 것 — ' + gearFullName(current) + ' (교체하면 버려집니다)'
      : '이 자리는 비어 있습니다.';

    this.el.gearModal.classList.remove('hidden');
  },
  hideGearCompare() { this.el.gearModal.classList.add('hidden'); },
  gearOpen() { return !this.el.gearModal.classList.contains('hidden'); },

  /* ---------- 상점 ---------- */
  showShop(stock, gold, player, onBuy) {
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
        sub = '<span class="sub">체력 18 회복' +
              (entry.sold ? '' : ` · 남은 ${entry.stock}개`) + '</span>';
      } else {
        const g = entry.gear;
        const ic = this.gearIcon(g);
        if (ic) icon = `<img class="shop-ico" src="${ic}" alt="">`;
        name = `<span class="nm r-${g.rarity}">${gearFullName(g)}</span>`;
        const cur = player.gear[g.slot];
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

  /* ---------- 결과 ---------- */
  showResult(title, line, rows) {
    this.el.resultTitle.textContent = title;
    this.el.resultLine.innerHTML = String(line).replace(/\n/g, '<br>');
    this.el.resultStats.innerHTML = '';
    for (const [k, v] of rows) {
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = v;
      this.el.resultStats.append(dt, dd);
    }
    this.el.result.classList.remove('hidden');
  },
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
    this.renderMonsterCodex(new Set(save.codex || []));
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
    const s = typeof SPRITES !== 'undefined' && SPRITES['gear.' + gear.name];
    return s ? s.f[0] : null;
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

  renderMonsterCodex(seen) {
    const rows = [`<thead><tr><th></th><th>이름</th><th>층</th><th>체력</th><th>공격</th>` +
                  `<th>주문</th><th>방어</th><th>마방</th><th>속도</th></tr></thead><tbody>`];
    for (const m of MONSTERS) {
      if (!seen.has(m.id)) {
        rows.push('<tr class="locked"><td></td><td>아직 마주치지 않았다</td>' +
                  '<td colspan="7"></td></tr>');
        continue;
      }
      const magic = m.sp > m.atk;
      rows.push(`<tr><td>${this.thumb(m.id + '.idle')}</td>` +
        `<td class="cx-name">${m.name}${magic ? ' <span class="cx-tag">원거리</span>' : ''}</td>` +
        `<td>${m.min}</td><td>${m.hp}</td>` +
        `<td${magic ? '' : ' class="hi"'}>${m.atk}</td>` +
        `<td${magic ? ' class="hi mag"' : ''}>${m.sp}</td>` +
        `<td>${m.def}</td><td>${m.md}</td><td>${m.spd}</td></tr>`);
    }
    rows.push('</tbody>');
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
      rows.push(`<tr><td>${this.gearThumb(g)}</td>` +
        `<td class="cx-name" style="color:${RARITY[g.rarity].color}">` +
        `${gearFullName(g)}</td><td>${SLOT_NAME[g.slot]}</td><td>${g.min}</td>` +
        `<td class="cx-mod">${mods}</td></tr>`);
    }
    rows.push('</tbody>');
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
