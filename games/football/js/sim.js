// The match: two big-headed players, a ball and two goals.
//
// The simulation runs in fixed ticks (40 a second) and is deterministic: the same
// inputs give bit-identical results in every browser. Online play relies on that
// (both browsers run the match and exchange only the players' keys, see
// online.js), so this file uses only + - * / and Math.sqrt / abs / min / max /
// floor, which JavaScript defines exactly. Never Math.sin / cos / pow / hypot
// (their last bit may differ between engines), Math.random or the clock.
//
// Units are the original game's: 1 unit = 100 sprite pixels, y up, the pitch at
// y = 0, the goal mouths at x = ±7.75, and the camera shows x ±9.6, y -3.4…7.4.
// Player 0 starts on the left and attacks the right goal; player 1 the opposite.

export const TICKS_PER_SECOND = 40;
export const DT = 1 / TICKS_PER_SECOND;
const SUBSTEPS = 4; // the ball moves in quarter ticks so fast shots can't pass through posts
const H = DT / SUBSTEPS;

/** Input bits: one integer per player per tick. */
export const KEY = { LEFT: 1, RIGHT: 2, JUMP: 4, SHOT: 8, LOB: 16 };
export const MAX_INPUT = 31;

// ---- the pitch
export const GOAL_X = 7.75; // goal line
export const BAR_Y = 4.0; // crossbar centre: the goal mouth seen in perspective, halfway back
const BAR_R = 0.12;
const ROOF = { x: 9.75, y: 4.35, r: 0.08 }; // the top of the net slopes up to the back, so the ball rolls off
const NET_X = 9.35; // back of the net
const WALL_X = 9.6; // edges of the screen
const CEILING_Y = 7.0;

// ---- the ball
export const BALL_R = 0.3;
const BALL_G = 21;
const BALL_MAX = 26;
const GROUND_E = 0.66;
const WALL_E = 0.7;
const NET_E = 0.15;
const BAR_E = 0.6;
const ROOF_E = 0.45;
const PINCH_POP = 7;
const JAM_TICKS = 30; // pinched this long, the ball squirts out over the players' heads
const JAM_POP = 11.5;
const JAM_GHOST = 14; // ticks the players can't touch it while it rises
const ROLL_DRAG = 0.6; // per second, while rolling
const AIR_DRAG = 0.03; // per second
export const BALL_SPAWN = { x: 0, y: 6 };

// ---- the players (offsets for a player facing right; mirrored for the other)
export const HEAD = { x: -0.069, y: 1.373, r: 0.62 };
// body and legs: a capsule from the boots up to the shirt, so a ball beside it is
// pushed sideways (never down into the pitch)
const BODY = { x0: 0.05, y0: 0.27, x1: -0.03, y1: 0.75, r: 0.33 };
const RUN = 5.6;
const ACCEL = 70;
const JUMP_V = 10.4;
const PLAYER_G = 27;
const LIMIT_X = 8.95; // a player may step a little into the goal
const HALF_W = 0.48;
export const PLAYER_H = 1.99;
const BAR_BOX = { x: GOAL_X - BAR_R - 0.01, y0: BAR_Y - BAR_R - 0.02, y1: BAR_Y + 0.2 };
export const SPAWN_X = 5;

// ---- kicks and headers (after the original's strike configs: straight, aerial,
// air straight, air aerial; front, upward and back headers)
export const KICK_TICKS = 17; // the swing animation, 0.42 s
const STRIKE_TICKS = 7; // the foot can hit the ball in the first 0.17 s
const KICK_AGAIN = 13;
const HEADER_COOLDOWN = 8;
const STRIKES = {
  shot: { ground: [15.5, 3.2], air: [16.5, 0.6] },
  lob: { ground: [7.2, 13.2], air: [10.5, 9.5] },
};
const RUN_CARRY = 0.35; // running forward puts more into a shot

