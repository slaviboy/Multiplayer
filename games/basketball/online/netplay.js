// Online play for Basketball Stars.
//
// Player 1 (host) presses PLAY ONLINE and shares a link / QR code; player 2
// (guest) opens it. Both land on the game's own "2 PLAYERS MATCH" screen: the host
// picks the left team and the mode, the guest the right team, and each change shows
// up on the other screen. The host presses PLAY.
//
// The match runs in lockstep (./lockstep.js): both browsers run the same match tick
// by tick and exchange only the players' inputs. That needs the simulation to give
// exactly the same result on both, so while a tick runs:
//   * Math.random is a generator seeded by the host, and sin/cos/atan2/pow are the
//     bit-identical versions from ./detmath.js;
//   * the players' animations advance by the tick (their frame events release the
//     ball, steal and finish dunks), not by wall-clock time;
//   * the short fade after a basket, which restarts play, is timed in ticks;
//   * the left team's human player reads the host's input, the right's (or the
//     second human in co-op) the guest's.
// Pausing is off online (a pause on one side would freeze the other). Every second
// both sides compare a hash of the match state, so a desync would show up at once.
//
// The game is a compiled webpack bundle; index.html's bundle exposes webpack's
// module loader as window.__bb so this module can patch its classes.
import { createInvite, inviteUrl, parseInvite, isInt, isShortString } from '../../../shared/online/protocol.js';
import { PeerLink } from '../../../shared/online/peer-link.js';
import { Lobby, translate } from '../../../shared/online/lobby.js';
import { Chat } from '../../../shared/online/chat.js';
import { Lockstep, decodeInput, encodeInput, MAX_INPUT } from './lockstep.js';
import { deterministic, seededRandom } from './detmath.js';

const APP_ID = 'basketball';
const SESSION_KEY = 'basketball:online';
const SESSION_MAX_AGE_MS = 2 * 60 * 60 * 1000;
const HASH_EVERY = 40; // ticks (one second)
const MAX_OWED = 8; // ticks of catch-up after a wait
const MAX_PER_FRAME = 6;
const SIDES = ['p1', 'p2'];

const S = {
  game: null,
  mods: null,
  lobby: null,
  chat: null,
  link: null,
  role: null, // 'host' | 'guest'
  secret: null,
  token: null,
  inviteUrl: null,
  connected: false,
  wantSelect: false, // go to the team screen as soon as the menu is up
  match: null, // the running lockstep match
  matchNo: 0,
  pendingStart: null, // start message waiting for the game to reach a screen that can start it
  applying: false, // applying the partner's choices (don't echo them back)
  lastSel: null,
  partnerDesktop: true, // the partner's device type, from their messages
  desyncs: [],
  hudTimer: null,
  lag: 0, // tests: delay incoming messages by this many ms
};

const me = () => (S.role === 'guest' ? 1 : 0);
const t = (key, vars) => translate(lang(), key, vars);
const lang = () => (navigator.language || 'en').split('-')[0]; // the lobby falls back to English
const live = () => !!(S.link && S.connected);

function wrap(proto, name, fn) {
  const orig = proto[name];
  if (typeof orig !== 'function') throw new Error(`basketball online: ${name} not found`);
  proto[name] = function (...args) {
    return fn.call(this, orig, args);
  };
}

// ---------------------------------------------------------------- game modules

function findExport(name) {
  for (const m of Object.values(window.__bb.c)) {
    const ex = m.exports;
    if (ex && typeof ex === 'object' && Object.prototype.hasOwnProperty.call(ex, name)) return ex[name];
  }
  throw new Error(`basketball online: module export ${name} not found`);
}

function findDefault(test) {
  for (const m of Object.values(window.__bb.c)) {
    const d = m.exports && m.exports.default;
    if (d && test(d)) return d;
  }
  throw new Error('basketball online: module not found');
}

function findInputClass() {
  for (const m of Object.values(window.__bb.c)) {
    const d = m.exports && m.exports.default;
    if (typeof d === 'function' && d.prototype && Object.getOwnPropertyDescriptor(d.prototype, 'isbtnZ')) return d;
  }
  throw new Error('basketball online: input class not found');
}

const states = () => S.game.state.states;
const current = () => S.game.state.current;
const core = () => S.mods.MainGameCore.instance;
const inventory = () => S.mods.Inventory.instance;

