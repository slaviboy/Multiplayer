// Goal Heads: the app. Menus, the match loop, sounds; online play is in online.js.
import { createMatch, DT, PHASE, step, TICKS_PER_SECOND as TPS } from './sim.js';
import { Cpu } from './ai.js';
import { Renderer } from './render.js';
import { Controls, HINTS_SOLO, HINTS_TWO, isTouchDevice } from './input.js';
import { LEVEL_NAMES, Screens } from './ui.js';
import { CORE_IMAGES, kitImages, loadAll, loadPrefs, savePrefs, Sound } from './assets.js';
import { defaultKit, distinctKits, kitName, randomKit, validKit } from './roster.js';
import { STADIUMS } from './catalog.js';
import { Online } from './online.js';

const prefs = loadPrefs();
const sound = new Sound(prefs);
const canvas = document.getElementById('pitch');
const renderer = new Renderer(canvas);
const controls = new Controls();
const screens = new Screens(document.getElementById('screens'), { sound, prefs, savePrefs: () => savePrefs(prefs) });
const pad = document.getElementById('pad');
const pauseBtn = document.getElementById('pause-btn');
const touch = isTouchDevice();
controls.attachPad(pad);

const RESULT_DELAY = 100; // ticks of "Final whistle" before the result screen
const COUNT_TICKS = { 56: 'count-32', 84: 'count-32', 112: 'count-1' };

const app = {
  mode: null, // 'cpu' | 'local' | 'online'
  match: null,
  options: {
    stadium: STADIUMS.includes(prefs.stadium) ? prefs.stadium : 'favela-day',
    seconds: [60, 90, 120].includes(prefs.seconds) ? prefs.seconds : 90,
    level: LEVEL_NAMES[prefs.level] ? prefs.level : 'normal',
  },
  kits: [validKit(prefs.kit) || defaultKit('leon-messo'), validKit(prefs.kit2) || defaultKit('cristo-ronalto')],
  opponent: null, // the CPU's outfit, kept for rematches
};

function remember() {
  Object.assign(prefs, { stadium: app.options.stadium, seconds: app.options.seconds, level: app.options.level, kit: app.kits[0], kit2: app.kits[1] });
  savePrefs(prefs);
}

// ------------------------------------------------------------------ menus

function toMenu() {
  endMatch();
  app.mode = null;
  screens.menu({ onCpu: chooseForCpu, onLocal: chooseForLocal, onOnline: () => online.host(), showLocal: !touch });
  sound.playMusic();
}

function chooseForCpu() {
  app.mode = 'cpu';
  screens.select({
    title: 'Choose your player',
    sub: 'You play on the left. Pick a head, then a shirt and boots.',
    kit: app.kits[0],
    options: app.options,
    confirm: 'Play',
    onBack: toMenu,
    onDone: (kit) => {
      app.kits[0] = kit;
      app.opponent = randomKit(Math.random, kit);
      remember();
      playCpu();
    },
  });
}

function playCpu() {
  const kits = distinctKits(app.kits[0], app.opponent);
  const names = kits.map(kitName);
  versusThen({ kits, names, labels: ['You', `CPU · ${LEVEL_NAMES[app.options.level]}`] }, () =>
    startMatch({ mode: 'cpu', kits, names, ...app.options, seed: (Math.random() * 2 ** 31) | 0 }),
  );
}

function chooseForLocal(step2 = false) {
  app.mode = 'local';
  const second = step2 === true;
  screens.select({
    title: second ? 'Player 2: choose your player' : 'Player 1: choose your player',
    sub: second ? 'Right side: ← ↑ → to move and jump, K shot, L aerial.' : 'Left side: W A D to move and jump, T shot, Y aerial.',
    kit: app.kits[second ? 1 : 0],
    side: second ? 'right' : 'left',
    options: second ? { stadium: app.options.stadium, seconds: app.options.seconds, onChange: (k, v) => (app.options[k] = v) } : app.options,
    confirm: second ? 'Play' : 'Next',
    onBack: second ? () => chooseForLocal() : toMenu,
    onDone: (kit) => {
      app.kits[second ? 1 : 0] = kit;
      remember();
      if (!second) chooseForLocal(true);
      else playLocal();
    },
  });
}

function playLocal() {
  const kits = distinctKits(app.kits[0], app.kits[1]);
  const names = kits.map(kitName);
  versusThen({ kits, names, labels: ['Player 1', 'Player 2'] }, () => startMatch({ mode: 'local', kits, names, ...app.options }));
}