// ---- power-ups (the original's boosters). A fire or ice icon floats high over the
// pitch; when the ball hits it after a player touched the ball (kick, header or any
// touch), fire gives that player a fireball shot and ice freezes the other player.
export const ITEM_KINDS = ['fire', 'ice'];
export const ITEM_R = 0.55;
const ITEM_FIRST = [20, 30]; // seconds of play before an icon first appears
const ITEM_AGAIN = [12, 22]; // seconds until it comes back after it was taken or faded
export const ITEM_LIFE = 12 * TICKS_PER_SECOND; // it fades if nobody hits it
const ITEM_AREA = { x: 6.5, y0: 4.7, y1: 6.2 };
export const FIRE_READY = 10 * TICKS_PER_SECOND; // time to use the fireball
const FIRE_SPEED = 1.5; // a fireball strike is this much faster
const FIRE_FLIGHT = 50; // ticks the ball burns (or until it hits something)
const FIRE_GRAVITY = 0.35; // and it flies flatter
const FIRE_MAX = 34;
export const FREEZE_TICKS = 3 * TICKS_PER_SECOND;
const FREEZE_MASH = 6; // each key press breaks the ice this many ticks sooner
export const STUN_TICKS = 60; // hit by a fireball

// ---- match flow
export const PHASE = { INTRO: 'intro', PLAY: 'play', GOAL: 'goal', READY: 'ready', END: 'end' };
export const INTRO_TICKS = 140; // "Match starts", then 3, 2, 1
export const GOAL_TICKS = 110;
export const READY_TICKS = 40;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function newPlayer(side) {
  return {
    side,
    f: side === 0 ? 1 : -1, // facing
    x: side === 0 ? -SPAWN_X : SPAWN_X,
    y: 0,
    vx: 0,
    vy: 0,
    grounded: true,
    air: 0, // ticks off the ground
    land: 99, // ticks since landing
    move: 0, // -1, 0, 1: the direction pressed
    kick: 99, // ticks since the kick started
    kickType: 0, // 1 shot, 2 lob
    struck: false,
    header: 99, // ticks since the last header
    headerCd: 0,
    prev: 0, // last tick's input, for key presses
    fire: 0, // ticks left to use a fireball
    frozen: 0, // ticks left in the ice
    frozenFor: 0, // how long this freeze was
    stun: 0, // ticks left dazed by a fireball
  };
}

function newBall(rot = 0) {
  return {
    x: BALL_SPAWN.x,
    y: BALL_SPAWN.y,
    vx: 0,
    vy: 0,
    rot,
    held: true,
    jam: 0,
    ghost: 0,
    last: -1, // the player who touched it last
    fire: 0, // ticks it still burns
    fireBy: -1,
    fireHit: false,
  };
}