function goState(name) {
  const cur = states()[current()];
  if (cur && typeof cur.fadeToState === 'function') cur.fadeToState(name);
  else S.game.state.start(name);
}

// ---------------------------------------------------------------- session

function saveSession() {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ role: S.role, secret: S.secret, token: S.token, at: Date.now() }));
  } catch {
    /* storage blocked: no reload-resume */
  }
}

function loadSession() {
  try {
    const s = JSON.parse(sessionStorage.getItem(SESSION_KEY));
    if (s && (s.role === 'host' || s.role === 'guest') && typeof s.secret === 'string' && Date.now() - s.at < SESSION_MAX_AGE_MS) return s;
  } catch {
    /* none */
  }
  return null;
}

function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

function startHost(resume = null) {
  const invite = resume ? { secret: resume.secret } : createInvite();
  S.role = 'host';
  S.secret = invite.secret;
  S.token = resume ? resume.token : null;
  S.inviteUrl = inviteUrl(location.href, invite);
  saveSession();
  openLink();
  S.lobby.showInvite({ url: S.inviteUrl, friendCharId: 'p2', onCancel: () => endSession() });
}

function startGuest(secret, token = null) {
  S.role = 'guest';
  S.secret = secret;
  S.token = token;
  saveSession();
  openLink();
  S.lobby.showJoining({ myCharId: 'p2', onCancel: () => endSession() });
}

function openLink() {
  if (S.link) S.link.close();
  S.connected = false;
  const receive = (m) => (S.lag ? setTimeout(() => onMessage(m), S.lag) : onMessage(m));
  S.link = new PeerLink({ appId: APP_ID, secret: S.secret, role: S.role, token: S.token, onMessage: receive, onStatus });
  S.link.start().catch((err) => {
    console.error('[online] could not start', err);
    onStatus('error', { reason: 'network' });
  });
  clearInterval(S.hudTimer);
  S.hudTimer = setInterval(updateHud, 1000);
}

function endSession() {
  if (S.link) S.link.close();
  S.link = null;
  S.connected = false;
  S.role = S.secret = S.token = null;
  S.match = null;
  finishFades(); // a fade timed in ticks would never end once the ticks are the game's own again
  S.pendingStart = null;
  S.wantSelect = false;
  clearInterval(S.hudTimer);
  clearSession();
  S.lobby.close();
  S.lobby.hideHud();
  S.lobby.banner(null);
  S.chat.clear();
  S.chat.setEnabled(false);
}

function leaveOnline() {
  const inMatch = current() === 'gameplay';
  endSession();
  if (inMatch || current() === 'randomstate' || current() === 'postmatchstate') goState('menu');
}

function send(msg) {
  return S.link ? S.link.send(msg) : false;
}

function onStatus(status, info = {}) {
  if (status === 'connected') {
    S.connected = true;
    if (S.role === 'host') S.token = S.link.token;
    else S.token = info.token || S.token;
    saveSession();
    S.lobby.characters = characters();
    S.lobby.showConnected(SIDES[me()]);
    S.lobby.showHud({ myCharId: SIDES[me()], onLeave: leaveOnline, onChat: () => S.chat.toggle() });
    S.chat.setEnabled(true);
    updateHud();
    if (S.match) {
      // back after a blip: ask for the inputs that were lost meanwhile
      send({ t: 'resend', m: S.match.no, k: S.match.ls.tick });
      return;
    }
    S.wantSelect = true;
    toSelectIfReady();
  } else if (status === 'away') {
    S.connected = false;
    S.lobby.showAway({ onLeave: leaveOnline });
  } else if (status === 'error') {
    if (S.connected) return;
    const canRetry = S.role === 'guest' && info.reason !== 'full' && info.reason !== 'version';
    S.lobby.showError({
      reason: info.reason,
      onRetry: canRetry
        ? () => {
            openLink();
            S.lobby.showJoining({ myCharId: 'p2', onCancel: () => endSession() });
          }
        : null,
      onClose: () => endSession(),
    });
  }
}

function updateHud() {
  if (!S.link) return;
  const rtt = S.link.rtt;
  S.lobby.setHudPing(S.connected ? rtt : null, !S.connected ? 'away' : rtt > 200 ? 'slow' : 'ok');
}

function characters() {
  return [
    { id: 'p1', name: 'Player 1', hint: 'Left team', accent: '#ffb02e' },
    { id: 'p2', name: 'Player 2', hint: 'Right team', accent: '#4db8ff' },
  ];
}

