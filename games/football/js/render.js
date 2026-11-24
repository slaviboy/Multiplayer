// Draws the match on a canvas with the original game's sprites, layout and
// animations. The layout (stadium, goals, sizes) and the animation curves (kick,
// header, idle, jump, landing, sad) come from the original scene, prefabs and
// animation clips. Nothing here affects the match: it only reads sim state, so it
// may use the clock, trig and Math.random freely.
import { img } from './assets.js';
import { BALL_R, GOAL_X, INTRO_TICKS, KICK_TICKS, PHASE, TICKS_PER_SECOND as TPS } from './sim.js';

export const VIEW_H = 10.8; // the original camera: orthographic size 5.4
export const VIEW_W = 19.2;
const VIEW_CY = 2;
const STADIUM = { w: (14.1 * 2048) / 1034, h: 14.1, top: 10.25 };
const VISUAL = 0.46; // the player prefab's Visual scale
const UNIT = 0.01; // 100 sprite pixels per unit
const DEG = Math.PI / 180;
const HEAD_SIZE = [3.26, 3.44]; // the head sprites are stored smaller than the original
const BALL_SIZE = 2.02 * 0.3;

/** 1 → 0 with the original clips' ease (smoothstep). */
const ease = (u) => (u <= 0 ? 1 : u >= 1 ? 0 : (1 - u) * (1 - u) * (1 + 2 * u));
/** 0 → 1 at `peak` → 0 at `end`. */
const tri = (t, peak, end) => (t <= 0 ? 0 : t < peak ? t / peak : t < end ? 1 - (t - peak) / (end - peak) : 0);
const lerp = (a, b, t) => a + (b - a) * t;

/** The player prefab's rest pose (Visual space: before the 0.46 scale, y up). */
export function restPose() {
  return {
    head: { x: -0.15, y: 2.985, rot: 0, sx: 1, sy: 1 },
    body: { x: -0.15, y: 1.63, rot: 0, sx: 1, sy: 1 },
    footPivot: { x: 0.15, y: 1.064, rot: 0 },
    foot: { x: 0.143, y: -0.559 },
  };
}

/** The shadow sprite is a white ellipse the original tints dark; tint it once. */
let darkShadow = null;
export function shadowImage() {
  if (darkShadow) return darkShadow;
  const im = img('sprites/shadow.webp');
  if (!im) return null;
  const c = document.createElement('canvas');
  c.width = im.naturalWidth;
  c.height = im.naturalHeight;
  const g = c.getContext('2d');
  g.drawImage(im, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = 'rgba(20, 16, 10, 0.42)';
  g.fillRect(0, 0, c.width, c.height);
  darkShadow = c;
  return c;
}

function sprite(ctx, image, x, y, rot = 0, sx = 1, sy = 1, size = null) {
  if (!image) return;
  const w = size ? size[0] : (image.naturalWidth || image.width) * UNIT;
  const h = size ? size[1] : (image.naturalHeight || image.height) * UNIT;
  ctx.save();
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  ctx.scale(sx, -sy); // the context is y-up; images are y-down
  ctx.drawImage(image, -w / 2, -h / 2, w, h);
  ctx.restore();
}

/**
 * Draws a character (boot, shirt, neck, head; back to front, as the prefab's sorting
 * orders) with its root at the origin of a y-up context in Visual units.
 */
export function drawCharacter(ctx, kit, pose = restPose()) {
  const fp = pose.footPivot;
  ctx.save();
  ctx.translate(fp.x, fp.y);
  ctx.rotate(fp.rot);
  sprite(ctx, img(`boots/${kit.boots}.webp`), pose.foot.x, pose.foot.y);
  ctx.restore();
  const b = pose.body;
  ctx.save();
  ctx.translate(b.x, b.y);
  if (b.rot) ctx.rotate(b.rot);
  ctx.scale(b.sx, b.sy);
  sprite(ctx, img(`jerseys/${kit.jersey}.webp`), 0, -0.19);
  sprite(ctx, img(`necks/${kit.neck}.webp`), 0, 0.482);
  ctx.restore();
  const h = pose.head;
  sprite(ctx, img(`heads/${kit.head}.webp`), h.x, h.y, h.rot, h.sx, h.sy, HEAD_SIZE);
}

/** A character standing on a podium or a card: fills `canvas`, idling. */
export function drawPortrait(canvas, kit, t = 0, { flip = false } = {}) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const k = h / 5.2; // the character is ~4.6 Visual units tall
  ctx.save();
  ctx.translate(w / 2 + (flip ? -1 : 1) * 0.05 * k, h * 0.94);
  ctx.scale(flip ? -k : k, -k);
  const shadow = shadowImage();
  if (shadow) sprite(ctx, shadow, 0.15, 0.07, 0, 1, 1, [1.97, 0.61]);
  drawCharacter(ctx, kit, idlePose(t));
  ctx.restore();
}