/** The match's own random numbers (mulberry32 on a seed kept in the state), the same in both browsers. */
function random(s) {
  s.rng = (s.rng + 0x6d2b79f5) | 0;
  let t = Math.imul(s.rng ^ (s.rng >>> 15), 1 | s.rng);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const ticksBetween = (s, [lo, hi]) => Math.round((lo + (hi - lo) * random(s)) * TICKS_PER_SECOND);

/**
 * A new match. `seconds` is the length of play (a draw goes to a golden goal);
 * `seed` decides where and when power-ups appear, `firstItem` (seconds) the range
 * in which the first ones do.
 */
export function createMatch({ seconds = 90, seed = 1, powerups = true, firstItem = ITEM_FIRST } = {}) {
  const s = {
    tick: 0,
    phase: PHASE.INTRO,
    phaseTick: 0,
    clock: Math.round(seconds * TICKS_PER_SECOND),
    golden: false,
    score: [0, 0],
    lastGoal: -1, // side that scored last
    winner: -1,
    ball: newBall(),
    players: [newPlayer(0), newPlayer(1)],
    rng: seed | 0,
    items: [],
    events: [], // what happened in the last tick (sounds, effects); cleared every tick
  };
  if (powerups) {
    for (const kind of ITEM_KINDS) s.items.push({ kind, live: false, timer: ticksBetween(s, firstItem), x: 0, y: 0, age: 0 });
  }
  return s;
}

function resetPositions(s) {
  s.players = [newPlayer(0), newPlayer(1)];
  s.ball = newBall(s.ball.rot);
}

function setPhase(s, phase) {
  s.phase = phase;
  s.phaseTick = 0;
}

function endMatch(s) {
  setPhase(s, PHASE.END);
  s.winner = s.score[0] > s.score[1] ? 0 : s.score[1] > s.score[0] ? 1 : -1;
  s.events.push({ type: 'final' });
}

/** Ends the match early (a player left); `side` wins. */
export function forfeit(s, side) {
  setPhase(s, PHASE.END);
  s.winner = side;
}

/** Runs one tick. `inputs` holds the two players' KEY bits. */
export function step(s, inputs) {
  s.events.length = 0;
  s.tick++;
  s.phaseTick++;
  if (s.phase === PHASE.END) return s;

  const canMove = s.phase === PHASE.PLAY || s.phase === PHASE.GOAL;
  for (const p of s.players) updatePlayer(s, p, canMove ? inputs[p.side] | 0 : 0);
  separatePlayers(s);
  if (!s.ball.held) {
    updateBall(s);
    strikes(s);
  }
  if (s.phase === PHASE.PLAY) updateItems(s);

  switch (s.phase) {
    case PHASE.INTRO:
    case PHASE.READY:
      if (s.phaseTick >= (s.phase === PHASE.INTRO ? INTRO_TICKS : READY_TICKS)) {
        setPhase(s, PHASE.PLAY);
        s.ball.held = false;
        s.events.push({ type: 'whistle' });
      }
      break;
    case PHASE.PLAY: {
      const scorer = goalScored(s.ball);
      if (scorer >= 0) {
        s.score[scorer]++;
        s.lastGoal = scorer;
        setPhase(s, PHASE.GOAL);
        s.events.push({ type: 'goal', side: scorer });
        break;
      }
      if (!s.golden) {
        s.clock--;
        if (s.clock <= 0) {
          s.clock = 0;
          if (s.score[0] !== s.score[1]) endMatch(s);
          else {
            s.golden = true;
            s.events.push({ type: 'golden' });
          }
        }
      }
      break;
    }
    case PHASE.GOAL:
      if (s.phaseTick >= GOAL_TICKS) {
        if (s.golden || s.clock <= 0) endMatch(s);
        else {
          resetPositions(s);
          setPhase(s, PHASE.READY);
        }
      }
      break;
  }
  return s;
}

/** 0 when the ball is wholly over the right goal line (player 0 scored), 1 for the left, else -1. */
function goalScored(b) {
  if (b.y >= BAR_Y) return -1;
  if (b.x - BALL_R > GOAL_X) return 0;
  if (b.x + BALL_R < -GOAL_X) return 1;
  return -1;
}

// ------------------------------------------------------------------ players

function updatePlayer(s, p, input) {
  let pressed = input & ~p.prev;
  p.prev = input;
  if (p.frozen > 0) {
    // in the ice: every key press cracks it a little sooner
    if (pressed) {
      p.frozen = Math.max(1, p.frozen - FREEZE_MASH);
      s.events.push({ type: 'crack', side: p.side });
    }
    if (--p.frozen === 0) s.events.push({ type: 'thaw', side: p.side });
    p.vx = 0;
    input = pressed = 0;
  } else if (p.stun > 0) {
    p.stun--;
    p.vx *= 0.9; // knocked back, sliding to a stop
    input = pressed = 0;
  }
  if (p.fire > 0 && s.phase === PHASE.PLAY && --p.fire === 0) s.events.push({ type: 'fizzle', side: p.side });

  const dir = (input & KEY.RIGHT ? 1 : 0) - (input & KEY.LEFT ? 1 : 0);
  p.move = dir;
  if (!p.stun) {
    const dv = dir * RUN - p.vx;
    const maxDv = ACCEL * DT;
    p.vx += clamp(dv, -maxDv, maxDv);
  }

  if (input & KEY.JUMP && p.grounded) {
    p.vy = JUMP_V;
    p.grounded = false;
    s.events.push({ type: 'jump', side: p.side });
  }

  if (pressed & (KEY.SHOT | KEY.LOB) && p.kick >= KICK_AGAIN) {
    p.kick = 0;
    p.kickType = pressed & KEY.SHOT ? 1 : 2;
    p.struck = false;
    s.events.push({ type: 'swing', side: p.side });
  } else if (p.kick < 99) p.kick++;
  if (p.header < 99) p.header++;
  if (p.headerCd > 0) p.headerCd--;
  if (p.land < 99) p.land++;

  p.vy -= PLAYER_G * DT;
  p.x += p.vx * DT;
  p.y += p.vy * DT;
  const wasGrounded = p.grounded;
  p.grounded = false;
  if (p.y <= 0) {
    if (!wasGrounded && p.air > 4) {
      p.land = 0;
      s.events.push({ type: 'land', side: p.side });
    }
    p.y = 0;
    p.vy = 0;
    p.grounded = true;
  }
  if (p.x < -LIMIT_X || p.x > LIMIT_X) {
    p.x = clamp(p.x, -LIMIT_X, LIMIT_X);
    p.vx = 0;
  }
  playerVsCrossbar(s, p, -1);
  playerVsCrossbar(s, p, 1);
  p.air = p.grounded ? 0 : p.air + 1;
}

/** Keeps a player out of the crossbar and the top of the net of the goal on side `g` (±1). */
function playerVsCrossbar(s, p, g) {
  const ax = p.x * g; // mirrored so the goal is on the right
  const ox = ax + HALF_W - BAR_BOX.x;
  const oy = Math.min(p.y + PLAYER_H, BAR_BOX.y1) - Math.max(p.y, BAR_BOX.y0);
  if (ox <= 0 || oy <= 0) return;
  if (ox >= oy && p.y + PLAYER_H / 2 < (BAR_BOX.y0 + BAR_BOX.y1) / 2) {
    p.y = BAR_BOX.y0 - PLAYER_H; // head against the bar
    if (p.vy > 0) p.vy = 0;
  } else {
    // from the side, or from above: nobody stands on the goal, they slide off onto the pitch
    p.x = (BAR_BOX.x - HALF_W) * g;
    if (p.vx * g > 0) p.vx = 0;
  }
}

/** Players can't walk through each other; one landing on the other's head stands on it. */
function separatePlayers(s) {
  const [a, b] = s.players;
  const dx = b.x - a.x;
  const minD = 2 * HALF_W * 0.95;
  const overlapY = Math.min(a.y, b.y) + PLAYER_H - Math.max(a.y, b.y);
  if (overlapY <= 0 || Math.abs(dx) >= minD) return;
  const top = a.y > b.y ? a : b;
  const low = top === a ? b : a;
  if (top.y - low.y > PLAYER_H * 0.7 && top.vy <= low.vy) {
    top.y = low.y + PLAYER_H;
    top.vy = low.vy > 0 ? low.vy : 0;
    top.grounded = true;
    return;
  }
  const dir = dx > 0 ? 1 : dx < 0 ? -1 : 1; // a goes to -dir, b to +dir
  const push = (minD - Math.abs(dx)) / 2;
  a.x -= dir * push;
  b.x += dir * push;
  // a player against the edge can't give way: the other takes the whole push
  for (const [p, q, sgn] of [
    [a, b, -dir],
    [b, a, dir],
  ]) {
    if (p.x < -LIMIT_X || p.x > LIMIT_X) {
      const over = p.x - clamp(p.x, -LIMIT_X, LIMIT_X);
      p.x -= over;
      q.x -= over;
      if (p.vx * sgn > 0) p.vx = 0;
    }
  }
  // velocities are left alone: two players pushing each other stand their ground,
  // one walking into a player who stands still pushes them at half speed
}

// ------------------------------------------------------------------ the ball

function updateBall(s) {
  const b = s.ball;
  let pinched = false;
  if (b.ghost > 0) b.ghost--;
  for (let i = 0; i < SUBSTEPS; i++) {
    b.vy -= BALL_G * (b.fire > 0 ? FIRE_GRAVITY : 1) * H;
    b.x += b.vx * H;
    b.y += b.vy * H;
    if (b.ghost === 0) {
      // alternate who goes first so neither player is favoured when both touch the ball
      const first = s.tick & 1;
      const a = ballVsPlayer(s, b, s.players[first]);
      const c = ballVsPlayer(s, b, s.players[1 - first]);
      if (a && c) {
        pinched = true;
        if (b.vy < PINCH_POP) {
          // squeezed between both players: it squirts out upwards
          b.vy = PINCH_POP;
          b.vx *= 0.5;
        }
      }
    }
    // last: a ball squeezed between players must not end up in the ground
    if (ballVsWorld(s, b) && b.fire > 0) endFire(s, b);
  }
  if (b.fire > 0 && --b.fire === 0) endFire(s, b);
  b.jam = pinched ? b.jam + 1 : 0;
  if (b.jam >= JAM_TICKS) {
    // stuck between two players pushing each other: up it goes, clear of their heads
    b.jam = 0;
    b.ghost = JAM_GHOST;
    b.vx = 0;
    b.vy = JAM_POP;
    s.events.push({ type: 'pop' });
  }
  const drag = b.y <= BALL_R + 0.01 ? ROLL_DRAG : AIR_DRAG;
  b.vx -= b.vx * drag * DT;
  const v2 = b.vx * b.vx + b.vy * b.vy;
  const max = b.fire > 0 ? FIRE_MAX : BALL_MAX;
  if (v2 > max * max) {
    const k = max / Math.sqrt(v2);
    b.vx *= k;
    b.vy *= k;
  }
  b.rot += (b.vx * DT) / BALL_R;
}

/** Keeps the ball in the pitch and bounces it off the goals; true when it hit something. */
function ballVsWorld(s, b) {
  let hit = false;
  if (b.y < BALL_R) {
    b.y = BALL_R;
    hit = true;
    if (b.vy < 0) {
      if (b.vy < -2) s.events.push({ type: 'bounce', speed: -b.vy });
      b.vy = b.vy > -1 ? 0 : -b.vy * GROUND_E;
    }
  }
  if (b.y > CEILING_Y) {
    b.y = CEILING_Y;
    hit = true;
    if (b.vy > 0) b.vy = -b.vy * WALL_E;
  }
  const lowEnough = b.y < BAR_Y;
  const back = (lowEnough ? NET_X : WALL_X) - BALL_R;
  if (b.x > back || b.x < -back) {
    const g = b.x > 0 ? 1 : -1;
    b.x = back * g;
    hit = true;
    if (b.vx * g > 0) {
      const e = lowEnough ? NET_E : WALL_E;
      if (!lowEnough && b.vx * g > 2) s.events.push({ type: 'bounce', speed: b.vx * g });
      b.vx = -b.vx * e;
    }
  }
  for (const g of [-1, 1]) {
    // the crossbar's front end, then the sloping top of the net behind it
    const hitBar = bounceOffCircle(b, GOAL_X * g, BAR_Y, BAR_R, 0, 0, BAR_E, 0);
    if (hitBar > 2.5) s.events.push({ type: 'post', side: g > 0 ? 1 : 0, speed: hitBar });
    if (hitBar > 0) hit = true;
    if (bounceOffSegment(b, GOAL_X * g, BAR_Y, ROOF.x * g, ROOF.y, ROOF.r, ROOF_E) > 0) hit = true;
  }
  return hit;
}

function endFire(s, b) {
  b.fire = 0;
  b.fireBy = -1;
  b.fireHit = false;
  s.events.push({ type: 'fire-out' });
}

/**
 * Pushes the ball out of a circle (centre cx, cy, radius r, moving at cvx, cvy) and
 * bounces it with restitution `e`. Returns the speed of the impact (0: no contact).
 */
function bounceOffCircle(b, cx, cy, r, cvx, cvy, e, friction) {
  const dx = b.x - cx;
  const dy = b.y - cy;
  const rr = r + BALL_R;
  const d2 = dx * dx + dy * dy;
  if (d2 >= rr * rr) return 0;
  const d = Math.sqrt(d2);
  const nx = d > 1e-9 ? dx / d : 0;
  const ny = d > 1e-9 ? dy / d : 1;
  b.x = cx + nx * rr;
  b.y = cy + ny * rr;
  return reflect(b, nx, ny, cvx, cvy, e, friction);
}

function reflect(b, nx, ny, cvx, cvy, e, friction) {
  const rvx = b.vx - cvx;
  const rvy = b.vy - cvy;
  const vn = rvx * nx + rvy * ny;
  if (vn >= 0) return 0.001; // touching but already moving apart
  const tx = rvx - vn * nx;
  const ty = rvy - vn * ny;
  b.vx = cvx + tx * (1 - friction) - e * vn * nx;
  b.vy = cvy + ty * (1 - friction) - e * vn * ny;
  return -vn;
}

function bounceOffSegment(b, x0, y0, x1, y1, r, e) {
  const sx = x1 - x0;
  const sy = y1 - y0;
  let t = ((b.x - x0) * sx + (b.y - y0) * sy) / (sx * sx + sy * sy);
  t = clamp(t, 0, 1);
  return bounceOffCircle(b, x0 + sx * t, y0 + sy * t, r, 0, 0, e, 0);
}

/** Is the ball overlapping this player (head or body)? */
function ballTouches(b, p) {
  const hx = b.x - (p.x + HEAD.x * p.f);
  const hy = b.y - (p.y + HEAD.y);
  const hr = HEAD.r + BALL_R;
  if (hx * hx + hy * hy < hr * hr) return true;
  const cx = b.x - p.x;
  const dy = b.y - p.y - clamp(b.y - p.y, BODY.y0, BODY.y1);
  const br = BODY.r + BALL_R;
  return cx * cx + dy * dy < br * br;
}

/** Returns true when the ball touched this player. */
function ballVsPlayer(s, b, p) {
  if (b.fire > 0 && p.side !== b.fireBy) {
    // a fireball goes straight through the other player and knocks them out for a moment
    if (!ballTouches(b, p)) return false;
    if (!b.fireHit) {
      b.fireHit = true;
      if (p.frozen > 0) p.frozen = 1; // the fire melts the ice
      else p.stun = STUN_TICKS;
      p.vx = (b.vx > 0 ? 1 : -1) * 6;
      if (p.grounded) {
        p.vy = 5;
        p.grounded = false;
      }
      p.kick = 99;
      s.events.push({ type: 'stun', side: p.side });
    }
    return false;
  }
  let touched = false;
  // the head: headers
  const hx = p.x + HEAD.x * p.f;
  const hy = p.y + HEAD.y;
  const dx = b.x - hx;
  const dy = b.y - hy;
  const rr = HEAD.r + BALL_R;
  const d2 = dx * dx + dy * dy;
  if (d2 < rr * rr) {
    const d = Math.sqrt(d2);
    const nx = d > 1e-9 ? dx / d : 0;
    const ny = d > 1e-9 ? dy / d : 1;
    b.x = hx + nx * rr;
    b.y = hy + ny * rr;
    touched = true;
    const vn = (b.vx - p.vx) * nx + (b.vy - p.vy) * ny;
    if (vn < 0) {
      if (ny > -0.35 && p.headerCd === 0 && !p.frozen && !p.stun) header(s, b, p, nx, ny);
      else {
        const hit = reflect(b, nx, ny, p.vx, p.vy, 0.5, 0.1);
        if (hit > 1.5) s.events.push({ type: 'touch', side: p.side, speed: hit });
      }
    }
  }
  // body: a plain bounce; a player running into the ball dribbles it
  const x0 = p.x + BODY.x0 * p.f;
  const x1 = p.x + BODY.x1 * p.f;
  const y0 = p.y + BODY.y0;
  const y1 = p.y + BODY.y1;
  const t = clamp(((b.x - x0) * (x1 - x0) + (b.y - y0) * (y1 - y0)) / ((x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0)), 0, 1);
  const hit = bounceOffCircle(b, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, BODY.r, p.vx, p.vy, 0.45, 0.05);
  if (hit > 0) touched = true;
  if (hit > 1.5) s.events.push({ type: 'touch', side: p.side, speed: hit });
  if (touched) b.last = p.side;
  return touched;
}

/** Front of the face: a looping header forward; top: straight up; back of the head: backwards. */
function header(s, b, p, nx, ny) {
  const side = nx * p.f;
  const lift = p.vy > 0 ? p.vy * 0.35 : 0;
  const runFwd = p.vx * p.f > 0 ? p.vx * p.f * RUN_CARRY : 0;
  if (side > 0.4) {
    b.vx = p.f * (6.8 + runFwd);
    b.vy = 6.5 + lift + ny * 2;
  } else if (side < -0.4) {
    b.vx = -p.f * 3.4;
    b.vy = 7 + lift;
  } else {
    b.vx = nx * 3 + p.vx * 0.5;
    b.vy = 8.2 + lift;
  }
  p.header = 0;
  p.headerCd = HEADER_COOLDOWN;
  b.last = p.side;
  s.events.push({ type: 'header', side: p.side });
  if (p.fire > 0 && side > -0.4) {
    // a fireball header: flat and fast towards the goal
    b.vx = p.f * 19;
    b.vy = 2 + lift;
    lightFire(s, b, p);
  }
}

function lightFire(s, b, p) {
  p.fire = 0;
  b.fire = FIRE_FLIGHT;
  b.fireBy = p.side;
  b.fireHit = false;
  s.events.push({ type: 'fireball', side: p.side });
}

/** A swinging foot strikes the ball once if it is within reach in the first ticks of the swing. */
function strikes(s) {
  const b = s.ball;
  if (b.ghost > 0) return;
  const first = s.tick & 1;
  for (const p of [s.players[first], s.players[1 - first]]) {
    if (p.kick >= STRIKE_TICKS || p.struck || p.frozen || p.stun) continue;
    const lob = p.kickType === 2;
    const zx = p.x + p.f * (lob ? 0.5 : 0.6);
    const zy = p.y + (lob ? 0.62 : 0.42);
    const zr = lob ? 0.95 : 0.85;
    const dx = b.x - zx;
    const dy = b.y - zy;
    if (dx * dx + dy * dy >= zr * zr || (b.x - p.x) * p.f < -0.15) continue;
    const [vx, vy] = STRIKES[lob ? 'lob' : 'shot'][p.grounded ? 'ground' : 'air'];
    const runFwd = p.vx * p.f > 0 ? p.vx * p.f * RUN_CARRY : 0;
    b.vx = p.f * (vx + runFwd);
    b.vy = vy + (p.vy > 0 ? p.vy * 0.2 : 0);
    p.struck = true;
    b.last = p.side;
    s.events.push({ type: 'kick', side: p.side, lob });
    if (p.fire > 0) {
      b.vx *= FIRE_SPEED;
      if (!lob) b.vy *= 0.6;
      lightFire(s, b, p);
    }
  }
}

// ------------------------------------------------------------------ power-ups

function updateItems(s) {
  const b = s.ball;
  for (const it of s.items) {
    if (!it.live) {
      if (--it.timer <= 0) spawnItem(s, it);
      continue;
    }
    it.age++;
    if (it.age >= ITEM_LIFE) {
      it.live = false;
      it.timer = ticksBetween(s, ITEM_AGAIN);
      s.events.push({ type: 'item-gone', kind: it.kind });
      continue;
    }
    const dx = b.x - it.x;
    const dy = b.y - it.y;
    const rr = ITEM_R + BALL_R;
    if (b.last >= 0 && !b.held && dx * dx + dy * dy < rr * rr) activate(s, it, b.last);
  }
}

function spawnItem(s, it) {
  let x = (random(s) * 2 - 1) * ITEM_AREA.x;
  const y = ITEM_AREA.y0 + (ITEM_AREA.y1 - ITEM_AREA.y0) * random(s);
  // not on top of the other icon, nor right where the ball is
  for (const o of s.items) {
    if (o !== it && o.live && Math.abs(o.x - x) < 2.5) x = x > o.x ? Math.min(ITEM_AREA.x, x + 3) : Math.max(-ITEM_AREA.x, x - 3);
  }
  if (Math.abs(s.ball.x - x) < 1.2 && Math.abs(s.ball.y - y) < 1.2) x = x > 0 ? x - 2.5 : x + 2.5;
  Object.assign(it, { live: true, x, y, age: 0 });
  s.events.push({ type: 'item', kind: it.kind, x, y });
}

/** The ball hit an icon after `side` touched it: fire for them, ice for the other player. */
function activate(s, it, side) {
  it.live = false;
  it.timer = ticksBetween(s, ITEM_AGAIN);
  if (it.kind === 'fire') {
    s.players[side].fire = FIRE_READY;
    s.events.push({ type: 'power', kind: 'fire', side, x: it.x, y: it.y });
  } else {
    const p = s.players[1 - side];
    p.frozen = FREEZE_TICKS;
    p.frozenFor = FREEZE_TICKS;
    p.stun = 0;
    p.vx = 0;
    p.kick = 99;
    s.events.push({ type: 'power', kind: 'ice', side: p.side, by: side, x: it.x, y: it.y });
  }
}

// ------------------------------------------------------------------ for online play

/** A 32-bit hash of everything that matters, to check that two browsers agree. */
export function hashState(s) {
  const view = new DataView(new ArrayBuffer(8));
  let h = 0x811c9dc5;
  const mix = (v) => {
    view.setFloat64(0, v);
    for (let i = 0; i < 8; i++) h = Math.imul(h ^ view.getUint8(i), 0x01000193);
  };
  const b = s.ball;
  for (const v of [s.tick, s.phaseTick, s.clock, s.score[0], s.score[1], s.rng, b.x, b.y, b.vx, b.vy, b.jam, b.ghost, b.last, b.fire]) mix(v);
  for (const p of s.players) for (const v of [p.x, p.y, p.vx, p.vy, p.kick, p.header, p.fire, p.frozen, p.stun]) mix(v);
  for (const it of s.items) for (const v of [it.live ? 1 : 0, it.timer, it.x, it.y, it.age]) mix(v);
  return h | 0;
}

export const PHASES = Object.values(PHASE);