// ---------------------------------------------------------------- messages

function valid(m) {
  const fromHost = S.role === 'guest';
  switch (m.t) {
    case 'sel':
      return (
        Array.isArray(m.teams) && m.teams.length === 2 && m.teams.every((v) => isInt(v) && v >= 1 && v <= 19) &&
        Array.isArray(m.players) && m.players.length === 2 && m.players.every((v) => v === 0 || v === 1) &&
        [0, 1, 2].includes(m.mode)
      );
    case 'start':
      return (
        fromHost && isInt(m.m) && isInt(m.seed) && isInt(m.delay) && m.delay >= 1 && m.delay <= 12 &&
        Array.isArray(m.dev) && m.dev.length === 2 && m.dev.every((v) => typeof v === 'boolean') && valid({ ...m, t: 'sel' })
      );
    case 'toSelect':
      return fromHost;
    case 'in':
      return isInt(m.m) && isInt(m.k) && m.k >= 0 && Array.isArray(m.v) && m.v.length <= 120 && m.v.every((b) => isInt(b) && b >= 0 && b <= MAX_INPUT);
    case 'h':
      return isInt(m.m) && isInt(m.k) && isInt(m.h);
    case 'resend':
      return isInt(m.m) && isInt(m.k) && m.k >= 0;
    case 'say':
      return isShortString(m.text, 200) && m.text.length > 0;
    default:
      return false;
  }
}

function onMessage(m) {
  if (!valid(m)) return;
  switch (m.t) {
    case 'sel':
      if (typeof m.dev === 'boolean') S.partnerDesktop = m.dev;
      if (S.match && current() === 'gameplay') {
        // the partner is on the team screen (they reloaded): this match is over for both
        abandonMatch();
      }
      applySelection(m, S.role === 'guest' ? 'host' : 'guest');
      break;
    case 'start':
      S.pendingStart = m;
      tryStart();
      break;
    case 'toSelect':
      S.wantSelect = true;
      toSelectIfReady();
      break;
    case 'in':
      if (S.match && m.m === S.match.no) m.v.forEach((b, i) => S.match.ls.addRemote(m.k + i, b));
      break;
    case 'h':
      if (S.match && m.m === S.match.no) compareHash(m.k, m.h, 'remote');
      break;
    case 'resend':
      if (S.match && m.m === S.match.no) {
        const { from, values } = S.match.ls.localFrom(m.k);
        for (let i = 0; i < values.length; i += 100) send({ t: 'in', m: S.match.no, k: from + i, v: values.slice(i, i + 100) });
      }
      break;
    case 'say':
      S.chat.show(SIDES[1 - me()], m.text);
      break;
  }
}

// ---------------------------------------------------------------- the team screen

function selection() {
  const md = inventory().matchData;
  return { teams: [md.teams[0], md.teams[1]], players: [md.players[0][0], md.players[1][0]], mode: md.matchMode };
}

function sendSelection() {
  if (!live() || S.applying || current() !== 'randomstate') return;
  send({ t: 'sel', ...selection(), dev: !!S.mods.Device.isDesktop });
}

/** Applies the partner's part of a selection (`from`: whose message it is), or all of it. */
function applySelection(sel, from = 'all') {
  S.lastSel = sel;
  if (current() !== 'randomstate') return;
  const st = states().randomstate;
  const md = inventory().matchData;
  const mine = (side) => from !== 'all' && side === me();
  S.applying = true;
  try {
    if (from === 'all' || from === 'host') {
      if (md.matchMode !== sel.mode) {
        md.matchMode = sel.mode;
        if (st.matchModePanel) st.matchModePanel.setButtonsState(sel.mode);
        st.processMatchMode();
      }
    }
    const panels = [st.selectPlayer, st.selectPlayer2];
    for (const side of [0, 1]) {
      // the host owns both sides in co-op (both humans are on the left team)
      if (mine(side) && !(md.matchMode === 2 && S.role === 'guest')) continue;
      const p = panels[side];
      if (!p) continue;
      if (p.emblem !== sel.teams[side]) {
        p.emblem = sel.teams[side];
        p.updateClub();
      }
      if (md.players[side][0] !== sel.players[side]) {
        if (sel.players[side] === 0) p.onArmature1Click(null, true);
        else p.onArmature2Click(null, true);
      }
    }
  } finally {
    S.applying = false;
  }
  lockPanels();
}