function versusThen(o, then) {
  screens.versus(o);
  sound.unlock();
  sound.play('matched', { volume: 0.7 });
  const until = performance.now() + 2200;
  Promise.all([loadAll([...kitImages(o.kits[0]), ...kitImages(o.kits[1]), `stadiums/${app.options.stadium}.jpg`]), new Promise((r) => setTimeout(r, 2200))]).then(() => {
    if (screens.current === 'versus' && performance.now() >= until - 50) then();
  });
}

// ------------------------------------------------------------------ the match

/**
 * Starts a match. `online` matches are driven by online.js (it calls runTick);
 * the others run here, at 40 ticks a second.
 */
async function startMatch({ mode, kits, names, stadium, seconds, level = 'normal', seed = 1, online: net = null }) {
  await loadAll([...kitImages(kits[0]), ...kitImages(kits[1]), `stadiums/${stadium}.jpg`]);
  app.mode = mode;
  app.match = {
    mode,
    s: createMatch({ seconds }),
    prev: null,
    kits,
    names,
    stadium,
    seconds,
    level,
    seed,
    cpu: mode === 'cpu' ? new Cpu(1, level, seed) : null,
    net,
    paused: false,
    acc: 0,
    resultShown: false,
  };
  if (window.__football.testScore) app.match.s.score = window.__football.testScore.slice(); // tests: no draws
  screens.hide();
  sound.stopMusic();
  sound.play('whistle-start', { volume: 0.4 });
  controls.setEnabled(true);
  pad.hidden = !touch || mode === 'local';
  pauseBtn.hidden = false;
  pauseBtn.setAttribute('aria-label', mode === 'online' ? 'Leave the match' : 'Pause');
  return app.match;
}

function endMatch() {
  app.match = null;
  controls.setEnabled(false);
  pad.hidden = true;
  pauseBtn.hidden = true;
}

function snapshot(s) {
  return { players: s.players.map((p) => ({ x: p.x, y: p.y })), ball: { x: s.ball.x, y: s.ball.y, rot: s.ball.rot } };
}

/** Runs one tick of the current match with both players' inputs. */
function runTick(inputs) {
  const m = app.match;
  m.prev = snapshot(m.s);
  step(m.s, inputs);
  for (const e of m.s.events) {
    renderer.onEvent(e, m.s);
    soundFor(e, m);
  }
  if (m.s.phase === PHASE.INTRO && COUNT_TICKS[m.s.phaseTick]) sound.play(COUNT_TICKS[m.s.phaseTick], { volume: 0.6 });
}

/** Which side is "me" for cheers and the result: the left player, or the guest online. */
const mySide = (m) => (m.mode === 'online' && m.net ? m.net.me : 0);

function soundFor(e, m) {
  switch (e.type) {
    case 'whistle':
      sound.play('whistle-start', { volume: 0.6 });
      break;
    case 'final':
      sound.play('whistle-final', { volume: 0.7 });
      break;
    case 'golden':
      sound.play('whistle-end', { volume: 0.7 });
      break;
    case 'goal': {
      sound.play('goal-', { volume: 0.9 });
      const happy = m.mode === 'local' || e.side === mySide(m);
      sound.play(happy ? 'cheer-' : 'boo-1', { volume: 0.55 });
      break;
    }
    case 'kick':
      sound.play('shot-', { volume: 0.8, rate: e.lob ? 0.9 : 1 });
      break;
    case 'header':
      sound.play('touch-', { volume: 0.9 });
      break;
    case 'touch':
    case 'pop':
      sound.play('touch-', { volume: Math.min(0.8, (e.speed || 4) / 10) });
      break;
    case 'bounce':
      sound.play('bounce-', { volume: Math.min(0.7, e.speed / 14) });
      break;
    case 'post':
      sound.play('post-', { volume: Math.min(1, e.speed / 10) });
      break;
    case 'jump':
      sound.play('jump-', { volume: 0.35 });
      break;
  }
}

function localInputs(m) {
  if (m.mode === 'cpu') return [controls.solo(), m.cpu.input(m.s)];
  return [controls.player(0), controls.player(1)];
}

function showResult(m) {
  const s = m.s;
  const w = s.winner;
  let title;
  if (m.mode === 'local') title = w < 0 ? 'Draw' : `${m.names[w]} wins!`;
  else title = w < 0 ? 'Draw' : w === mySide(m) ? 'You won!' : 'You lost';
  sound.play(w === mySide(m) || m.mode === 'local' ? 'win' : 'game-over', { volume: 0.6 });
  if (m.mode === 'online') return online.showResult(m, title);
  controls.setEnabled(false);
  pad.hidden = true;
  pauseBtn.hidden = true;
  screens.result({
    title,
    sub: s.golden ? 'Decided by a golden goal' : '',
    score: s.score,
    kits: m.kits,
    names: m.names,
    winner: w,
    buttons: [
      { label: 'Play again', kind: 'green', action: 'again', onClick: () => (m.mode === 'cpu' ? playCpu() : playLocal()) },
      { label: 'Change players', kind: 'blue', action: 'change', onClick: () => (m.mode === 'cpu' ? chooseForCpu() : chooseForLocal()) },
      { label: 'Menu', kind: 'orange', action: 'menu', onClick: toMenu },
    ],
  });
}

