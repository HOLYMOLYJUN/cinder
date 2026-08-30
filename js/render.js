/* =========================================================
   render.js — 캔버스 그리기

   지금은 색 사각형 + 글자로 그린다.
   나중에 스프라이트를 붙일 때 건드릴 곳은 drawEntity 하나뿐이다.
   그래서 인자를 (엔티티, 프레임번호) 형태로 미리 열어둔다.
   ========================================================= */

const Render = {
  canvas: null,
  ctx: null,
  shake: { t: 0, mag: 0 },
  floaters: [],          // 떠오르는 피해 숫자

  img: {},          // 이름 → [Image, ...]
  ready: false,
  tintCv: null,

  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;   // 픽셀아트는 뭉개지면 안 된다
    this.loadSprites();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  },

  // 그림은 데이터 URI라 네트워크를 타지 않지만 디코딩은 비동기다.
  // 다 준비되기 전에는 글자로 그린다 — 첫 프레임이 비어 보이지 않도록.
  loadSprites() {
    if (typeof SPRITES === 'undefined') return;
    let pending = 0;
    for (const [key, entry] of Object.entries(SPRITES)) {
      this.img[key] = { w: entry.w, h: entry.h, f: [] };
      entry.f.forEach((src, i) => {
        pending++;
        const im = new Image();
        im.onload = im.onerror = () => { if (--pending === 0) this.ready = true; };
        im.src = src;
        this.img[key].f[i] = im;
      });
    }
    if (pending === 0) this.ready = true;
  },

  // 피격 번쩍임과 최종 보스의 불빛에 쓴다.
  // 원본을 오프스크린에 그린 뒤 source-atop 으로 색을 덮는다.
  tinted(im, color, alpha) {
    if (!this.tintCv) this.tintCv = document.createElement('canvas');
    const cv = this.tintCv;
    if (cv.width !== im.width || cv.height !== im.height) {
      cv.width = im.width; cv.height = im.height;
    }
    const c = cv.getContext('2d');
    c.clearRect(0, 0, cv.width, cv.height);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    c.drawImage(im, 0, 0);
    c.globalCompositeOperation = 'source-atop';
    c.globalAlpha = alpha;
    c.fillStyle = color;
    c.fillRect(0, 0, cv.width, cv.height);
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    return cv;
  },

  // 좌표로 정해지는 바닥 무늬 — 매 프레임 달라지지 않게 해시로 고른다
  floorVariant(x, y) {
    const h = (x * 73856093) ^ (y * 19349663);
    return Math.abs(h) % 8;
  },

  // 화면 폭에 따라 보이는 타일 수를 바꾼다.
  // 캔버스는 컨테이너 폭에 맞춰 늘어나므로, 타일 수가 적을수록 크게 보인다.
  resize() {
    const narrow = window.innerWidth < CFG.NARROW_AT;
    CFG.VIEW_W = narrow ? CFG.VIEW_W_NARROW : 28;
    CFG.VIEW_H = narrow ? CFG.VIEW_H_NARROW : 18;

    const w = CFG.VIEW_W * CFG.TILE;
    const h = CFG.VIEW_H * CFG.TILE;
    this.canvas.width = w;
    this.canvas.height = h;
    this.canvas.style.maxWidth = w + 'px';
    this.ctx.imageSmoothingEnabled = false;

    // HUD·로그도 캔버스와 같은 폭으로 맞춘다
    const screen = document.getElementById('game-screen');
    if (screen) screen.style.setProperty('--game-w', w + 'px');

    // 캔버스 크기를 바꾸면 컨텍스트 설정이 초기화된다
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
  },

  beams: [],

  addFloater(x, y, text, color) {
    this.floaters.push({ x, y, text, color, t: 0, life: 0.85 });
  },

  // 원거리 공격의 궤적
  addBeam(x0, y0, x1, y1, color) {
    this.beams.push({ x0, y0, x1, y1, color, t: 0, life: 0.22 });
  },

  orbs: [],
  blasts: [],

  // 날아가는 불덩이. 타일셋에 투사체 그림이 없어서 직접 그린다.
  addOrb(x0, y0, x1, y1) {
    const dist = Math.abs(x1 - x0) + Math.abs(y1 - y0);
    this.orbs.push({ x0, y0, x1, y1, t: 0, life: 0.05 + dist * 0.028 });
  },

  // 터지는 순간
  addBlast(x, y) {
    this.blasts.push({ x, y, t: 0, life: 0.34 });
  },

  addShake(mag) {
    this.shake.mag = Math.max(this.shake.mag, mag);
    this.shake.t = 0.24;
  },

  step(dt) {
    // 피해 숫자
    for (const f of this.floaters) f.t += dt;
    this.floaters = this.floaters.filter(f => f.t < f.life);

    for (const b of this.beams) b.t += dt;
    this.beams = this.beams.filter(b => b.t < b.life);

    for (const o of this.orbs) o.t += dt;
    this.orbs = this.orbs.filter(o => o.t < o.life);

    for (const b of this.blasts) b.t += dt;
    this.blasts = this.blasts.filter(b => b.t < b.life);

    // 화면 흔들림
    if (this.shake.t > 0) {
      this.shake.t -= dt;
      if (this.shake.t <= 0) { this.shake.t = 0; this.shake.mag = 0; }
    }
  },

  /* ----- 한 프레임 ----- */
  draw(state, dt) {
    const ctx = this.ctx;
    const { map, player, monsters, visible } = state;
    const TS = CFG.TILE;

    ctx.fillStyle = COLORS.unseen;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // 카메라 — 플레이어의 "그려지는 위치"를 따라가므로 스크롤도 부드럽다
    let camX = player.rx - CFG.VIEW_W / 2 + 0.5;
    let camY = player.ry - CFG.VIEW_H / 2 + 0.5;
    camX = clamp(camX, 0, Math.max(0, map.w - CFG.VIEW_W));
    camY = clamp(camY, 0, Math.max(0, map.h - CFG.VIEW_H));

    let ox = -camX * TS, oy = -camY * TS;
    if (this.shake.t > 0) {
      const m = this.shake.mag * (this.shake.t / 0.24);
      ox += (Math.random() - 0.5) * m;
      oy += (Math.random() - 0.5) * m;
    }

    ctx.save();
    ctx.translate(Math.round(ox), Math.round(oy));

    const x0 = Math.floor(camX) - 1, x1 = Math.ceil(camX + CFG.VIEW_W) + 1;
    const y0 = Math.floor(camY) - 1, y1 = Math.ceil(camY + CFG.VIEW_H) + 1;

    /* ----- 바닥과 벽 ----- */
    for (let y = Math.max(0, y0); y < Math.min(map.h, y1); y++) {
      for (let x = Math.max(0, x0); x < Math.min(map.w, x1); x++) {
        const seen = map.explored[y][x];
        if (!seen) continue;
        const lit = isVisible(visible, map, x, y);
        const t = map.tiles[y][x];
        const px = x * TS, py = y * TS;

        if (this.ready) {
          ctx.globalAlpha = 1;
          if (t === T.DOOR) {
            // 잠긴 문. 벽처럼 단단하되 한눈에 문으로 보여야 한다.
            this.tile(ctx, 'wallFace', 0, px, py, lit);
            this.tile(ctx, 'door', 0, px, py, lit);
            if (lit) {
              const g4 = ctx.createRadialGradient(px + TS/2, py + TS/2, 1, px + TS/2, py + TS/2, TS*0.8);
              g4.addColorStop(0, 'rgba(240,194,74,.20)');
              g4.addColorStop(1, 'rgba(240,194,74,0)');
              ctx.fillStyle = g4;
              ctx.fillRect(px - TS/2, py - TS/2, TS*2, TS*2);
            }
          } else if (t === T.WALL) {
            // wall_mid 가 벽돌 본체다. wall_top_mid 는 윗면 마감재라
            // 그것만 그리면 벽이 얇은 선으로 보인다 — 본체를 먼저 깔고,
            // 위쪽이 트인 벽에만 마감을 덧댄다.
            this.tile(ctx, 'wallFace', 0, px, py, lit);
            if (tileAt(map, x, y - 1) !== T.WALL) this.tile(ctx, 'wallTop', 0, px, py, lit);
          } else {
            this.tile(ctx, 'floor', this.floorVariant(x, y), px, py, lit);
            if (t === T.STAIRS) this.tile(ctx, 'stairs', 0, px, py, lit);
            if (t === T.CAMP) {
              this.tile(ctx, 'camp', Math.floor(performance.now()/150) % 3, px, py, lit);
              this.campFire(ctx, px, py, lit);
            }
          }
          // 불빛이 닿지 않는 곳에는 차가운 장막을 덮는다.
          // 색온도만으로 "지금 보이는 것"과 "기억하는 것"이 갈린다.
          if (!lit) {
            ctx.fillStyle = 'rgba(11,15,26,.60)';
            ctx.fillRect(px, py, TS, TS);
          }
          ctx.globalAlpha = 1;
        } else {
          // 그림이 준비되기 전의 대체 표현
          if (t === T.WALL) {
            ctx.fillStyle = lit ? COLORS.wallLit : COLORS.wallDim;
            ctx.fillRect(px, py, TS, TS);
          } else {
            ctx.fillStyle = lit ? COLORS.floorLit : COLORS.floorDim;
            ctx.fillRect(px, py, TS, TS);
          }
          if (t === T.STAIRS) this.glyph(ctx, '>', px, py, COLORS.stairs, lit, true);
          if (t === T.CAMP)   this.glyph(ctx, 'C', px, py, COLORS.camp,   lit, true);
        }

        // 벽에 걸린 횃불
        if (this.ready && t === T.WALL && map.torches) {
          const tor = map.torches.find(v => v.x === x && v.y === y);
          if (tor) this.wallTorch(ctx, tor, lit);
        }

        // 상인은 타일이 아니라 사람이라 스프라이트로 세워둔다
        if (t === T.SHOP) {
          if (this.ready) this.sprite(ctx, 'merchant.idle', px, py, 1, lit ? 1 : 0.42, null);
          else this.glyph(ctx, 'V', px, py, COLORS.shop, lit, true);
        }
      }
    }

    /* ----- 바닥의 물건 ----- */
    for (const it of map.items) {
      if (!map.explored[it.y][it.x]) continue;
      const lit = isVisible(visible, map, it.x, it.y);
      const px = it.x * TS, py = it.y * TS;
      if (this.ready) {
        ctx.globalAlpha = lit ? 1 : 0.42;
        if (it.type === 'gold')   this.tile(ctx, 'coin', Math.floor(performance.now()/140) % 4, px, py, lit);
        if (it.type === 'potion') this.tile(ctx, 'potion', 0, px, py, lit);
        if (it.type === 'key') this.keyMark(ctx, px + TS/2, py + TS*0.55, 1);
        if (it.type === 'gear') {
          // 등급을 은은한 빛으로 알린다 — 줍기 전에 값어치를 짐작할 수 있게
          const c = RARITY[it.gear.rarity].color;
          const pulse = 0.30 + Math.abs(Math.sin(performance.now() / 620)) * 0.35;
          const g = ctx.createRadialGradient(px + TS/2, py + TS/2, 1, px + TS/2, py + TS/2, TS * 0.75);
          g.addColorStop(0, c);
          g.addColorStop(1, 'transparent');
          ctx.globalAlpha = (lit ? 1 : 0.5) * pulse;
          ctx.fillStyle = g;
          ctx.fillRect(px - TS/2, py - TS/2, TS * 2, TS * 2);
          ctx.globalAlpha = lit ? 1 : 0.5;
          // 바닥에서는 무엇이든 상자로 둔다. 무기·갑옷 아이콘을 그대로 깔아 봤더니
          // 던전 바닥이 아이콘 진열장처럼 보여서 어디가 길인지 눈이 헷갈렸다.
          // 무엇인지는 밟았을 때 뜨는 비교창이 알려주고, 여기서는 등급 빛만 알린다.
          this.tile(ctx, 'chest', 0, px, py, lit);
        }
        ctx.globalAlpha = 1;
      } else {
        if (it.type === 'gold')   this.glyph(ctx, '$', px, py, COLORS.gold, lit, false);
        if (it.type === 'potion') this.glyph(ctx, '!', px, py, COLORS.potion, lit, false);
        if (it.type === 'key')    this.glyph(ctx, '♃', px, py, COLORS.key, lit, true);
        if (it.type === 'gear')
          this.glyph(ctx, SLOT_GLYPH[it.gear.slot], px, py,
                     RARITY[it.gear.rarity].color, lit, it.gear.rarity === 'ancient');
      }
    }

    /* ----- 보스가 예고한 칸 -----
       여기에 서 있으면 다음 턴에 맞는다. 벗어나면 빗나간다. */
    const pulse = 0.35 + Math.abs(Math.sin(performance.now() / 260)) * 0.45;
    for (const m of monsters) {
      if (!m.alive || !m.marks) continue;
      for (const [mx, my] of m.marks) {
        if (!isVisible(visible, map, mx, my)) continue;
        const px = mx * TS, py = my * TS;
        ctx.globalAlpha = pulse * 0.30;
        ctx.fillStyle = COLORS.damage;
        ctx.fillRect(px, py, TS, TS);
        ctx.globalAlpha = pulse;
        ctx.strokeStyle = COLORS.damage;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(px + 1, py + 1, TS - 2, TS - 2);
        ctx.globalAlpha = 1;
      }
    }

    /* ----- 주문을 겨누고 있는 적 -----
       작은 테두리만 그렸더니 원거리 몬스터가 있는지조차 몰랐다.
       조준선을 그어야 "지금 저 선에서 벗어나라"가 읽힌다. */
    for (const m of monsters) {
      if (!m.alive || !m.casting || m.boss) continue;
      if (!isVisible(visible, map, m.x, m.y)) continue;
      const mx = (m.rx + 0.5) * TS, my = (m.ry + 0.5) * TS;
      const px2 = (player.rx + 0.5) * TS, py2 = (player.ry + 0.5) * TS;

      ctx.save();
      ctx.globalAlpha = 0.35 + Math.abs(Math.sin(performance.now() / 170)) * 0.4;
      ctx.strokeStyle = COLORS.cast;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.lineDashOffset = -(performance.now() / 40) % 8;
      ctx.beginPath();
      ctx.moveTo(mx, my);
      ctx.lineTo(px2, py2);
      ctx.stroke();
      ctx.setLineDash([]);

      // 겨누는 쪽에도 표시
      ctx.beginPath();
      ctx.arc(mx, my, TS * 0.42, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    /* ----- 몬스터와 플레이어 -----
       아래쪽에 있는 것이 위쪽을 가리도록 y 순으로 그린다 */
    const actors = monsters.filter(m => m.alive && isVisible(visible, map, m.x, m.y));
    actors.push(player);
    actors.sort((a, b) => a.ry - b.ry);
    for (const e of actors) this.drawEntity(ctx, e, 0);

    /* ----- 불씨 빛무리 ----- */
    const cx = (player.rx + 0.5) * TS, cy = (player.ry + 0.5) * TS;
    const r = (state.fovRadius + 0.5) * TS;
    const grad = ctx.createRadialGradient(cx, cy, TS * 0.5, cx, cy, r);
    grad.addColorStop(0, 'rgba(233,149,74,.13)');
    grad.addColorStop(0.55, 'rgba(233,149,74,.05)');
    grad.addColorStop(1, 'rgba(233,149,74,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

    /* ----- 원거리 궤적 ----- */
    for (const b of this.beams) {
      const p = b.t / b.life;
      ctx.globalAlpha = 1 - p;
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 2.5 - p * 1.5;
      ctx.beginPath();
      ctx.moveTo((b.x0 + 0.5) * TS, (b.y0 + 0.5) * TS);
      ctx.lineTo((b.x1 + 0.5) * TS, (b.y1 + 0.5) * TS);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    /* ----- 날아가는 불덩이 ----- */
    for (const o of this.orbs) {
      const p = o.t / o.life;
      const ox2 = lerp(o.x0, o.x1, p), oy2 = lerp(o.y0, o.y1, p);
      const cx2 = (ox2 + 0.5) * TS, cy2 = (oy2 + 0.5) * TS;
      // 꼬리
      for (let i = 1; i <= 4; i++) {
        const q = Math.max(0, p - i * 0.055);
        const tx2 = (lerp(o.x0, o.x1, q) + 0.5) * TS;
        const ty2 = (lerp(o.y0, o.y1, q) + 0.5) * TS;
        ctx.globalAlpha = 0.32 - i * 0.06;
        ctx.fillStyle = COLORS.ember;
        ctx.beginPath(); ctx.arc(tx2, ty2, TS * (0.20 - i * 0.03), 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      const g2 = ctx.createRadialGradient(cx2, cy2, 1, cx2, cy2, TS * 0.5);
      g2.addColorStop(0, '#FFF3D0');
      g2.addColorStop(0.4, COLORS.ember);
      g2.addColorStop(1, 'rgba(233,149,74,0)');
      ctx.fillStyle = g2;
      ctx.fillRect(cx2 - TS * 0.5, cy2 - TS * 0.5, TS, TS);
    }

    /* ----- 터지는 불길 ----- */
    for (const b of this.blasts) {
      const p = b.t / b.life;
      const cx2 = (b.x + 0.5) * TS, cy2 = (b.y + 0.5) * TS;
      const rad = TS * (0.35 + p * 1.25);
      ctx.globalAlpha = (1 - p) * 0.75;
      const g3 = ctx.createRadialGradient(cx2, cy2, rad * 0.25, cx2, cy2, rad);
      g3.addColorStop(0, '#FFE3A8');
      g3.addColorStop(0.5, '#E9702A');
      g3.addColorStop(1, 'rgba(192,72,58,0)');
      ctx.fillStyle = g3;
      ctx.fillRect(cx2 - rad, cy2 - rad, rad * 2, rad * 2);
      ctx.globalAlpha = (1 - p) * 0.9;
      ctx.strokeStyle = '#FFD9A0';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx2, cy2, rad * 0.85, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    /* ----- 피해 숫자 ----- */
    for (const f of this.floaters) {
      const p = f.t / f.life;
      ctx.globalAlpha = 1 - p * p;
      ctx.font = 'bold 13px "IBM Plex Mono", monospace';
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, (f.x + 0.5) * TS, (f.y + 0.4) * TS - p * 22);
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  },

  /* ----- 엔티티 한 개 -----
     스프라이트를 붙일 때 이 함수 안쪽만 바꾸면 된다.
     frame 은 지금 항상 0 이지만, 애니메이션을 넣을 때를 위해 열어둔다. */
  drawEntity(ctx, e, frame) {
    const TS = CFG.TILE;
    let px = e.rx * TS, py = e.ry * TS;

    // 스프라이트가 준비됐으면 그림으로 그린다
    // 마지막 보스는 플레이어와 같은 그림을 쓴다 — 당신의 얼굴을 하고 있으므로
    const key = (e.kind === 'player' || e.defId === 'keeper') ? heroSprite() : e.defId;
    const moving = Math.abs(e.rx - e.x) > 0.02 || Math.abs(e.ry - e.y) > 0.02;
    const set = this.ready && this.img[key + (moving ? '.run' : '.idle')];

    if (set) {
      if (e.bump) {
        const p = e.bump.t / CFG.BUMP_ANIM;
        const push = Math.sin(p * Math.PI) * TS * 0.42;
        px += e.bump.dx * push;
        py += e.bump.dy * push;
      }
      if (e.flash > 0) {
        px += (Math.random() - 0.5) * 4;
        py += (Math.random() - 0.5) * 4;
      }
      py += Math.sin(performance.now() / 420 + e.x * 1.7) * 0.7;

      // 불씨를 든 사람 발밑에는 빛이 고인다 — 어디에 있는지 한눈에 보이게
      if (e.kind === 'player') {
        const cx = px + TS / 2, cy = py + TS * 0.72;
        const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, TS * 0.85);
        g.addColorStop(0, 'rgba(233,149,74,.34)');
        g.addColorStop(1, 'rgba(233,149,74,0)');
        ctx.fillStyle = g;
        ctx.fillRect(cx - TS, cy - TS, TS * 2, TS * 2);
      }

      const f = Math.floor(performance.now() / (moving ? 90 : 160)) % set.f.length;
      // 「등불지기」는 당신의 얼굴을 하고 있다 — 같은 그림에 불빛만 입힌다
      const tint = e.flash > 0 ? ['#FFFFFF', 0.85]
                 : (e.defId === 'keeper' ? [COLORS.ember, 0.5] : null);
      this.sprite(ctx, key + (moving ? '.run' : '.idle'), px, py,
                  e.boss ? 1.25 : 1, 1, tint, e.face, f);

      // 열쇠를 들고 있으면 알려준다 — 이걸 안 보이게 하면 층 전체를 뒤져야 한다
      if (e.hasKey) this.keyMark(ctx, px + TS/2, py - TS*0.12, 0.85);

      if (e.casting > 0) {
        ctx.strokeStyle = COLORS.cast;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.5 + Math.sin(performance.now() / 120) * 0.35;
        ctx.strokeRect(px + 1.5, py + 1.5, TS - 3, TS - 3);
        ctx.globalAlpha = 1;
      }
      if (e.kind === 'monster' && e.hp < e.maxHp) {
        const pad = 2;
        const w = (TS - pad * 2) * (e.hp / e.maxHp);
        ctx.fillStyle = 'rgba(0,0,0,.6)';
        ctx.fillRect(px + pad, py + TS - pad - 1, TS - pad * 2, 2);
        ctx.fillStyle = COLORS.damage;
        ctx.fillRect(px + pad, py + TS - pad - 1, w, 2);
      }
      return;
    }
    // ↓ 그림이 준비되기 전의 대체 표현 (색 사각형 + 글자)

    // 공격 — 상대 쪽으로 튀어나갔다 돌아온다
    if (e.bump) {
      const p = e.bump.t / CFG.BUMP_ANIM;
      const push = Math.sin(p * Math.PI) * TS * 0.42;
      px += e.bump.dx * push;
      py += e.bump.dy * push;
    }
    // 피격 — 좌우로 떤다
    if (e.flash > 0) {
      px += (Math.random() - 0.5) * 4;
      py += (Math.random() - 0.5) * 4;
    }
    // 대기 — 아주 살짝 부유한다
    py += Math.sin(performance.now() / 420 + e.x * 1.7) * 0.7;

    const pad = 2;
    const hit = e.flash > 0;

    // 몸통
    ctx.fillStyle = hit ? '#FFFFFF' : e.color;
    ctx.globalAlpha = hit ? 0.9 : 0.22;
    ctx.fillRect(px + pad, py + pad, TS - pad * 2, TS - pad * 2);
    ctx.globalAlpha = 1;

    // 글리프
    ctx.font = 'bold 16px "IBM Plex Mono", ui-monospace, monospace';
    ctx.fillStyle = hit ? '#FFFFFF' : e.color;
    ctx.fillText(e.glyph, px + TS / 2, py + TS / 2 + 1);

    // 주문 준비 중인 적은 예고 테두리를 보인다
    if (e.casting > 0) {
      ctx.strokeStyle = COLORS.cast;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.5 + Math.sin(performance.now() / 120) * 0.35;
      ctx.strokeRect(px + 1.5, py + 1.5, TS - 3, TS - 3);
      ctx.globalAlpha = 1;
    }

    // 몬스터 체력이 깎였으면 아래에 얇은 막대
    if (e.kind === 'monster' && e.hp < e.maxHp) {
      const w = (TS - pad * 2) * (e.hp / e.maxHp);
      ctx.fillStyle = 'rgba(0,0,0,.6)';
      ctx.fillRect(px + pad, py + TS - pad - 1, TS - pad * 2, 2);
      ctx.fillStyle = COLORS.damage;
      ctx.fillRect(px + pad, py + TS - pad - 1, w, 2);
    }
  },

  /* 모닥불.

     불꽃 그림은 확장 팩(flame_anim, 8장)에서 온다. 손으로 그리던 것을 걷어냈다 —
     같은 화면 안의 다른 것들이 전부 도트인데 모닥불만 매끈한 곡선이라 혼자 떠 보였다.
     대신 빛은 계속 코드로 그린다. 빛은 그림이 아니라 조명이라서
     주변 타일 위에 얹혀야 하고, 그건 스프라이트로는 안 되는 일이다. */
  campFire(ctx, px, py, lit) {
    const TS = CFG.TILE;
    const t = performance.now() / 1000;
    const cx = px + TS / 2, base = py + TS * 0.62;

    // 주변으로 번지는 빛
    const glowR = TS * (1.55 + Math.sin(t * 6.1) * 0.08);
    const g = ctx.createRadialGradient(cx, base - TS * 0.2, 1, cx, base - TS * 0.2, glowR);
    g.addColorStop(0, lit ? 'rgba(255,180,90,.46)' : 'rgba(255,180,90,.20)');
    g.addColorStop(1, 'rgba(255,140,60,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - glowR, base - TS * 0.2 - glowR, glowR * 2, glowR * 2);

    // 불꽃. 한 장만 크게 그리면 촛불로 보인다 —
    // 크기와 프레임이 다른 세 장을 겹쳐야 장작이 타는 덩어리로 읽힌다.
    const a = lit ? 1 : 0.5;
    this.anim(ctx, 'campFlame', 110, px - TS * 0.36, py - TS * 0.30,
              TS * 1.20, TS * 1.20, a * 0.85, 3);
    this.anim(ctx, 'campFlame', 130, px + TS * 0.16, py - TS * 0.26,
              TS * 1.10, TS * 1.10, a * 0.85, 6);
    this.anim(ctx, 'campFlame',  90, px - TS * 0.45, py - TS * 0.78,
              TS * 1.90, TS * 1.90, a);

    // 튀어 오르는 불티는 남긴다. 그림은 여덟 장이 반복되기만 해서
    // 이게 없으면 몇 초만 봐도 도는 게 보인다.
    ctx.save();
    for (let i = 0; i < 3; i++) {
      const p = ((t * 0.55 + i * 0.37) % 1);
      ctx.globalAlpha = (lit ? 0.8 : 0.4) * (1 - p);
      ctx.fillStyle = '#FFC97A';
      const ex = cx + Math.sin(t * 3 + i * 2.1) * TS * 0.18;
      ctx.fillRect(Math.round(ex), Math.round(base - TS * 0.7 - p * TS * 0.9), 2, 2);
    }
    ctx.restore();
  },

  /* 벽에 걸린 횃불.

     불이 켜져 있으므로 불씨가 닿지 않는 곳에서도 흐리게나마 보인다 —
     스스로 빛나는 것을 어둠에 묻어 버리면 왜 걸어뒀는지 알 수 없게 된다.
     seed 를 프레임 번호에 더해서 같은 방의 두 횃불이 똑같이 흔들리지 않게 한다. */
  wallTorch(ctx, t, lit) {
    const TS = CFG.TILE;
    const px = t.x * TS, py = t.y * TS;
    const a = lit ? 1 : 0.55;

    // 벽면에 번지는 빛무늬 — 횃불 바로 위 칸에 얹는 그림이 팩에 따로 있다
    this.anim(ctx, 'torchGlow', 140, px, py - TS, TS, TS, a * 0.5, t.seed);
    // 횃불 본체. 16x32 이므로 두 칸 높이로 그린다 (불꽃이 윗칸으로 올라간다)
    this.anim(ctx, 'torchWall', 110, px, py - TS, TS, TS * 2, a, t.seed);

    // 빛
    const cx = px + TS / 2, cy = py + TS * 0.28;
    const r = TS * (1.5 + Math.sin(performance.now() / 300 + t.seed) * 0.08);
    const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, r);
    g.addColorStop(0, lit ? 'rgba(255,175,85,.26)' : 'rgba(255,175,85,.13)');
    g.addColorStop(1, 'rgba(255,140,60,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  },

  /* 여러 장짜리 그림을 시간에 맞춰 한 장 골라 원하는 크기로 그린다.
     tile() 은 한 칸에 딱 맞추는 것이라 모닥불·횃불처럼 칸을 넘는 것에는 못 쓴다. */
  anim(ctx, key, ms, x, y, w, h, alpha, seed) {
    const sp = this.img[key];
    if (!sp) return;
    const i = (Math.floor(performance.now() / ms) + (seed || 0)) % sp.f.length;
    const im = sp.f[i];
    if (!im || !im.complete || !im.naturalWidth) return;
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(im, Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    ctx.restore();
  },

  /* 열쇠. 타일셋에 없어서 직접 그린다 — 고리 하나, 대 하나, 이 두 개. */
  keyMark(ctx, cx, cy, scale) {
    const u = CFG.TILE / 16 * scale;
    const bob = Math.sin(performance.now() / 380) * u * 0.6;
    ctx.save();
    ctx.translate(cx, cy + bob);

    ctx.globalAlpha = 0.35 + Math.abs(Math.sin(performance.now() / 300)) * 0.35;
    const g5 = ctx.createRadialGradient(0, 0, 1, 0, 0, u * 7);
    g5.addColorStop(0, COLORS.key);
    g5.addColorStop(1, 'transparent');
    ctx.fillStyle = g5;
    ctx.fillRect(-u * 7, -u * 7, u * 14, u * 14);

    ctx.globalAlpha = 1;
    ctx.fillStyle = COLORS.key;
    ctx.beginPath();
    ctx.arc(-u * 2, 0, u * 2, 0, Math.PI * 2);   // 고리
    ctx.lineWidth = u;
    ctx.strokeStyle = COLORS.key;
    ctx.stroke();
    ctx.fillRect(0, -u * 0.5, u * 4.5, u);       // 대
    ctx.fillRect(u * 3, 0, u, u * 2);            // 이
    ctx.fillRect(u * 4.2, 0, u, u * 1.4);
    ctx.restore();
  },

  // 타일 한 칸에 딱 맞는 그림 (16x16 을 타일 크기로 확대)
  tile(ctx, key, frame, px, py) {
    const s = this.img[key];
    if (!s) return;
    const im = s.f[frame % s.f.length];
    if (!im || !im.complete || !im.naturalWidth) return;
    const TS = CFG.TILE;
    const k = TS / 16;
    ctx.drawImage(im, px + (TS - im.width * k) / 2, py + TS - im.height * k,
                  im.width * k, im.height * k);
  },

  // 캐릭터 — 발이 타일 바닥에 닿도록 아래를 기준으로 놓는다.
  // 키가 큰 그림은 위 칸을 침범하는데, 그게 이 팩의 의도된 모습이다.
  sprite(ctx, key, px, py, scale = 1, alpha = 1, tint = null, face = 1, frame = 0) {
    const s = this.img[key];
    if (!s) return;
    const im = s.f[frame % s.f.length];
    if (!im || !im.complete || !im.naturalWidth) return;

    const TS = CFG.TILE;
    const k = (TS / 16) * scale;
    const w = im.width * k, h = im.height * k;
    const x = px + (TS - w) / 2;
    const y = py + TS - h + 2;

    const src = tint ? this.tinted(im, tint[0], tint[1]) : im;

    ctx.save();
    ctx.globalAlpha = alpha;
    if (face < 0) {                       // 바라보는 쪽으로 뒤집는다
      ctx.translate(x + w, y);
      ctx.scale(-1, 1);
      ctx.drawImage(src, 0, 0, w, h);
    } else {
      ctx.drawImage(src, x, y, w, h);
    }
    ctx.restore();
  },

  glyph(ctx, ch, px, py, color, lit, big) {
    const TS = CFG.TILE;
    ctx.globalAlpha = lit ? 1 : 0.32;
    ctx.font = (big ? 'bold 17px' : 'bold 14px') + ' "IBM Plex Mono", ui-monospace, monospace';
    ctx.fillStyle = color;
    ctx.fillText(ch, px + TS / 2, py + TS / 2 + 1);
    ctx.globalAlpha = 1;
  },
};