/** Each player can only change their own side; the guest can't change the mode or start. */
function lockPanels() {
  if (!live() || current() !== 'randomstate') return;
  const st = states().randomstate;
  const md = inventory().matchData;
  const host = S.role === 'host';
  const editable = [host, !host && md.matchMode !== 2];
  [st.selectPlayer, st.selectPlayer2].forEach((p, side) => {
    if (!p) return;
    const on = editable[side];
    for (const b of [p.btnLeft, p.btnRight]) if (b) b.visible = on;
    for (const a of [p.player1, p.player2]) if (a) a.inputEnabled = on;
  });
  if (st.matchModePanel) {
    for (const b of [st.matchModePanel.btn1, st.matchModePanel.btn2, st.matchModePanel.btn3]) if (b && b.btn) b.btn.inputEnabled = host;
  }
  if (st.playBtn) st.playBtn.visible = host;
  S.lobby.banner(host ? null : 'Your friend picks the mode and starts the match');
}

function toSelectIfReady() {
  if (!S.wantSelect || !live()) return;
  const cur = current();
  if (cur === 'randomstate') {
    S.wantSelect = false;
    if (S.lastSel) applySelection(S.lastSel, 'all');
    sendSelection();
    lockPanels();
    return;
  }
  if (cur === 'menu') {
    S.wantSelect = false;
    const inv = inventory();
    inv.matchData.resetScore();
    inv.gameMode = 4;
    inv.matchData.matchMode = 0;
    goState('randomstate');
    return;
  }
  if (cur === 'postmatchstate') {
    S.wantSelect = false;
    goState('randomstate');
  }
  // otherwise (loading, a match running): retried when the state changes
}

// ---------------------------------------------------------------- starting a match

function abandonMatch() {
  S.match = null;
  finishFades();
  S.lobby.toast('Your friend left the match');
  S.wantSelect = true;
  goState('randomstate');
}

function hostStartMatch() {
  if (S.role !== 'host' || !live()) return;
  const sel = selection();
  if (sel.teams[0] === sel.teams[1]) sel.teams[1] = (sel.teams[1] % 19) + 1;
  const rtt = S.link.rtt || 120;
  const delay = Math.max(2, Math.min(10, Math.ceil((rtt / 2 + 30) / 25)));
  const dev = [!!S.mods.Device.isDesktop, !!S.partnerDesktop];
  const msg = { t: 'start', m: ++S.matchNo, seed: (Math.random() * 0x7fffffff) | 0, delay, dev, ...sel };
  send(msg);
  S.pendingStart = msg;
  tryStart();
}

function tryStart() {
  const m = S.pendingStart;
  if (!m) return;
  const cur = current();
  if (cur !== 'randomstate' && cur !== 'postmatchstate' && cur !== 'menu') return; // retried on the next state
  S.pendingStart = null;
  S.matchNo = Math.max(S.matchNo, m.m);
  const inv = inventory();
  const md = inv.matchData;
  inv.gameMode = 4;
  inv.firstRun = false; // no help popup in the middle of an online match
  inv.firstRun2 = false;
  md.matchMode = m.mode;
  md.teams = [m.teams[0], m.teams[1]];
  md.players = [[m.players[0]], [m.players[1]]];
  md.restarted = false;
  md.resetScore();
  S.match = {
    no: m.m,
    seed: m.seed,
    ls: new Lockstep({ delay: m.delay, me: me() }),
    rng: seededRandom(m.seed),
    dev: m.dev, // each player's device type: the game plays touch and keyboard slightly differently
    owed: 0,
    inputs: null, // decoded inputs of the tick being run
    hashes: new Map(),
    started: false,
    outbox: [],
  };
  S.lobby.banner(null);
  goState('gameplay');
}

// ---------------------------------------------------------------- lockstep ticks

let sampler = null;