function pause() {
  const m = app.match;
  if (!m || m.paused || m.resultShown) return;
  if (m.mode === 'online') {
    online.confirmLeave();
    return;
  }
  m.paused = true;
  controls.setEnabled(false);
  screens.pause({
    onResume: resume,
    onRestart: () => (m.mode === 'cpu' ? playCpu() : playLocal()),
    onQuit: toMenu,
  });
}

function resume() {
  const m = app.match;
  if (!m) return;
  screens.hide();
  m.paused = false;
  m.acc = 0;
  controls.setEnabled(true);
}

pauseBtn.addEventListener('click', () => {
  sound.play('click', { volume: 0.6 });
  pause();
});
window.addEventListener('keydown', (e) => {
  if ((e.code === 'Escape' || e.code === 'KeyP') && app.match && !e.repeat) {
    const t = e.target && e.target.tagName;
    if (t === 'INPUT' || t === 'TEXTAREA') return;
    if (app.match.paused) resume();
    else pause();
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && app.match && app.match.mode !== 'online') pause();
});
window.addEventListener('pointerdown', () => sound.unlock(), { capture: true });
window.addEventListener('keydown', () => sound.unlock(), { capture: true });

// ------------------------------------------------------------------ the loop

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  renderer.resize();
  const m = app.match;
  document.body.classList.toggle('fb-in-match', !!m && !m.resultShown);
  if (m) {
    let alpha = 1;
    if (m.mode === 'online') alpha = online.frame(dt);
    else if (!m.paused) {
      m.acc += dt;
      let n = 0;
      while (m.acc >= DT && n < 6) {
        runTick(localInputs(m));
        m.acc -= DT;
        n++;
      }
      if (n === 6) m.acc = 0; // too far behind (a slow frame): don't try to catch up
      alpha = m.acc / DT;
    }
    renderer.draw(m.s, m.prev, Math.min(1, alpha), m.paused ? 0 : dt, { kits: m.kits, stadium: m.stadium });
    renderer.drawScoreboard(m.s, m.names, { top: online.hudSpace() });
    if (!touch) renderer.drawKeyHints(m.mode === 'local' ? HINTS_TWO : HINTS_SOLO);
    if (m.s.phase === PHASE.END && m.s.phaseTick >= RESULT_DELAY && !m.resultShown) {
      m.resultShown = true;
      showResult(m);
    }
  } else {
    renderer.time += dt;
    renderer.drawBackground(app.options.stadium);
    renderer.drawGoal('back', -1);
    renderer.drawGoal('back', 1);
    renderer.drawGoal('front', -1);
    renderer.drawGoal('front', 1);
  }
  if (screens.previews.length) screens.animate(now / 1000);
  requestAnimationFrame(frame);
}

// ------------------------------------------------------------------ online

const online = new Online({
  screens,
  sound,
  controls,
  renderer,
  get match() {
    return app.match;
  },
  get kit() {
    return app.kits[0];
  },
  set kit(k) {
    app.kits[0] = k;
    remember();
  },
  get options() {
    return app.options;
  },
  startMatch,
  runTick,
  endMatch,
  toMenu,
  remember,
});

// ------------------------------------------------------------------ boot

async function boot() {
  screens.loading(0);
  await loadAll([...CORE_IMAGES, `stadiums/${app.options.stadium}.jpg`, ...kitImages(app.kits[0])], (p) => screens.loading(p));
  if (document.fonts && document.fonts.load) await document.fonts.load('20px "Lilita One"').catch(() => {});
  requestAnimationFrame(frame);
  if (!online.resume()) toMenu();
}

window.__football = {
  app,
  sound,
  /** Tests: run ticks by hand (pause the match first) and redraw. */
  step(inputs = [0, 0], n = 1) {
    for (let i = 0; i < n; i++) runTick(inputs);
    const m = app.match;
    renderer.draw(m.s, null, 1, 0.025 * n, { kits: m.kits, stadium: m.stadium });
  },
  get state() {
    return app.match ? app.match.s : null;
  },
  get screen() {
    return screens.current;
  },
  online,
};

boot();
