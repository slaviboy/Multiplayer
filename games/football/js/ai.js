// The computer player. It reads the match and presses the same keys a person
// would, so it plays by the same rules. Like the original's bot it switches
// between chasing the ball, holding the goal line, intercepting and striking.
// Its "random" choices come from a seeded generator, so a match against it is
// repeatable (the tests rely on that).
import { BALL_R, DT, GOAL_X, KEY, PHASE } from './sim.js';

export const LEVELS = {
  easy: { think: 10, error: 0.9, kick: 0.25, jump: 0.3, lob: 0.25, defend: 0.3 },
  normal: { think: 5, error: 0.45, kick: 0.6, jump: 0.6, lob: 0.35, defend: 0.6 },
  hard: { think: 2, error: 0.15, kick: 0.95, jump: 0.9, lob: 0.4, defend: 0.9 },
};

/** mulberry32: a small seeded generator. */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Where the ball will be after `ticks`, ignoring players (bounces off the ground and the side walls). */
export function predictBall(b, ticks) {
  let { x, y, vx, vy } = b;
  for (let i = 0; i < ticks; i++) {
    vy -= 21 * DT;
    x += vx * DT;
    y += vy * DT;
    if (y < BALL_R) {
      y = BALL_R;
      vy = vy < -1 ? -vy * 0.66 : 0;
    }
    if (x > 9.05 || x < -9.05) vx = -vx * 0.7;
  }
  return { x, y };
}

export class Cpu {
  constructor(side, level = 'normal', seed = 1) {
    this.side = side;
    this.level = LEVELS[level] || LEVELS.normal;
    this.rng = seededRandom(seed);
    this.moveBits = 0;
    this.offset = 0;
    this.lastKey = 0;
    this.nextThink = 0;
  }

  /** KEY bits for this tick. */
  input(s) {
    const L = this.level;
    if (s.phase !== PHASE.PLAY && s.phase !== PHASE.GOAL) {
      this.lastKey = 0;
      return 0;
    }
    const p = s.players[this.side];
    const o = s.players[1 - this.side];
    const b = s.ball;
    const f = p.f;
    let keys = 0;

    if (s.tick >= this.nextThink) {
      this.nextThink = s.tick + L.think;
      this.offset = (this.rng() - 0.5) * L.error;
      this.moveBits = this.plan(s, p, o, b, f);
    }
    keys |= this.moveBits;

    // reflexes, every tick
    const dx = (b.x - p.x) * f; // ball ahead (+) or behind (-)
    const dy = b.y - p.y;
    if (dx > -0.1 && dx < 1.3 && dy > 0 && dy < 1.45 && p.kick > 14 && this.rng() < L.kick) {
      const oppAhead = (o.x - p.x) * f;
      const blocked = oppAhead > 0 && oppAhead < 3.2 && o.grounded;
      const farFromGoal = (GOAL_X - p.x * f) > 9;
      const lob = blocked ? this.rng() < 0.75 : farFromGoal ? this.rng() < L.lob : this.rng() < L.lob * 0.4;
      keys |= lob ? KEY.LOB : KEY.SHOT;
    }
    // jump to head a high ball that is coming down near us (in front, not behind:
    // the back of the head sends it towards our own goal)
    if (p.grounded) {
      const soon = predictBall(b, 12);
      const sx = (soon.x - p.x) * f;
      if (sx > -0.4 && sx < 1.4 && soon.y - p.y > 2.1 && soon.y - p.y < 4.2 && this.rng() < L.jump * 0.35) keys |= KEY.JUMP;
    }
    // the ball is behind us on the ground: hop over it instead of pushing it into our goal
    if (p.grounded && dx < -0.1 && dx > -1.6 && b.y < 1.3 && this.moveBits === (f > 0 ? KEY.LEFT : KEY.RIGHT) && this.rng() < L.jump)
      keys |= KEY.JUMP;

    // kicks are key presses: let go for a tick before pressing again
    const kickKeys = keys & (KEY.SHOT | KEY.LOB);
    if (kickKeys && this.lastKey & (KEY.SHOT | KEY.LOB)) keys &= ~(KEY.SHOT | KEY.LOB);
    this.lastKey = keys;
    return keys;
  }

  plan(s, p, o, b, f) {
    const L = this.level;
    const ahead = predictBall(b, 10);
    const ownGoal = -f * GOAL_X;
    let target;
    const behind = (b.x - p.x) * f < -0.1; // where the ball is now, not where it will be
    const shotAtGoal = b.vx * f < -6 && (b.x - ownGoal) * f > 0;
    if (behind) {
      target = ahead.x - f * 1.15; // get back round the ball, to the goal side of it
    } else if (shotAtGoal && this.rng() < L.defend) {
      // a shot is coming: meet it
      target = ahead.x - f * 0.5;
    } else if ((b.x - ownGoal) * f > 8.5 && Math.abs(o.x - b.x) < Math.abs(p.x - b.x) - 1 && this.rng() < L.defend) {
      // the opponent has the ball far away: hold the goal line
      target = ownGoal + f * 2.4;
    } else {
      target = ahead.x - f * (0.55 + this.offset * 0.5);
    }
    target += this.offset * 0.3;
    // with the ball in front, never back off into our own goal mouth
    if (!behind) target = f > 0 ? Math.max(target, ownGoal + 1.3) : Math.min(target, ownGoal - 1.3);
    target = Math.max(-8.4, Math.min(8.4, target));
    if (target > p.x + 0.15) return KEY.RIGHT;
    if (target < p.x - 0.15) return KEY.LEFT;
    return 0;
  }
}