function sampleLocal(m, dt) {
  let tick;
  while ((tick = m.ls.nextSample()) >= 0) {
    // the single-player controller reads arrows or WASD and the touch buttons
    S.mods.PlayerControllerGeneral.prototype.update.call(sampler, dt);
    // ...plus B / V, which the left player's on-screen hints show for steal / supershot
    const inp = sampler.input;
    const bKey = !!inp.isbtnB;
    const vKey = !!inp.isbtnV;
    const bits = encodeInput({
      move: sampler.currentMove,
      dash: sampler.currentDash,
      jump: sampler.currentJump,
      jumpSkip: sampler.currentJumpSkip,
      action: sampler.currentAction || bKey,
      super: sampler.currentSuper || vKey,
      block: sampler.currentBlockOrPump,
      ready: sampler.readyForAction() && !bKey,
      release: sampler.releaseBlockOrPump(),
    });
    m.ls.addLocal(tick, bits);
    if (!m.outbox.length) m.outboxFrom = tick;
    m.outbox.push(bits);
  }
}

function flush(m) {
  if (!m.outbox.length) return;
  if (send({ t: 'in', m: m.no, k: m.outboxFrom, v: m.outbox })) m.outbox = [];
  else if (m.outbox.length > 400) m.outbox = []; // the partner will ask for them again
}

function stateHash() {
  const c = core();
  const buf = new DataView(new ArrayBuffer(8));
  let h = 0x811c9dc5;
  const mix = (v) => {
    buf.setFloat64(0, v);
    for (let i = 0; i < 8; i++) h = Math.imul(h ^ buf.getUint8(i), 0x01000193);
  };
  const body = (b) => {
    if (!b) return;
    mix(b.position.x);
    mix(b.position.y);
    mix(b.velocity.x);
    mix(b.velocity.y);
  };
  if (c.ball) body(c.ball.body);
  for (const p of [...(c.playersLeft || []), ...(c.playersRight || [])]) body(p.body);
  const md = inventory().matchData;
  mix(md.matchScore[0]);
  mix(md.matchScore[1]);
  mix(c.matchTime || 0);
  return h | 0;
}

function compareHash(tick, h, who) {
  const m = S.match;
  const e = m.hashes.get(tick) || {};
  e[who] = h;
  m.hashes.set(tick, e);
  if (e.local !== undefined && e.remote !== undefined) {
    if (e.local !== e.remote && !m.desynced) {
      m.desynced = tick;
      S.desyncs.push(tick);
      console.warn(`[online] the two games went out of sync at tick ${tick}`);
      S.lobby.toast('Out of sync with your friend');
    }
    m.hashes.delete(tick);
  }
}

function advanceAnimations(dt) {
  const ts = core().timeScale;
  dragonBones.PhaserFactory.factory.dragonBones.advanceTime(ts === 1 ? dt : ts === 0 ? 0.3 * dt : dt * ts);
}

const fades = new Set(); // MatchPreloaders fading in tick time

/** Ends running fades at once (their callbacks restart play as usual). */
function finishFades() {
  for (const p of fades) p._netFade.t = 1e9;
  advanceFades(0);
}

function advanceFades(dt) {
  for (const p of [...fades]) {
    const f = p._netFade;
    f.t += dt * 1000;
    const d = p.time || 1;
    if (f.phase === 'show') {
      p.alpha = Math.max(0, Math.min(1, (f.t - d) / d));
      if (f.t >= 2 * d) {
        p.alpha = 1;
        fades.delete(p);
        p._netFade = null;
        if (p.callBackOnShow) p.callBackOnShow.call(p.contextForAll);
      }
    } else {
      p.alpha = Math.max(0, 1 - f.t / d);
      if (f.t >= d) {
        p.alpha = 0;
        fades.delete(p);
        p._netFade = null;
        if (p.callBackOnHide) p.callBackOnHide.call(p.contextForAll);
      }
    }
  }
}

// ---------------------------------------------------------------- patches