function idlePose(t, pose = restPose()) {
  const br = (1 - Math.cos(((t % 0.917) / 0.917) * 2 * Math.PI)) / 2;
  pose.body.y -= 0.1 * br;
  pose.head.y -= 0.155 * br;
  pose.head.rot -= 3 * DEG * br;
  pose.body.sx += 0.07 * br;
  return pose;
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.blend = [
      { fwd: 0, back: 0, sad: 0 },
      { fwd: 0, back: 0, sad: 0 },
    ];
    this.trail = [];
    this.effects = [];
    this.wobble = [0, 0]; // goal post shake, seconds left (left goal, right goal)
    this.time = 0;
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(this.canvas.clientWidth * dpr);
    const h = Math.round(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.dpr = dpr;
    this.w = w;
    this.h = h;
    this.k = Math.min(h / VIEW_H, w / VIEW_W); // pixels per unit
    this.ox = w / 2;
    this.oy = h / 2 + VIEW_CY * this.k; // screen y of the pitch
  }

  sx(x) {
    return this.ox + x * this.k;
  }

  sy(y) {
    return this.oy - y * this.k;
  }

  /** CSS pixel position of a world point (for DOM overlays such as chat bubbles). */
  toCss(x, y) {
    const r = this.canvas.getBoundingClientRect();
    return { x: r.left + this.sx(x) / this.dpr, y: r.top + this.sy(y) / this.dpr };
  }

  /** Reacts to the events of a tick: effects and shakes (sounds are played by the caller). */
  onEvent(e, s) {
    if (e.type === 'post') this.wobble[e.side] = 0.67;
    if (e.type === 'land') this.dust(s.players[e.side].x, 0, 0.9);
    if (e.type === 'kick') this.dust(s.ball.x, Math.max(0, s.ball.y - BALL_R), 0.6);
    if (e.type === 'goal') this.confetti(e.side);
  }

  dust(x, y, size) {
    this.effects.push({ type: 'dust', x, y, size, t: 0, life: 0.45, frame: Math.floor(Math.random() * 2) });
  }

  confetti(side) {
    const colors = side === 0 ? ['#3fa9ff', '#ffffff', '#ffd23f'] : ['#ff8a2a', '#ffffff', '#ffd23f'];
    for (let i = 0; i < 70; i++) {
      this.effects.push({
        type: 'bit',
        x: (side === 0 ? 1 : -1) * (GOAL_X + 0.6),
        y: 2 + Math.random() * 1.5,
        vx: (side === 0 ? -1 : 1) * (2 + Math.random() * 7),
        vy: 3 + Math.random() * 7,
        rot: Math.random() * 6,
        vr: (Math.random() - 0.5) * 14,
        color: colors[i % colors.length],
        t: 0,
        life: 1.6 + Math.random(),
      });
    }
  }

  /**
   * Draws a frame. `prev` holds positions from the tick before, `alpha` how far we
   * are between it and `s` (0…1). `view.kits` are the two players' outfits.
   */
  draw(s, prev, alpha, dt, view) {
    this.time += dt;
    const { ctx } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingQuality = 'high';
    this.drawBackground(view.stadium);

    const P = s.players.map((p, i) => ({
      p,
      x: prev ? lerp(prev.players[i].x, p.x, alpha) : p.x,
      y: prev ? lerp(prev.players[i].y, p.y, alpha) : p.y,
    }));
    const bx = prev ? lerp(prev.ball.x, s.ball.x, alpha) : s.ball.x;
    const by = prev ? lerp(prev.ball.y, s.ball.y, alpha) : s.ball.y;
    const brot = prev ? lerp(prev.ball.rot, s.ball.rot, alpha) : s.ball.rot;

    this.drawGoal('back', -1);
    this.drawGoal('back', 1);
    for (const q of P) this.drawShadow(q.x + 0.138 * q.p.f, q.y, VISUAL);
    this.drawShadow(bx, by - BALL_R, 0.3);
    this.drawEffects(dt, 'under');
    for (const q of P) this.drawPlayer(q, s, alpha, dt, view.kits[q.p.side]);
    this.drawTrail(bx, by, s.ball);
    this.drawBall(bx, by, brot, s.golden);
    this.drawGoal('front', -1, dt);
    this.drawGoal('front', 1, dt);
    this.drawEffects(dt, 'over');
    this.drawBanners(s, alpha);
  }

  drawBackground(name) {
    const { ctx, w, h } = this;
    const im = img(`stadiums/${name}.jpg`);
    if (!im) {
      ctx.fillStyle = '#6b8fb8';
      ctx.fillRect(0, 0, w, h);
      return;
    }
    const x0 = this.sx(-STADIUM.w / 2);
    const y0 = this.sy(STADIUM.top);
    const dw = STADIUM.w * this.k;
    const dh = STADIUM.h * this.k;
    const iw = im.naturalWidth;
    const ih = im.naturalHeight;
    // a taller or wider screen than the picture: stretch its edge rows / columns
    if (y0 > 0) ctx.drawImage(im, 0, 0, iw, 2, x0, 0, dw, y0 + 1);
    if (y0 + dh < h) ctx.drawImage(im, 0, ih - 2, iw, 2, x0, y0 + dh - 1, dw, h - y0 - dh + 1);
    if (x0 > 0) ctx.drawImage(im, 0, 0, 2, ih, 0, y0, x0 + 1, dh);
    if (x0 + dw < w) ctx.drawImage(im, iw - 2, 0, 2, ih, x0 + dw - 1, y0, w - x0 - dw + 1, dh);
    ctx.drawImage(im, x0, y0, dw, dh);
  }

  /** The goal sprites are drawn for the left goal; the right one is mirrored. */
  drawGoal(part, g, dt = 0) {
    const im = img(`sprites/goal-${part}.webp`);
    if (!im) return;
    const { ctx, k } = this;
    const cx = (part === 'back' ? 8.85 : 8.97) * g;
    const w = im.naturalWidth * UNIT;
    const h = im.naturalHeight * UNIT;
    ctx.save();
    ctx.translate(this.sx(cx), this.sy(2.15));
    ctx.scale(-g * k, k);
    const side = g < 0 ? 1 : 0; // the left goal is the one player 1 scores in
    if (part === 'front' && this.wobble[side] > 0) {
      // the original's goal_post_strong_vibrate: a shake that dies away
      const t = 0.67 - this.wobble[side];
      const a = Math.sin(t * 2 * Math.PI * 3) * (1 - t / 0.67) * 2.5 * DEG;
      ctx.translate(0, h / 2);
      ctx.rotate(a);
      ctx.translate(0, -h / 2);
      this.wobble[side] = Math.max(0, this.wobble[side] - dt);
    }
    ctx.drawImage(im, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  drawShadow(x, height, scale) {
    const im = shadowImage();
    if (!im) return;
    const { ctx, k } = this;
    const lift = Math.max(0, height);
    const s = scale * Math.max(0.45, 1 - lift / 7);
    ctx.save();
    ctx.globalAlpha = Math.max(0.25, 1 - lift / 6);
    const w = 1.97 * s * k;
    const h = 0.61 * s * k;
    ctx.drawImage(im, this.sx(x) - w / 2, this.sy(0.03) - h / 2, w, h);
    ctx.restore();
  }

  pose(q, s, alpha, dt) {
    const { p } = q;
    const bl = this.blend[p.side];
    const step = dt / 0.25; // the move clips last 0.25 s
    const towards = (v, target) => (v < target ? Math.min(target, v + step) : Math.max(target, v - step));
    bl.fwd = towards(bl.fwd, p.grounded && p.move === p.f ? 1 : 0);
    bl.back = towards(bl.back, p.grounded && p.move === -p.f ? 1 : 0);
    const sad = s.phase === PHASE.GOAL && s.lastGoal !== p.side;
    bl.sad = Math.max(0, Math.min(1, bl.sad + (sad ? dt : -dt) * 4));

    const pose = p.grounded && !p.move ? idlePose(this.time + p.side * 0.37) : restPose();
    const fp = pose.footPivot;
    fp.rot += (-30 * bl.fwd + 30 * bl.back) * DEG;
    fp.x += -0.1 * bl.fwd + 0.7 * bl.back;
    pose.foot.x += (-0.378 - 0.143) * bl.back;
    pose.foot.y += (-0.258 + 0.559) * bl.back;
    if (p.move && p.grounded) {
      // a little bounce in the run (not in the original, which glides)
      const hop = Math.abs(Math.sin(this.time * 14 + p.side));
      pose.body.y += 0.06 * hop;
      pose.head.y += 0.09 * hop;
    }
    if (!p.grounded) {
      const j = Math.min(1, (p.air + alpha) / TPS);
      pose.head.y += 0.345 * j;
      pose.body.y += 0.2 * j;
    }
    if (p.land < 7) {
      const t = (p.land + alpha) / TPS;
      const a = tri(t, 0.067, 0.167);
      const hb = tri(t, 0.1, 0.167);
      pose.body.y -= 0.2 * a;
      pose.body.sx *= 1 + 0.05 * a;
      pose.body.sy *= 1 - 0.05 * a;
      pose.head.y -= 0.355 * hb;
      pose.head.sx *= 1 + 0.02 * hb;
      pose.head.sy *= 1 - 0.1 * hb;
    }
    if (p.kick < KICK_TICKS) {
      const t = (p.kick + alpha) / TPS;
      const wgt = t < 0.05 ? t / 0.05 : ease((t - 0.05) / 0.367);
      fp.rot += 70 * DEG * wgt;
      fp.x += (0.609 - 0.15) * wgt;
      fp.y += (1.278 - 1.064) * wgt;
    }
    if (p.header < 17) {
      const t = (p.header + alpha) / TPS;
      const wgt = t < 0.033 ? t / 0.033 : ease((t - 0.033) / 0.384);
      pose.head.rot -= 30 * DEG * wgt;
      pose.head.x += 0.4 * wgt;
    }
    if (bl.sad > 0) {
      // player_sad_idle: head down
      pose.head.rot -= 30 * DEG * bl.sad;
      pose.head.x += 0.35 * bl.sad;
    }
    if (s.phase === PHASE.GOAL && s.lastGoal === p.side) {
      // the scorer celebrates with a happy wobble
      pose.head.rot += Math.sin(this.time * 10) * 8 * DEG;
      pose.head.y += Math.abs(Math.sin(this.time * 7)) * 0.25;
    }
    return pose;
  }

  drawPlayer(q, s, alpha, dt, kit) {
    const { ctx } = this;
    const pose = this.pose(q, s, alpha, dt);
    if (!kit) return;
    const sc = this.k * VISUAL;
    ctx.save();
    ctx.translate(this.sx(q.x), this.sy(q.y));
    ctx.scale(sc * q.p.f, -sc);
    drawCharacter(ctx, kit, pose);
    ctx.restore();
  }

  drawTrail(x, y, b) {
    const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
    this.trail.push({ x, y, fast: speed > 11 });
    if (this.trail.length > 12) this.trail.shift();
    const pts = this.trail;
    const { ctx, k } = this;
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 1; i < pts.length; i++) {
      if (!pts[i].fast || !pts[i - 1].fast) continue;
      const f = i / pts.length;
      ctx.strokeStyle = `rgba(255,255,255,${0.45 * f})`;
      ctx.lineWidth = BALL_SIZE * k * 0.8 * f;
      ctx.beginPath();
      ctx.moveTo(this.sx(pts[i - 1].x), this.sy(pts[i - 1].y));
      ctx.lineTo(this.sx(pts[i].x), this.sy(pts[i].y));
      ctx.stroke();
    }
    ctx.restore();
  }

  drawBall(x, y, rot, golden) {
    const im = img(golden ? 'sprites/golden-ball.webp' : 'sprites/ball.webp') || img('sprites/ball.webp');
    if (!im) return;
    const { ctx, k } = this;
    const d = BALL_SIZE * k;
    ctx.save();
    ctx.translate(this.sx(x), this.sy(y));
    ctx.rotate(rot);
    ctx.drawImage(im, -d / 2, -d / 2, d, d);
    ctx.restore();
  }

  drawEffects(dt, layer) {
    const { ctx, k } = this;
    const dust = img('sprites/dust.webp');
    for (const e of this.effects) {
      if ((e.type === 'dust') !== (layer === 'under')) continue;
      e.t += dt;
      const u = e.t / e.life;
      if (u >= 1) continue;
      if (e.type === 'dust' && dust) {
        // one of the two puffs in the top row of the original sprite sheet
        const fw = dust.naturalWidth / 2;
        const fh = dust.naturalHeight / 2;
        const w = (fw * UNIT) * e.size * (0.7 + 0.6 * u) * k;
        const h = (fh * UNIT) * e.size * (0.7 + 0.6 * u) * k;
        ctx.save();
        ctx.globalAlpha = 1 - u;
        ctx.drawImage(dust, e.frame * fw, 0, fw, fh, this.sx(e.x) - w / 2, this.sy(e.y) - h * 0.8, w, h);
        ctx.restore();
      } else if (e.type === 'bit') {
        e.vy -= 9 * dt;
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.rot += e.vr * dt;
        ctx.save();
        ctx.globalAlpha = Math.min(1, (1 - u) * 3);
        ctx.translate(this.sx(e.x), this.sy(e.y));
        ctx.rotate(e.rot);
        ctx.fillStyle = e.color;
        ctx.fillRect(-0.08 * k, -0.04 * k, 0.16 * k, 0.08 * k);
        ctx.restore();
      }
    }
    if (layer === 'over') this.effects = this.effects.filter((e) => e.t < e.life);
  }

  /** "Match starts", the 3-2-1 countdown, "Gooal!", "Final whistle", "Golden goal". */
  drawBanners(s, alpha) {
    const t = (s.phaseTick + alpha) / TPS;
    if (s.phase === PHASE.INTRO) {
      if (t < 1.3) this.banner('ui/match-starts.webp', t, 1.3, 7.2);
      else {
        const left = INTRO_TICKS / TPS - t;
        const n = Math.ceil(left / 0.7);
        if (n >= 1 && n <= 3) this.countdown(String(n), 1 - (left % 0.7) / 0.7);
      }
    } else if (s.phase === PHASE.GOAL) {
      this.banner('ui/goal.webp', t, 2.75, 9.5);
    } else if (s.phase === PHASE.END) {
      if (s.winner >= 0 || s.score[0] === s.score[1]) this.banner('ui/final-whistle.webp', t, 99, 7.2);
    } else if (s.phase === PHASE.PLAY && s.golden && t < 2.5 && s.clock === 0) {
      this.text('GOLDEN GOAL!', t, 2.5, '#ffd23f');
    }
  }

  banner(path, t, life, width) {
    const im = img(path);
    if (!im) return;
    const { ctx, k } = this;
    const pop = t < 0.25 ? 0.4 + 0.75 * (t / 0.25) : t < 0.4 ? 1.15 - (t - 0.25) : 1;
    const fade = life - t < 0.3 ? Math.max(0, (life - t) / 0.3) : 1;
    const w = width * k * pop;
    const h = (w * im.naturalHeight) / im.naturalWidth;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.drawImage(im, this.ox - w / 2, this.sy(3.3) - h / 2, w, h);
    ctx.restore();
  }

  countdown(text, u) {
    const { ctx, k } = this;
    const size = k * (2.6 - 0.8 * u);
    ctx.save();
    ctx.globalAlpha = 1 - u * u;
    ctx.font = `${Math.round(size)}px "Lilita One", "Arial Black", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.14;
    ctx.strokeStyle = '#3a1d00';
    ctx.strokeText(text, this.ox, this.sy(3.3));
    ctx.fillStyle = '#ffd23f';
    ctx.fillText(text, this.ox, this.sy(3.3));
    ctx.restore();
  }

  text(text, t, life, color) {
    const { ctx, k } = this;
    const size = k * 1.1 * (t < 0.2 ? 0.5 + 2.5 * t : 1);
    ctx.save();
    ctx.globalAlpha = life - t < 0.4 ? Math.max(0, (life - t) / 0.4) : 1;
    ctx.font = `${Math.round(size)}px "Lilita One", "Arial Black", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.16;
    ctx.strokeStyle = '#3a1d00';
    ctx.strokeText(text, this.ox, this.sy(3.6));
    ctx.fillStyle = color;
    ctx.fillText(text, this.ox, this.sy(3.6));
    ctx.restore();
  }

  /** The scoreboard at the top: score, clock, score, and the names under it. */
  drawScoreboard(s, names, { top = 0 } = {}) {
    const { ctx } = this;
    const u = Math.min(this.h / 480, this.w / 853); // the original's 853x480 layout
    const cx = this.ox;
    const y = top * this.dpr;
    const W = 250 * u;
    const H = 52 * u;
    ctx.save();
    // panel
    ctx.fillStyle = '#26315e';
    roundRect(ctx, cx - W / 2, y - 12 * u, W, H + 12 * u, 12 * u);
    ctx.fill();
    ctx.lineWidth = 3 * u;
    ctx.strokeStyle = '#121a3a';
    ctx.stroke();
    // digits
    const box = (x, w, text, color) => {
      ctx.fillStyle = '#141b3c';
      roundRect(ctx, x - w / 2, y + 7 * u, w, 36 * u, 7 * u);
      ctx.fill();
      ctx.font = `${Math.round(30 * u)}px "Lilita One", "Arial Black", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = color;
      ctx.fillText(text, x, y + 26 * u);
    };
    const secs = Math.ceil(s.clock / TPS);
    box(cx - 82 * u, 48 * u, String(s.score[0]), '#ffcc29');
    box(cx, 74 * u, s.golden && s.clock === 0 ? 'GG' : String(secs), s.golden ? '#ffd23f' : secs <= 10 && s.phase === PHASE.PLAY ? '#ff6b5a' : '#ffffff');
    box(cx + 82 * u, 48 * u, String(s.score[1]), '#ffcc29');
    // names
    ctx.font = `${Math.round(15 * u)}px "Lilita One", "Arial Black", sans-serif`;
    for (const [i, dir] of [
      [0, -1],
      [1, 1],
    ]) {
      const name = names[i] || `Player ${i + 1}`;
      const tw = Math.min(150 * u, ctx.measureText(name).width + 22 * u);
      const nx = cx + dir * 70 * u;
      ctx.fillStyle = i === 0 ? '#2f6fd6' : '#e8742a';
      roundRect(ctx, nx - tw / 2, y + H, tw, 22 * u, 8 * u);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(fit(ctx, name, tw - 12 * u), nx, y + H + 11.5 * u);
    }
    ctx.restore();
  }

  /** Keyboard hints in the dirt under the pitch, like the original's desktop layout. */
  drawKeyHints(sets) {
    const { ctx } = this;
    const u = Math.min(this.h / 480, this.w / 853);
    const y = Math.min(this.h - 40 * u, this.sy(-1.55));
    ctx.save();
    ctx.globalAlpha = 0.9;
    for (const set of sets) {
      const right = set.side === 1;
      let x = right ? this.w - 22 * u : 22 * u;
      const items = right ? [...set.items].reverse() : set.items;
      for (const item of items) {
        const width = keyGroupWidth(item, u);
        const left = right ? x - width : x;
        drawKeyGroup(ctx, item, left, y, u);
        x = right ? left - 16 * u : left + width + 16 * u;
      }
    }
    ctx.restore();
  }
}

function fit(ctx, text, max) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const CAP = 26;
function keyGroupWidth(item, u) {
  return (item.keys.length === 3 ? 3 * CAP + 4 : CAP) * u;
}

/** One hint: a key cap (or W/A/D-style cluster) with a label under it. */
function drawKeyGroup(ctx, item, x, y, u) {
  const cap = (cx, cy, label) => {
    ctx.fillStyle = '#7a3d00';
    roundRect(ctx, cx, cy + 2 * u, (CAP - 2) * u, (CAP - 2) * u, 5 * u);
    ctx.fill();
    ctx.fillStyle = '#f0a020';
    roundRect(ctx, cx, cy, (CAP - 2) * u, (CAP - 4) * u, 5 * u);
    ctx.fill();
    ctx.fillStyle = '#5a2a00';
    ctx.font = `${Math.round(14 * u)}px "Lilita One", "Arial Black", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cx + ((CAP - 2) * u) / 2, cy + ((CAP - 4) * u) / 2 + 1 * u);
  };
  if (item.keys.length === 3) {
    cap(x + (CAP + 2) * u, y - (CAP - 2) * u, item.keys[1]); // up
    cap(x, y, item.keys[0]);
    cap(x + 2 * (CAP + 2) * u, y, item.keys[2]);
  } else cap(x, y, item.keys[0]);
  ctx.fillStyle = 'rgba(255,230,190,0.95)';
  ctx.font = `${Math.round(11 * u)}px "Lilita One", "Arial Black", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(item.label, x + keyGroupWidth(item, u) / 2, y + CAP * u);
}
