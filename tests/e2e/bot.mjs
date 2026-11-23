// A small bot that plays a Stan & Lisa level with real inputs, to prove a level
// can be finished. Each level source in games/stan-and-lisa/levels-src/ carries a
// `walkthrough`: one list of steps per character ('fb' = Stan, 'wg' = Lisa), run
// side by side. Positions are in tiles (a character's x is its centre column:
// a marker in column c means x = c + 1). Steps:
//   { go: x }                        walk until the centre is within 0.3 tiles of x
//   { jump: 'left'|'right'|'up', to?: x }  jump, keep steering until landed past x
//   { set: 'flag' } / { wait: 'flag' }  coordinate the two characters
//   { idle: seconds }                game time, e.g. while a lift travels
//   { walk: 'left'|'right', untilAbove: row }  e.g. walk into a portal until moved upstairs
//   { climb: 'up'|'left'|'right', untilAbove: row }  hold up (a ladder) until above a row
// Levers: the default lever leans left and switches when pushed to the right;
// the mirrored one ('leverMirrored') leans right and switches when pushed left.
// The level passes when the game registers the win (both doors up) with nobody dead.

export function botSource() {
  // Runs inside the page. Installed once; ticks from a Level.update wrapper.
  const ZERO = { l: false, r: false, u: false };
  const bot = {
    active: false,
    tracks: {},
    flags: {},
    log: [],
    result: null,
    t: 0,
    start(walkthrough) {
      this.tracks = {};
      for (const id of Object.keys(walkthrough)) this.tracks[id] = { steps: walkthrough[id].slice(), i: 0, s: null };
      this.flags = {};
      this.log = [];
      this.result = null;
      this.t = 0;
      this.active = true;
    },
    charOf(level, id) {
      return [level.pers1, level.pers2].find((c) => c && c.data && c.data.char === id);
    },
    tick(level) {
      if (!this.active || !level.loadCompleted) return;
      const game = level.game;
      const dt = Math.min(0.05, game.time.elapsed / 1000);
      if (!game.physics.box2d.paused) this.t += dt;
      for (const ch of [level.pers1, level.pers2]) {
        if (ch && !ch.cursors._bot) {
          ch.cursors = {
            _bot: true,
            left: { isDown: false },
            right: { isDown: false },
            up: { isDown: false },
            active: false,
            enabled: true,
            checkActive() {
              return this.left.isDown || this.right.isDown || this.up.isDown;
            },
            updateKeys() {},
            updateDowns() {},
            show() {},
            hide() {},
            destroy() {},
          };
        }
      }
      if ([level.pers1, level.pers2].some((c) => c && c.dying)) {
        const who = [level.pers1, level.pers2].find((c) => c.dying).data.char;
        this.finish(`died: ${who}`, level);
        return;
      }
      if (level.ended) {
        this.finish(level.door1.isUp && level.door2.isUp ? 'win' : 'ended', level);
        return;
      }
      if (game.physics.box2d.paused) return;
      for (const [id, tr] of Object.entries(this.tracks)) {
        const ch = this.charOf(level, id);
        if (!ch) continue;
        const inp = this.step(level, ch, tr, dt) || ZERO;
        ch.cursors.left.isDown = !!inp.l;
        ch.cursors.right.isDown = !!inp.r;
        ch.cursors.up.isDown = !!inp.u;
        ch.cursors.active = !!(inp.l || inp.r || inp.u);
      }
    },
    grounded(ch) {
      return ch.feetSensor && ch.feetSensor.contacts.length > 0;
    },
    step(level, ch, tr, dt) {
      const st = tr.steps[tr.i];
      if (!st) return ZERO;
      if (!tr.s) {
        tr.s = { t: 0, f: 0 };
        this.log.push(`${this.t.toFixed(1)}s ${ch.data.char} #${tr.i} ${JSON.stringify(st)} @${(ch.sprite.x / 32).toFixed(1)},${(ch.sprite.y / 32).toFixed(1)}`);
      }
      const s = tr.s;
      s.t += dt;
      s.f++;
      const x = ch.sprite.x / 32;
      const next = () => {
        tr.i++;
        tr.s = null;
      };
      if (st.set) {
        this.flags[st.set] = true;
        next();
        return ZERO;
      }
      if (st.wait) {
        if (this.flags[st.wait]) next();
        return ZERO;
      }
      if (st.idle != null) {
        if (s.t >= st.idle) next();
        return ZERO;
      }
      if (st.climb) {
        // hold up (and optionally steer) until above a row, e.g. up a ladder
        const y = ch.sprite.y / 32;
        if (y < st.untilAbove) {
          next();
          return ZERO;
        }
        if (s.t > (st.max || 10)) {
          this.finish(`stuck: ${ch.data.char} step ${tr.i} climb at ${x.toFixed(2)},${y.toFixed(2)}`, level);
          return ZERO;
        }
        return { l: st.climb === 'left', r: st.climb === 'right', u: true };
      }
      if (st.walk) {
        // hold a direction until the character is above a row (e.g. taken by a portal)
        const y = ch.sprite.y / 32;
        if (st.untilAbove != null && y < st.untilAbove) {
          next();
          return ZERO;
        }
        if (s.t > (st.max || 10)) {
          this.finish(`stuck: ${ch.data.char} step ${tr.i} walk ${st.walk} at ${x.toFixed(2)},${y.toFixed(2)}`, level);
          return ZERO;
        }
        return { l: st.walk === 'left', r: st.walk === 'right', u: false };
      }
      if (st.go != null) {
        const d = st.go - x;
        if (Math.abs(d) < (st.tol || 0.3) && this.grounded(ch)) {
          next();
          return ZERO;
        }
        if (s.t > (st.max || 12)) {
          this.finish(`stuck: ${ch.data.char} step ${tr.i} go ${st.go} at x=${x.toFixed(2)}`, level);
          return ZERO;
        }
        // ease off when close so we don't overshoot
        if (Math.abs(d) < 0.6 && Math.abs(ch.body.velocity.x) > 3 && s.f % 2) return ZERO;
        return { l: d < 0, r: d > 0, u: false };
      }
      if (st.jump) {
        const dir = st.jump;
        const steer = { l: dir === 'left', r: dir === 'right' };
        if (s.f <= 4) return { ...steer, u: true };
        const passed = st.to == null || (dir === 'left' ? x <= st.to : dir === 'right' ? x >= st.to : true);
        if (s.t > 0.25 && this.grounded(ch) && passed) {
          next();
          return ZERO;
        }
        if (s.t > (st.max || 4)) {
          this.finish(`stuck: ${ch.data.char} step ${tr.i} jump ${dir} to ${st.to} at x=${x.toFixed(2)}`, level);
          return ZERO;
        }
        return passed && st.to != null ? ZERO : steer;
      }
      next();
      return ZERO;
    },
    finish(result, level) {
      if (this.result) return;
      this.result = result;
      this.active = false;
      const pos = [level.pers1, level.pers2].map((c) => `${c.data.char}@${(c.sprite.x / 32).toFixed(1)},${(c.sprite.y / 32).toFixed(1)}`);
      this.log.push(`${this.t.toFixed(1)}s RESULT ${result} ${pos.join(' ')}`);
    },
  };
  window.__bot = bot;
  const Level = window.require('States/Level/Level');
  const L = Level.prototype;
  if (!L.update._bot) {
    const orig = L.update;
    L.update = function (...a) {
      try {
        window.__bot.tick(this);
      } catch (err) {
        window.__bot.result = `bot error: ${err.message}`;
      }
      return orig.apply(this, a);
    };
    L.update._bot = true;
  }
}

/** Loads `file` in the page and plays it with `walkthrough`; resolves to { result, log }. */
export async function playLevel(page, file, walkthrough, { timeout = 240_000 } = {}) {
  await page.evaluate(botSource);
  await page.evaluate(
    ({ file, walkthrough }) => {
      const g = Phaser.GAMES[0];
      g.currentTemple = g.progress.get('temples')[0];
      if (g.level && g.state.current === 'level' && !g.level._olKilled) {
        try {
          g.level.sounds.levelMusic.stop();
        } catch {
          /* already stopped */
        }
        g.level.killAll();
      }
      window.__bot.start(walkthrough);
      g.state.add('level', window.require('States/Level/Level'));
      g.state.fade('level', true, false, { id: 9000, filename: 'friends/levels/' + file, time: 999, mobileTime: 999 });
    },
    { file, walkthrough },
  );
  await page.waitForFunction(() => window.__bot && window.__bot.result, null, { timeout, polling: 250 });
  return page.evaluate(() => ({ result: window.__bot.result, log: window.__bot.log }));
}