function patchGameplay(GP) {
  // build the match (players, ball, bots) from the shared seed
  wrap(GP, 'init', function (orig, args) {
    const m = S.match;
    if (!m) return orig.apply(this, args);
    fades.clear();
    return deterministic(seededRandom(m.seed ^ 0x5bd1e995), () => orig.apply(this, args));
  });

  wrap(GP, 'updateGameController', function (orig, args) {
    const m = S.match;
    if (!m) return orig.apply(this, args);
    const dt = args[0];
    m.owed = Math.min(MAX_OWED, m.owed + 1);
    let ran = 0;
    while (m.owed > 0 && ran < MAX_PER_FRAME) {
      sampleLocal(m, dt);
      if (!m.ls.ready()) break;
      const tick = m.ls.tick;
      if (tick === 0 && S.testScore) {
        const md = inventory().matchData;
        md.matchScore = S.testScore.slice();
        core().infoPanel.updateScore(md.matchScore[0], md.matchScore[1]);
      }
      const [a, b] = m.ls.take();
      m.inputs = [decodeInput(a), decodeInput(b)];
      deterministic(m.rng, () => {
        orig.call(this, dt);
        advanceAnimations(dt);
        advanceFades(dt);
      });
      m.inputs = null;
      m.owed--;
      ran++;
      if (tick % HASH_EVERY === 0) {
        const h = stateHash();
        send({ t: 'h', m: m.no, k: tick, h });
        compareHash(tick, h, 'local');
      }
    }
    m.waiting = !m.ls.ready();
    flush(m);
    return undefined;
  });

  // animations advance in the ticks above, not by the clock
  const baseRender = Object.getPrototypeOf(GP).render;
  wrap(GP, 'render', function (orig, args) {
    if (!S.match) return orig.apply(this, args);
    return baseRender.apply(this, args);
  });

  // no pausing online: it would freeze the partner's game too
  for (const name of ['onPause', 'onP', 'onSpace', 'onHelp']) {
    wrap(GP, name, function (orig, args) {
      if (S.match) return undefined;
      return orig.apply(this, args);
    });
  }

  wrap(GP, 'shutdown', function (orig, args) {
    try {
      return orig.apply(this, args);
    } finally {
      if (S.match) {
        flush(S.match);
        S.match = null;
      }
      fades.clear();
    }
  });

  wrap(GP, 'create', function (orig, args) {
    const r = orig.apply(this, args);
    if (S.match) hideGameButtons();
    return r;
  });
}

function hideGameButtons() {
  // the pause and help buttons of the in-game GUI
  for (const m of Object.values(window.__bb.c)) {
    const d = m.exports && m.exports.default;
    const inst = d && d.instance;
    if (inst && inst.pauseBtn) {
      inst.pauseBtn.visible = false;
      if (inst.helpBtn) inst.helpBtn.visible = false;
    }
  }
}

function patchFade(MatchPreloader) {
  const P = MatchPreloader.prototype;
  wrap(P, 'show', function (orig, args) {
    if (!S.match) return orig.apply(this, args);
    this.alpha = 0;
    this._netFade = { phase: 'show', t: 0 };
    fades.add(this);
    return undefined;
  });
  wrap(P, 'hide', function (orig, args) {
    if (!S.match) return orig.apply(this, args);
    this.alpha = 1;
    this._netFade = { phase: 'hide', t: 0 };
    fades.add(this);
    return undefined;
  });
}

/** Each player plays by the rules of their own device, on both screens. */
function patchPlayers() {
  wrap(S.mods.PlayerObject.prototype, 'update', function (orig, args) {
    const m = S.match;
    if (!m || !m.inputs) return orig.apply(this, args);
    const D = S.mods.Device;
    const was = D.isDesktop;
    D.isDesktop = this.controller instanceof S.mods.PlayerController2 ? m.dev[1] : m.dev[0];
    try {
      return orig.apply(this, args);
    } finally {
      D.isDesktop = was;
    }
  });
}

function patchControllers() {
  // P1 (left team's human) plays the host's input, P2 the guest's
  [
    [S.mods.PlayerController, 0],
    [S.mods.PlayerController2, 1],
  ].forEach(([Ctrl, slot]) => {
    const P = Ctrl.prototype;
    wrap(P, 'update', function (orig, args) {
      const m = S.match;
      if (!m || !m.inputs) return orig.apply(this, args);
      const i = m.inputs[slot];
      this.currentMove = i.move;
      this.currentDash = i.dash;
      this.currentJump = i.jump;
      this.currentJumpSkip = i.jumpSkip;
      this.currentAction = i.action;
      this.currentSuper = i.super;
      this.currentBlockOrPump = i.block;
      return undefined;
    });
    wrap(P, 'readyForAction', function (orig, args) {
      const m = S.match;
      return m && m.inputs ? m.inputs[slot].ready : orig.apply(this, args);
    });
    wrap(P, 'releaseBlockOrPump', function (orig, args) {
      const m = S.match;
      return m && m.inputs ? m.inputs[slot].release : orig.apply(this, args);
    });
  });
}

function patchSelectScreen(RS) {
  wrap(RS, 'create', function (orig, args) {
    const r = orig.apply(this, args);
    if (live()) {
      if (S.lastSel) applySelection(S.lastSel, 'all');
      sendSelection();
      lockPanels();
    }
    return r;
  });
  wrap(RS, 'onPlay', function (orig, args) {
    if (!live()) return orig.apply(this, args);
    if (S.role === 'host') hostStartMatch();
    return undefined;
  });
  wrap(RS, 'onBack', function (orig, args) {
    if (live()) {
      leaveOnline();
      return undefined;
    }
    return orig.apply(this, args);
  });
  wrap(S.mods.SelectPlayer.prototype, 'updateClub', function (orig, args) {
    const r = orig.apply(this, args);
    sendSelection();
    return r;
  });
  for (const name of ['onArmature1Click', 'onArmature2Click']) {
    wrap(S.mods.SelectPlayer.prototype, name, function (orig, args) {
      const r = orig.apply(this, args);
      sendSelection();
      return r;
    });
  }
  wrap(S.mods.MatchModePanel.prototype, 'onGameModeClick', function (orig, args) {
    const r = orig.apply(this, args);
    sendSelection();
    lockPanels();
    return r;
  });
}

function patchPostMatch(PM) {
  wrap(PM, 'create', function (orig, args) {
    const r = orig.apply(this, args);
    if (live()) {
      // only the host decides: play again, or back to the teams
      if (S.role === 'guest') {
        if (this.playBtn) this.playBtn.visible = false;
        if (this.backBtn) this.backBtn.visible = false;
        S.lobby.banner('Waiting for your friend…');
      }
    }
    return r;
  });
  wrap(PM, 'onBack', function (orig, args) {
    if (!live()) return orig.apply(this, args);
    if (S.role === 'host') {
      S.lastSel = selection();
      hostStartMatch();
    }
    return undefined;
  });
  wrap(PM, 'onNextState', function (orig, args) {
    if (!live()) return orig.apply(this, args);
    if (S.role === 'host') {
      send({ t: 'toSelect' });
      S.wantSelect = true;
      toSelectIfReady();
    }
    return undefined;
  });
}

function patchMenu(Menu) {
  wrap(Menu, 'create', function (orig, args) {
    const r = orig.apply(this, args);
    try {
      addOnlineButton(this);
    } catch (err) {
      console.error('[online] menu button', err);
    }
    return r;
  });
}

function addOnlineButton(menu) {
  const panel = menu.background4;
  if (!panel || menu._olBtn) return;
  const C = S.mods.Constants;
  const Btn = menu.playBtn1.constructor;
  // the button only wires its click when given a context object
  const btn = new Btn(S.game, 'PLAY ONLINE', C.styleMenuLightBlue, onPlayOnline, menu, S.mods.Atlases.Interface);
  btn.setFrames('bg0000', 'bg0000', 'bg0000', 'bg0000');
  btn.setPropFront(C.strokeBlue, C.strokeThickMenu);
  // one row below the last button; the panel grows to fit it
  const rows = [menu.playBtn1, menu.playBtn2, menu.playBtn3, menu.tutorial, menu.playBtn4].filter((b) => b && b.visible);
  btn.y = Math.max(...rows.map((b) => b.y)) + 50;
  const bg = panel.children.find((c) => c.frameName === '0bg100000');
  if (bg) {
    bg.scale.y += 0.17;
    bg.y += 26;
  }
  panel.addChild(btn);
  menu._olBtn = btn;
}

function onPlayOnline() {
  if (S.link) {
    if (S.role === 'host' && !S.connected) S.lobby.showInvite({ url: S.inviteUrl, friendCharId: 'p2', onCancel: () => endSession() });
    else if (S.connected) {
      S.wantSelect = true;
      toSelectIfReady();
    }
    return;
  }
  S.lobby.characters = characters();
  startHost();
}

function patchStateChanges() {
  S.game.state.onStateChange.add(() =>
    setTimeout(() => {
      tryStart();
      toSelectIfReady();
      if (current() !== 'randomstate' && current() !== 'postmatchstate') S.lobby.banner(null);
      if (current() === 'randomstate') lockPanels();
    }, 0),
  );
}

// ---------------------------------------------------------------- chat bubbles

function bubbleAnchor(who) {
  if (!S.match || current() !== 'gameplay') return null;
  const c = core();
  const slot = SIDES.indexOf(who);
  const players = [...(c.playersLeft || []), ...(c.playersRight || [])];
  const Ctrl = slot === 0 ? S.mods.PlayerController : S.mods.PlayerController2;
  const p = players.find((pl) => pl.controller instanceof Ctrl);
  if (!p || !p.graphic || !p.graphic.worldVisible) return null;
  const b = p.graphic.getBounds();
  const canvas = S.game.canvas.getBoundingClientRect();
  const k = canvas.width / S.game.width;
  return {
    x: Math.max(60, Math.min(window.innerWidth - 60, canvas.left + (b.x + b.width / 2) * k)),
    y: Math.max(70, canvas.top + b.y * k),
  };
}

// ---------------------------------------------------------------- boot

function init(game) {
  S.game = game;
  const req = (name) => findExport(name);
  S.mods = {
    MainGameCore: req('MainGameCore'),
    Inventory: req('Inventory'),
    PlayerController: req('PlayerController'),
    PlayerController2: req('PlayerController2'),
    PlayerControllerGeneral: req('PlayerControllerGeneral'),
    MatchPreloader: req('MatchPreloader'),
    SelectPlayer: req('SelectPlayer'),
    MatchModePanel: req('MatchModePanel'),
    Constants: req('Constants'),
    Atlases: req('Atlases'),
    Input: findInputClass(),
    PlayerObject: req('PlayerObject'),
    Device: findDefault((d) => typeof d.isDesktop === 'boolean' && 'GAME_W' in d),
  };
  sampler = Object.create(S.mods.PlayerControllerGeneral.prototype);
  sampler.input = S.mods.Input.instance;

  S.lobby = new Lobby({ getLang: lang, characters: characters() });
  S.chat = new Chat({
    root: S.lobby.root,
    t,
    onSend: (text) => {
      if (!send({ t: 'say', text })) return;
      S.chat.show(SIDES[me()], text);
    },
    anchorFor: bubbleAnchor,
    nameOf: (who) => (who === 'p1' ? 'Player 1' : 'Player 2'),
  });

  const st = states();
  const proto = (name) => Object.getPrototypeOf(st[name]);
  patchGameplay(proto('gameplay'));
  patchFade(S.mods.MatchPreloader);
  patchControllers();
  patchPlayers();
  patchSelectScreen(proto('randomstate'));
  patchPostMatch(proto('postmatchstate'));
  patchMenu(proto('menu'));
  patchStateChanges();
  if (current() === 'menu') addOnlineButton(st.menu);

  window.__online = {
    get role() {
      return S.role;
    },
    get connected() {
      return S.connected;
    },
    get inviteUrl() {
      return S.inviteUrl;
    },
    get tick() {
      return S.match ? S.match.ls.tick : -1;
    },
    get delay() {
      return S.match ? S.match.ls.delay : -1;
    },
    get matchNo() {
      return S.match ? S.match.no : S.matchNo;
    },
    get desyncs() {
      return S.desyncs.slice();
    },
    hash: () => (S.match ? stateHash() : null),
    /** Body x of the human player moved by this slot's input (0 = host, 1 = guest). */
    playerX(slot) {
      if (!S.match) return null;
      const c = core();
      const Ctrl = slot === 0 ? S.mods.PlayerController : S.mods.PlayerController2;
      const p = [...c.playersLeft, ...c.playersRight].find((pl) => pl.controller instanceof Ctrl);
      return p ? p.body.position.x : null;
    },
    // test hooks
    set lag(ms) {
      S.lag = ms;
    },
    setMatchSeconds(n) {
      S.mods.Device.MATCH_TIME = n;
      S.mods.Device.OVERTIME_TIME = n;
    },
    /** Score to start matches from (set on both pages), so a test match can't end in a tie. */
    set testScore(v) {
      S.testScore = v;
    },
  };

  const invite = parseInvite(location.hash);
  if (invite) {
    history.replaceState(null, '', location.pathname + location.search);
    startGuest(invite.secret);
    return;
  }
  const saved = loadSession();
  if (saved && saved.role === 'host') {
    S.lobby.characters = characters();
    startHost(saved);
  } else if (saved && saved.role === 'guest') startGuest(saved.secret, saved.token);
}

(function waitForGame() {
  const g = window.Phaser && Phaser.GAMES && Phaser.GAMES[0];
  const ready = window.__bb && g && g.state && g.state.states && g.state.states.gameplay && g.state.states.randomstate && g.state.states.menu && window.dragonBones;
  if (ready) init(g);
  else setTimeout(waitForGame, 30);
})();
