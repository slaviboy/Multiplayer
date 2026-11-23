// Online co-op for Stan & Lisa and Friends.
//
// Player 1 (host) picks Stan or Lisa and shares a link / QR code. Player 2
// (guest) opens it and automatically gets the other character.
//
// The game is a compiled Phaser 2 + Box2D bundle (js/init.js). Its physics step
// is variable and gameplay uses Math.random, timers and Date.now, so two
// browsers can't run in lockstep. Instead:
//   * each browser simulates the characters it controls and streams their
//     position, velocity and input (30 Hz); the other side runs the same input
//     and eases the body toward what it receives;
//   * the host owns everything else — levers, buttons, platforms, boxes,
//     liquids, the level choice, winning and losing — and streams a world
//     snapshot (20 Hz) that the guest applies;
//   * a character's owner decides its deaths and diamond pickups.
// Everything is done by patching the bundle's prototypes from outside through
// RequireJS (`require('States/Level/Level')` etc.); init.js itself is untouched.
import { createInvite, inviteUrl, parseInvite, isBool, isFiniteNumber, isInt } from '../../../shared/online/protocol.js';
import { PeerLink } from '../../../shared/online/peer-link.js';
import { Lobby, translate } from '../../../shared/online/lobby.js';
import { Chat } from '../../../shared/online/chat.js';

const APP_ID = 'stan-and-lisa';
const SESSION_KEY = 'stan-and-lisa:online';
const SESSION_MAX_AGE_MS = 2 * 60 * 60 * 1000;

const MAIN = ['fb', 'wg']; // fb = Stan (fire), wg = Lisa (water)
const FRIENDS = ['fat', 'small', 'jump'];
const ALL_CHARS = [...MAIN, ...FRIENDS];

const CHARS_EVERY_MS = 33;
const WORLD_EVERY_MS = 50;
const INTRO_MS = 2000; // the level's own camera intro before physics starts
const READY_TIMEOUT_MS = 15000;
const CHAR_SNAP_M = 1.5; // metres (1 tile = 1 m)
const BODY_SNAP_M = 0.6;
const EXTRAPOLATE_MAX_S = 0.15;
const ZERO = Object.freeze({ l: false, r: false, u: false });

const HOST_ONLY = new Set(['setup', 'level', 'go', 'w', 'end', 'own']);
const GUEST_ONLY = new Set(['ready', 'take', 'retry']);
const CHAR_NAMES = { fb: 'Stan', wg: 'Lisa', fat: 'Fat', small: 'Small', jump: 'Jump' };

const HINTS = {
  en: { fb: 'Fire: walks through lava, but water is deadly.', wg: 'Water: walks through water, but lava is deadly.' },
  es: { fb: 'Fuego: atraviesa la lava, pero el agua es mortal.', wg: 'Agua: atraviesa el agua, pero la lava es mortal.' },
  fr: { fb: "Feu : traverse la lave, mais l'eau est mortelle.", wg: "Eau : traverse l'eau, mais la lave est mortelle." },
  it: { fb: "Fuoco: attraversa la lava, ma l'acqua è mortale.", wg: "Acqua: attraversa l'acqua, ma la lava è mortale." },
  nl: { fb: 'Vuur: loopt door lava, maar water is dodelijk.', wg: 'Water: loopt door water, maar lava is dodelijk.' },
  ru: { fb: 'Огонь: проходит через лаву, но вода смертельна.', wg: 'Вода: проходит через воду, но лава смертельна.' },
  de: { fb: 'Feuer: läuft durch Lava, aber Wasser ist tödlich.', wg: 'Wasser: läuft durch Wasser, aber Lava ist tödlich.' },
};

const S = {
  game: null,
  mods: null,
  lobby: null,
  link: null,
  role: null, // 'host' | 'guest'
  secret: null,
  token: null,
  hostChar: null,
  myMain: null,
  otherMain: null,
  inviteUrl: null,
  connected: false,
  seq: 0, // level session number; every start/restart bumps it
  owner: {}, // char id -> 'host' | 'guest'
  controlled: null, // char I am steering right now
  otherControlled: null,
  pendingTake: null,
  remote: {}, // char id -> latest stream entry from the other side
  world: null, // latest host snapshot (guest)
  guestReadySeq: -1,
  pendingGo: -1,
  lastCharsAt: 0,
  lastWorldAt: 0,
  applyingRemote: false,
  suppressSelect: false,
  allowKill: new WeakSet(),
  origCanRevive: true,
  lastLevelData: null,
  hudTimer: null,
  greeted: false,
};

// ---------------------------------------------------------------- helpers

const r3 = (n) => Math.round(n * 1000) / 1000;
const other = (id) => (id === 'fb' ? 'wg' : 'fb');
const isMine = (id) => S.owner[id] === S.role;
const t = (key, vars) => translate(getLang(), key, vars);

function getLang() {
  const g = S.game;
  const dicts = (g && g.lang && g.lang.dicts) || { en: 1 };
  try {
    const s = JSON.parse(localStorage.getItem(`fb-${g.gameConfig.id}:settings`));
    if (s && s.lang && dicts[s.lang]) return s.lang;
  } catch {
    /* no saved settings */
  }
  const nav = (navigator.language || 'en').split('-')[0];
  return dicts[nav] ? nav : Object.keys(dicts)[0];
}

function characterList() {
  const lang = getLang();
  const hints = HINTS[lang] || HINTS.en;
  return [
    { id: 'fb', name: 'Stan', hint: hints.fb, accent: '#ff8a3d', icon: 'online/stan.svg' },
    { id: 'wg', name: 'Lisa', hint: hints.wg, accent: '#4db8ff', icon: 'online/lisa.svg' },
  ];
}

function send(msg) {
  return S.link ? S.link.send(msg) : false;
}

function liveSession() {
  return !!(S.link && S.connected && S.myMain);
}

function chars(level) {
  const list = [];
  if (level.pers1) list.push(level.pers1);
  if (level.pers2) list.push(level.pers2);
  if (level.friends) list.push(...level.friends);
  return list;
}

function charById(level, id) {
  return chars(level).find((c) => c.data && c.data.char === id);
}

function onlineLevel() {
  const g = S.game;
  const lvl = g && g.level;
  return S.link && g.state.current === 'level' && lvl && lvl._net && lvl.loadCompleted && !lvl._olKilled ? lvl : null;
}

function wrap(proto, name, fn) {
  const orig = proto[name];
  proto[name] = function (...args) {
    return fn.call(this, orig, args);
  };
}

// ---------------------------------------------------------------- session

function saveSession() {
  try {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ role: S.role, secret: S.secret, token: S.token, hostChar: S.hostChar, at: Date.now() }),
    );
  } catch {
    /* storage blocked: no reload-resume, play still works */
  }
}

function loadSession() {
  try {
    const s = JSON.parse(sessionStorage.getItem(SESSION_KEY));
    if (
      s &&
      (s.role === 'host' || s.role === 'guest') &&
      typeof s.secret === 'string' &&
      Date.now() - s.at < SESSION_MAX_AGE_MS
    )
      return s;
  } catch {
    /* ignore */
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

function startHost(hostChar, resume = null) {
  const invite = resume ? { secret: resume.secret } : createInvite();
  S.role = 'host';
  S.secret = invite.secret;
  S.token = resume ? resume.token : null;
  S.hostChar = hostChar;
  S.myMain = hostChar;
  S.otherMain = other(hostChar);
  S.inviteUrl = inviteUrl(location.href, invite);
  saveSession();
  openLink();
  showInvite();
}

function startGuest(secret, token = null, hostChar = null) {
  S.role = 'guest';
  S.secret = secret;
  S.token = token;
  S.hostChar = hostChar;
  S.myMain = hostChar ? other(hostChar) : null;
  S.otherMain = hostChar;
  saveSession();
  openLink();
  S.lobby.characters = characterList();
  S.lobby.showJoining({ myCharId: S.myMain, onCancel: () => endSession() });
}

function openLink() {
  if (S.link) S.link.close();
  S.connected = false;
  S.link = new PeerLink({
    appId: APP_ID,
    secret: S.secret,
    role: S.role,
    token: S.token,
    onMessage,
    onStatus,
  });
  S.link.start().catch((err) => {
    console.error('[online] could not start', err);
    onStatus('error', { reason: 'network' });
  });
  clearInterval(S.hudTimer);
  S.hudTimer = setInterval(updateHud, 1000);
}

function showInvite() {
  S.lobby.characters = characterList();
  S.lobby.showInvite({ url: S.inviteUrl, friendCharId: S.otherMain, onCancel: () => endSession() });
}

function endSession() {
  if (S.link) S.link.close();
  S.link = null;
  S.connected = false;
  S.role = S.secret = S.token = S.hostChar = S.myMain = S.otherMain = null;
  S.owner = {};
  S.remote = {};
  S.world = null;
  S.controlled = S.otherControlled = S.pendingTake = null;
  clearInterval(S.hudTimer);
  clearSession();
  S.lobby.close();
  S.lobby.hideHud();
  S.lobby.banner(null);
  if (S.chat) {
    S.chat.clear();
    S.chat.setEnabled(false);
  }
  if (S.game) S.game.gameConfig.canRevive = S.origCanRevive;
}

function leaveOnline() {
  const lvl = onlineLevel();
  endSession();
  if (lvl) lvl.quit();
}

function onStatus(status, info = {}) {
  if (status === 'connected') {
    S.connected = true;
    if (S.role === 'host') {
      S.token = S.link.token;
      saveSession();
      send({ t: 'setup', hostChar: S.hostChar });
      partnerReady(info.reconnect);
    } else {
      S.token = info.token || S.token;
      saveSession(); // the host's setup message completes the handshake
    }
  } else if (status === 'away') {
    S.connected = false;
    partnerAway();
  } else if (status === 'error') {
    if (S.connected) return;
    const canRetry = S.role === 'guest' && info.reason !== 'full' && info.reason !== 'version';
    S.lobby.showError({
      reason: info.reason,
      onRetry: canRetry
        ? () => {
            openLink();
            S.lobby.showJoining({ myCharId: S.myMain, onCancel: () => endSession() });
          }
        : null,
      onClose: () => endSession(),
    });
  }
}

function partnerReady(reconnect) {
  S.lobby.characters = characterList();
  S.lobby.showConnected(S.myMain);
  S.lobby.showHud({ myCharId: S.myMain, onLeave: leaveOnline, onSwitch: () => cycleControl(), onChat: () => S.chat.toggle() });
  S.chat.setEnabled(true);
  updateHud();
  updateBanner();
  if (S.role !== 'host') return;
  // Bring the guest to where the host is.
  const g = S.game;
  if (g.state.current === 'level' && g.level && g.level.levelData) hostStartLevel(g.level.levelData);
  else if (g.state.current === 'endGame' && S.lastLevelData) send({ t: 'menu' });
  else if (reconnect) send({ t: 'menu' });
}

function partnerAway() {
  S.lobby.setHudPing(null, 'away');
  const lvl = onlineLevel();
  if (lvl && !S.game.paused && !lvl.ended && !lvl._net.hold) {
    S.applyingRemote = true;
    try {
      lvl.togglePause();
    } finally {
      S.applyingRemote = false;
    }
  }
  S.lobby.showAway({ onLeave: leaveOnline });
}

function updateHud() {
  if (!S.link) return;
  const rtt = S.link.rtt;
  S.lobby.setHudPing(S.connected ? rtt : null, !S.connected ? 'away' : rtt > 200 ? 'slow' : 'ok');
}

function updateBanner() {
  const cur = S.game && S.game.state.current;
  const waiting = liveSession() && S.role === 'guest' && ['menu', 'levelMenu', 'tutorialPrompt'].includes(cur);
  S.lobby.banner(waiting ? t('friend_choosing') : null);
  if (cur !== 'level') S.lobby.setSwitchVisible(false);
}

// ---------------------------------------------------------------- messages

function valid(m) {
  const isChar = (v) => ALL_CHARS.includes(v);
  const isSeq = (v) => isInt(v) && v >= 0;
  const fromHost = S.role === 'guest';
  if (HOST_ONLY.has(m.t) && !fromHost) return false;
  if (GUEST_ONLY.has(m.t) && fromHost) return false;
  switch (m.t) {
    case 'setup':
      return MAIN.includes(m.hostChar);
    case 'level':
      return isSeq(m.s) && isInt(m.id);
    case 'ready':
    case 'go':
    case 'retry':
      return isSeq(m.s);
    case 'menu':
      return true;
    case 'say':
      return typeof m.text === 'string' && m.text.length > 0 && m.text.length <= 200;
    case 'pause':
      return isSeq(m.s) && isBool(m.on);
    case 'end':
      return isSeq(m.s) && isBool(m.win);
    case 'died':
      return isSeq(m.s) && isChar(m.id);
    case 'gem':
      return isSeq(m.s) && isInt(m.i) && m.i >= 0 && m.i < 1000 && isChar(m.c);
    case 'own':
      return FRIENDS.includes(m.id) && (m.o === 'host' || m.o === 'guest');
    case 'take':
      return FRIENDS.includes(m.id);
    case 'c':
      return (
        isSeq(m.s) &&
        (m.k === null || isChar(m.k)) &&
        Array.isArray(m.ch) &&
        m.ch.length <= ALL_CHARS.length &&
        m.ch.every(
          (e) => Array.isArray(e) && e.length === 6 && isChar(e[0]) && e.slice(1, 5).every(isFiniteNumber) && isInt(e[5]),
        )
      );
    case 'w':
      return (
        isSeq(m.s) &&
        Array.isArray(m.b) &&
        m.b.length <= 300 &&
        m.b.every((e) => Array.isArray(e) && e.length === 6 && e.every(isFiniteNumber)) &&
        Array.isArray(m.st) &&
        m.st.every((v) => v === null || isFiniteNumber(v)) &&
        Array.isArray(m.lq) &&
        Array.isArray(m.dm) &&
        Array.isArray(m.dc) &&
        m.dc.every((e) => Array.isArray(e) && e.length === 3 && isChar(e[0]) && isInt(e[1]) && isInt(e[2]))
      );
    default:
      return false;
  }
}

function onMessage(m) {
  if (!valid(m)) return;
  const g = S.game;
  const lvl = g.level && g.level._net && !g.level._olKilled ? g.level : null;
  const sameLevel = (s) => lvl && lvl._net.seq === s;

  switch (m.t) {
    case 'setup': {
      const first = S.hostChar === null || !S.myMain;
      S.hostChar = m.hostChar;
      S.myMain = other(m.hostChar);
      S.otherMain = m.hostChar;
      saveSession();
      partnerReady(!first);
      break;
    }
    case 'level': {
      const data = findLevel(m.id);
      if (!data) return;
      S.seq = m.s;
      S.lastLevelData = data;
      startLevelLocal(data);
      break;
    }
    case 'ready':
      S.guestReadySeq = m.s;
      break;
    case 'go':
      if (sameLevel(m.s) && lvl._net.hold) lvl._net.goPending = true;
      else S.pendingGo = m.s;
      break;
    case 'menu':
      goToLevelMenu();
      break;
    case 'retry':
      if (m.s !== S.seq) return;
      if (g.state.current === 'level' && lvl) lvl.retry();
      else if (S.lastLevelData) hostStartLevel(S.lastLevelData);
      break;
    case 'pause':
      if (sameLevel(m.s) && !lvl.ended && !!g.paused !== m.on) {
        S.applyingRemote = true;
        try {
          lvl.togglePause();
        } finally {
          S.applyingRemote = false;
        }
      }
      break;
    case 'end':
      if (!sameLevel(m.s) || lvl.ended) return;
      lvl.ended = true;
      g.physics.box2d.paused = true;
      S.applyingRemote = true;
      try {
        if (m.win) lvl.animateFinish();
        else lvl.gameOver();
      } finally {
        S.applyingRemote = false;
      }
      break;
    case 'died': {
      if (!sameLevel(m.s) || isMine(m.id)) return;
      const ch = charById(lvl, m.id);
      if (ch && !ch.dying) {
        S.allowKill.add(ch);
        ch.kill();
      }
      break;
    }
    case 'gem': {
      if (!sameLevel(m.s) || isMine(m.c)) return;
      const d = lvl.diamonds && lvl.diamonds[m.i];
      const ch = charById(lvl, m.c);
      if (d && ch && d.data.alive) {
        S.applyingRemote = true;
        try {
          d.grabbed(ch);
        } finally {
          S.applyingRemote = false;
        }
      }
      break;
    }
    case 'own':
      S.owner[m.id] = m.o;
      if (m.o === S.role) {
        delete S.remote[m.id];
        if (S.pendingTake === m.id) {
          S.pendingTake = null;
          if (lvl) setControlled(lvl, m.id);
        }
      } else {
        if (S.pendingTake === m.id) S.pendingTake = null;
        if (S.controlled === m.id && lvl) setControlled(lvl, S.myMain);
      }
      break;
    case 'take':
      if (S.controlled === m.id) {
        send({ t: 'own', id: m.id, o: 'host' });
      } else {
        S.owner[m.id] = 'guest';
        send({ t: 'own', id: m.id, o: 'guest' });
      }
      break;
    case 'c': {
      const now = performance.now();
      for (const [id, x, y, vx, vy, f] of m.ch) {
        if (isMine(id)) continue;
        S.remote[id] = { s: m.s, x, y, vx, vy, l: !!(f & 1), r: !!(f & 2), u: !!(f & 4), at: now };
      }
      S.otherControlled = m.k;
      break;
    }
    case 'w':
      if (sameLevel(m.s)) S.world = m;
      break;
    case 'say': {
      const now = performance.now();
      S.chatTimes = (S.chatTimes || []).filter((t0) => now - t0 < 3000);
      if (S.chatTimes.length >= 6) return; // flood guard
      S.chatTimes.push(now);
      S.chat.show(S.otherControlled || S.otherMain, m.text);
      break;
    }
  }
}

function findLevel(id) {
  const temple = S.game.progress.get('temples')[0];
  return temple && temple.levels.find((l) => l.id === id);
}

// ---------------------------------------------------------------- navigation

function fadeWhenFree(key, data, seq, remote) {
  const g = S.game;
  const go = () => {
    if (seq !== S.seq) return; // superseded by a newer level message
    if (g.state.fading) return setTimeout(go, 150);
    S.applyingRemote = !!remote;
    try {
      g.state.fade(key, true, false, data);
    } finally {
      S.applyingRemote = false;
    }
  };
  go();
}

function killCurrentLevel() {
  const g = S.game;
  const lvl = g.level;
  if (!lvl || lvl._olKilled || !lvl.loadCompleted) return;
  try {
    lvl.sounds && lvl.sounds.levelMusic && lvl.sounds.levelMusic.stop();
  } catch {
    /* sounds already gone */
  }
  lvl.killAll();
}

function startLevelLocal(data) {
  const g = S.game;
  g.currentTemple = g.currentTemple || g.progress.get('temples')[0];
  if (g.state.current === 'level' || g.state.current === 'endGame') killCurrentLevel();
  if (g.menuMusic && g.menuMusic.isPlaying) {
    g.menuMusic.fadeOut(500);
    g.menuMusic.onFadeComplete.addOnce((m) => m.stop());
  }
  S.lobby.banner(null);
  g.state.add('level', S.mods.Level);
  fadeWhenFree('level', data, S.seq, true);
}

function hostStartLevel(data) {
  S.seq += 1;
  S.lastLevelData = data;
  send({ t: 'level', s: S.seq, id: data.id });
  startLevelLocal(data);
}

function goToLevelMenu() {
  const g = S.game;
  const cur = g.state.current;
  if (cur !== 'level' && cur !== 'endGame') return updateBanner();
  const temple = g.currentTemple || g.progress.get('temples')[0];
  fadeWhenFree('levelMenu', temple, S.seq, true);
  if (cur === 'level') killCurrentLevel();
}

// ---------------------------------------------------------------- control

function makeNetCursors(orig) {
  return {
    _net: true,
    _orig: orig,
    left: { isDown: false },
    right: { isDown: false },
    up: { isDown: false },
    active: false,
    enabled: !!orig.enabled,
    checkActive() {
      return this.left.isDown || this.right.isDown || this.up.isDown;
    },
    updateKeys() {},
    updateDowns() {},
    show() {
      this.enabled = true;
    },
    hide() {
      this.enabled = false;
    },
    get layoutContent() {
      return orig.layoutContent;
    },
    get buttons() {
      return orig.buttons;
    },
    onSettingChange(a) {
      return orig.onSettingChange(a);
    },
    destroy() {
      return orig.destroy();
    },
  };
}

function resetOwnership(level) {
  S.owner = {};
  S.owner[S.hostChar] = 'host';
  S.owner[other(S.hostChar)] = 'guest';
  for (const f of level.friends || []) S.owner[f.data.char] = 'host';
  S.controlled = S.myMain;
  S.otherControlled = S.otherMain;
  S.pendingTake = null;
  S.remote = {};
  S.world = null;
}

function applyTouchVisibility(level) {
  const touch = S.game.settings.controls !== 'keyboard';
  for (const ch of chars(level)) {
    const orig = ch.cursors && ch.cursors._orig;
    if (!orig || !touch) continue;
    if (ch.data.char === S.myMain) orig.show();
    else orig.hide();
  }
  if (level.cursorToggle) level.cursorToggle.visible = false;
}

function setControlled(level, id) {
  S.controlled = id;
  const ch = charById(level, id);
  if (ch && ch.showSelected) ch.showSelected({ keep: FRIENDS.includes(id) });
}

function requestControl(id, level) {
  if (!FRIENDS.includes(id) || !charById(level, id) || S.otherControlled === id) return;
  if (isMine(id)) return setControlled(level, id);
  if (S.role === 'host') {
    S.owner[id] = 'host';
    delete S.remote[id];
    send({ t: 'own', id, o: 'host' });
    setControlled(level, id);
  } else {
    S.pendingTake = id;
    send({ t: 'take', id });
  }
}

function cycleControl() {
  const level = onlineLevel();
  if (!level) return;
  const ids = [S.myMain, ...level.friends.map((f) => f.data.char).filter((id) => id !== S.otherControlled)];
  const next = ids[(ids.indexOf(S.controlled) + 1) % ids.length];
  if (next === S.myMain) setControlled(level, next);
  else requestControl(next, level);
}

function readLocalInput(level) {
  const kb = S.game.input.keyboard;
  const k = (code) => !!kb.isDown(code);
  let l = k('ArrowLeft') || k('KeyA') || k('KeyG');
  let r = k('ArrowRight') || k('KeyD') || k('KeyJ');
  let u = k('ArrowUp') || k('KeyW') || k('KeyY');
  const main = charById(level, S.myMain);
  const orig = main && main.cursors && main.cursors._orig;
  if (orig && S.game.settings.controls !== 'keyboard') {
    l = l || !!orig.left.isDown;
    r = r || !!orig.right.isDown;
    u = u || !!orig.up.isDown;
  }
  return { l, r, u };
}

// ---------------------------------------------------------------- per-frame sync

function worldBodies(level) {
  if (level._net.bodies) return level._net.bodies;
  const STATIC = window.box2d.b2BodyType.b2_staticBody;
  const list = [];
  const add = (b) => {
    const d = b && b.data;
    if (d && d.GetType && d.GetType() !== STATIC) list.push(d);
  };
  for (const o of level.objects || []) {
    if (Array.isArray(o.body)) o.body.forEach(add);
    else add(o.body);
  }
  for (const f of level.fairies || []) add(f.body);
  level._net.bodies = list;
  return list;
}

function liquids(level) {
  if (level._net.liquids) return level._net.liquids;
  const layer = S.game.layers && S.game.layers.liquids;
  level._net.liquids = layer ? layer.children.filter((c) => c instanceof S.mods.Liquid) : [];
  return level._net.liquids;
}

function correctBody(body, x, y, angle, vx, vy, w, posBlend, velBlend, snapAt) {
  const B2 = window.box2d;
  const p = body.GetPosition();
  const dx = x - p.x;
  const dy = y - p.y;
  const a = angle == null ? body.GetAngle() : angle;
  if (Math.hypot(dx, dy) > snapAt) {
    body.SetTransformXYRadians(x, y, a);
    body.SetLinearVelocity(new B2.b2Vec2(vx, vy));
  } else {
    const cur = body.GetAngle();
    const na = angle == null ? cur : cur + (angle - cur) * posBlend;
    body.SetTransformXYRadians(p.x + dx * posBlend, p.y + dy * posBlend, na);
    const v = body.GetLinearVelocity();
    body.SetLinearVelocity(new B2.b2Vec2(v.x + (vx - v.x) * velBlend, v.y + (vy - v.y) * velBlend));
  }
  if (w != null) body.SetAngularVelocity(w);
  body.SetAwake(true);
}

function buildWorld(level) {
  return {
    t: 'w',
    s: level._net.seq,
    b: worldBodies(level).map((b) => {
      const p = b.GetPosition();
      const v = b.GetLinearVelocity();
      return [r3(p.x), r3(p.y), r3(b.GetAngle()), r3(v.x), r3(v.y), r3(b.GetAngularVelocity())];
    }),
    st: (level.objects || []).map((o) => (typeof o.state === 'number' && Number.isFinite(o.state) ? r3(o.state) : null)),
    lq: liquids(level).map((l) => (l.frozen ? 1 : 0)),
    dm: (level.diamonds || []).map((d) => (d.data.alive ? 1 : 0)),
    dc: chars(level).map((c) => [c.data.char, c.data.diamonds || 0, c.data.silverDiamond || 0]),
  };
}

function applyWorld(level, w) {
  const bodies = worldBodies(level);
  const n = Math.min(bodies.length, w.b.length);
  for (let i = 0; i < n; i++) {
    const [x, y, a, vx, vy, av] = w.b[i];
    correctBody(bodies[i], x, y, a, vx, vy, av, 0.5, 1, BODY_SNAP_M);
  }
  (level.objects || []).forEach((o, i) => {
    const v = w.st[i];
    // Triggers (they have a signal) compute their own state from their bodies;
    // receivers (platforms, portals, wind, beamers…) take the host's.
    if (v == null || o.signal || o.state === v) return;
    o.state = v;
    if (o._updateState) o._updateState();
  });
  liquids(level).forEach((l, i) => {
    if (w.lq[i] && !l.frozen) l.freeze();
    else if (w.lq[i] === 0 && l.frozen) l.melt();
  });
  (level.diamonds || []).forEach((d, i) => {
    if (w.dm[i] === 0 && d.data.alive) {
      d.data.alive = false;
      d.updateVisibility();
    }
  });
  for (const [id, dd, sd] of w.dc) {
    const ch = charById(level, id);
    if (ch && ch.data) {
      if ('diamonds' in ch.data) ch.data.diamonds = dd;
      ch.data.silverDiamond = sd;
    }
  }
}

function release(level) {
  const net = level._net;
  if (!net.hold) return;
  net.hold = false;
  const g = S.game;
  if (g.physics.box2d) g.physics.box2d.paused = false;
  if (level.camManager) level.camManager.camFreeze = false;
  if (level.ui && level.ui.clock) level.ui.clock.start();
  if (!S.greeted) {
    S.greeted = true;
    const me = characterList().find((c) => c.id === S.myMain);
    if (me) S.lobby.toast(t('you_are', { name: me.name }));
  }
}

function tick(level) {
  const net = level._net;
  const now = performance.now();

  // 1. synchronized start
  if (net.hold && now >= net.introAt) {
    if (S.role === 'host') {
      if (S.guestReadySeq === net.seq || now >= net.introAt + READY_TIMEOUT_MS) {
        send({ t: 'go', s: net.seq });
        release(level);
      }
    } else if (net.goPending || S.pendingGo === net.seq) {
      release(level);
    }
  }

  // 2. inputs for every character
  const local = readLocalInput(level);
  for (const ch of chars(level)) {
    const c = ch.cursors;
    if (!c || !c._net) continue;
    const id = ch.data.char;
    let src = ZERO;
    if (isMine(id)) src = id === S.controlled ? local : ZERO;
    else if (S.remote[id] && S.remote[id].s === net.seq) src = S.remote[id];
    c.left.isDown = !!src.l;
    c.right.isDown = !!src.r;
    c.up.isDown = !!src.u;
    c.active = c.left.isDown || c.right.isDown || c.up.isDown;
  }

  // 3. ease the other player's characters toward their stream
  for (const ch of chars(level)) {
    const id = ch.data.char;
    if (isMine(id) || ch.dying) continue;
    const r = S.remote[id];
    const body = ch.body && ch.body.data;
    if (!r || r.s !== net.seq || !body) continue;
    const age = Math.min(EXTRAPOLATE_MAX_S, (now - r.at) / 1000);
    correctBody(body, r.x + r.vx * age, r.y + r.vy * age, null, r.vx, r.vy, null, 0.25, 0.2, CHAR_SNAP_M);
  }

  // 4. guest: apply the newest host snapshot once
  if (S.role === 'guest' && S.world && S.world.s === net.seq && !S.world.applied) {
    S.world.applied = true;
    applyWorld(level, S.world);
  }

  // 5. stream
  if (!S.connected) return;
  if (now - S.lastCharsAt >= CHARS_EVERY_MS) {
    S.lastCharsAt = now;
    const ch = [];
    for (const c of chars(level)) {
      const id = c.data.char;
      if (!isMine(id) || !c.body || !c.body.data) continue;
      const b = c.body.data;
      const p = b.GetPosition();
      const v = b.GetLinearVelocity();
      const inp = id === S.controlled ? local : ZERO;
      ch.push([id, r3(p.x), r3(p.y), r3(v.x), r3(v.y), (inp.l ? 1 : 0) | (inp.r ? 2 : 0) | (inp.u ? 4 : 0)]);
    }
    send({ t: 'c', s: net.seq, k: S.controlled, ch });
  }
  if (S.role === 'host' && now - S.lastWorldAt >= WORLD_EVERY_MS) {
    S.lastWorldAt = now;
    send(buildWorld(level));
  }
}

// ---------------------------------------------------------------- patches

function patchLevel(Level) {
  const L = Level.prototype;

  wrap(L, 'createCharObjects', function (orig, args) {
    if (liveSession()) {
      if (!this._net) this._net = { seq: S.seq, hold: false, introAt: 0, goPending: false };
      S.game.gameConfig.canRevive = false; // checkpoints can't be shared between two browsers
      resetOwnership(this);
    } else {
      S.game.gameConfig.canRevive = S.origCanRevive;
    }
    S.suppressSelect = true;
    let result;
    try {
      result = orig.apply(this, args);
    } finally {
      S.suppressSelect = false;
    }
    if (this._net) {
      for (const ch of chars(this)) if (ch.cursors && !ch.cursors._net) ch.cursors = makeNetCursors(ch.cursors);
      resetOwnership(this);
      applyTouchVisibility(this);
      if (S.role === 'host') S.lastLevelData = this.levelData;
    }
    return result;
  });

  wrap(L, 'startLevel', function (orig, args) {
    const net = this._net;
    if (!net || !S.link) return orig.apply(this, args);
    const b2 = this.game.physics.box2d;
    if (b2 && !b2.update._ol) {
      const step = b2.update;
      const level = this;
      b2.update = function (...a) {
        if (level._net && level._net.hold && S.link) {
          this.paused = true;
          return undefined;
        }
        return step.apply(this, a);
      };
      b2.update._ol = true;
    }
    const result = orig.apply(this, args); // runs the settle ticks with physics on
    net.hold = true;
    net.introAt = performance.now() + INTRO_MS;
    applyTouchVisibility(this);
    if (this.spaceKey) {
      this.spaceKey.onDown.removeAll();
      this.spaceKey.onDown.add(() => cycleControl());
    }
    S.lobby.setSwitchVisible((this.friends || []).length > 0);
    if (S.role === 'guest') send({ t: 'ready', s: net.seq });
    return result;
  });

  wrap(L, 'update', function (orig, args) {
    if (this._net && S.link && this.loadCompleted && !this._olKilled) {
      try {
        tick(this);
      } catch (err) {
        console.error('[online] sync error', err);
      }
    }
    return orig.apply(this, args);
  });

  wrap(L, 'checkEndGame', function (orig, args) {
    if (this._net && S.link && S.role === 'guest') return undefined; // the host decides
    return orig.apply(this, args);
  });

  wrap(L, 'animateFinish', function (orig, args) {
    if (this._net && S.link && S.role === 'host') send({ t: 'end', s: this._net.seq, win: true });
    return orig.apply(this, args);
  });

  wrap(L, 'gameOver', function (orig, args) {
    if (this._net && S.link && S.role === 'host') send({ t: 'end', s: this._net.seq, win: false });
    return orig.apply(this, args);
  });

  wrap(L, 'retry', function (orig, args) {
    if (!this._net || !S.link || !S.connected) return orig.apply(this, args);
    if (S.role === 'host') return hostStartLevel(this.levelData);
    send({ t: 'retry', s: this._net.seq });
    return undefined;
  });

  wrap(L, 'togglePause', function (orig, args) {
    const result = orig.apply(this, args);
    const paused = !!this.game.paused;
    // The bundle pauses the level when the window loses focus or the tab is hidden
    // (config.pauseOnBlur). That pause is only for this player; the partner keeps
    // playing. A pause they choose themselves (button, Esc) is shared.
    const focusLoss = paused && (document.hidden || !document.hasFocus());
    if (this._net && S.link && !S.applyingRemote && !focusLoss) send({ t: 'pause', s: this._net.seq, on: paused });
    return result;
  });

  wrap(L, 'onSettingChange', function (orig, args) {
    S.suppressSelect = true;
    try {
      return orig.apply(this, args);
    } finally {
      S.suppressSelect = false;
      if (this._net) applyTouchVisibility(this);
    }
  });

  wrap(L, 'killAll', function (orig, args) {
    if (this._olKilled) return undefined;
    const result = orig.apply(this, args);
    if (this.game) this._olKilled = true;
    return result;
  });
}

function patchCharacter(Character) {
  const C = Character.prototype;

  wrap(C, 'kill', function (orig, args) {
    const lvl = this.game && this.game.level;
    if (!lvl || !lvl._net || !S.link) return orig.apply(this, args);
    if (S.allowKill.has(this)) {
      S.allowKill.delete(this);
      return orig.apply(this, args);
    }
    const id = this.data && this.data.char;
    if (!isMine(id)) return undefined; // its owner tells us
    if (!this.dying) send({ t: 'died', s: lvl._net.seq, id });
    return orig.apply(this, args);
  });

  // Tapping a character. The bundle skips selecting Stan or Lisa while their
  // controls are enabled, and online they always are (netplay steers them), so
  // tapping your own character after a buddy showed the arrow but left the buddy
  // under your control. Online, a tap on your character or a buddy always selects it.
  wrap(C, 'onTouched', function (orig, args) {
    const lvl = this.game && this.game.level;
    if (!lvl || !lvl._net || !S.link) return orig.apply(this, args);
    const id = this.data && this.data.char;
    if (id !== S.myMain && !FRIENDS.includes(id)) return 'skipped'; // the partner's character
    lvl.touchedFriends[id] = true;
    if (this.game.settings.vibrate && navigator.vibrate) navigator.vibrate(10);
    this.onSelect(args[0]);
    return null;
  });

  wrap(C, 'onSelect', function (orig, args) {
    const lvl = this.game && this.game.level;
    if (!lvl || !lvl._net || !S.link) return orig.apply(this, args);
    if (S.suppressSelect) return undefined;
    const id = this.data && this.data.char;
    if (FRIENDS.includes(id)) requestControl(id, lvl);
    else if (id === S.myMain) setControlled(lvl, id);
    return undefined;
  });
}

function patchDiamond(Diamond) {
  wrap(Diamond.prototype, 'grabbed', function (orig, args) {
    const lvl = this.game && this.game.level;
    if (!lvl || !lvl._net || !S.link || S.applyingRemote) return orig.apply(this, args);
    const ch = args[0];
    const id = ch && ch.data && ch.data.char;
    if (!isMine(id)) return undefined; // the owner of that character reports the pickup
    send({ t: 'gem', s: lvl._net.seq, i: lvl.diamonds.indexOf(this), c: id });
    return orig.apply(this, args);
  });
}

function patchMechManager(MechManager) {
  wrap(MechManager.prototype, 'deviceChanged', function (orig, args) {
    const lvl = this.game && this.game.level;
    if (S.link && S.role === 'guest' && lvl && lvl._net) {
      const dev = args[0];
      if (dev && dev.updateLight) dev.updateLight(dev.state); // receivers follow the host
      return undefined;
    }
    return orig.apply(this, args);
  });
}

function patchLevelMenu(LevelMenu) {
  wrap(LevelMenu.prototype, 'startLevel', function (orig, args) {
    if (!liveSession()) return orig.apply(this, args);
    if (S.role === 'guest') {
      S.lobby.toast(t('friend_choosing'));
      return undefined;
    }
    const btn = args[0];
    S.seq += 1;
    S.lastLevelData = btn.data;
    send({ t: 'level', s: S.seq, id: btn.data.id });
    return orig.apply(this, args);
  });
}

function patchFade(game) {
  const origFade = game.state.fade;
  game.state.fade = function (key, ...rest) {
    // A guest who joined by link never opened the level map, so the state the
    // game expects to exist ("levelMenu", normally added by the Play button) may be missing.
    if (key === 'levelMenu' && !this.states.levelMenu) this.add('levelMenu', S.mods.LevelMenu);
    try {
      if (liveSession() && !S.applyingRemote && key === 'levelMenu') {
        const cur = this.current;
        const lvl = S.game.level;
        if (S.role === 'host' && (cur === 'level' || cur === 'endGame')) send({ t: 'menu' });
        else if (S.role === 'guest' && cur === 'level' && lvl && lvl._net && !lvl.ended) send({ t: 'menu' });
      }
    } catch (err) {
      console.error('[online]', err);
    }
    return origFade.call(this, key, ...rest);
  };
}

/** Screen point just above a character's head, or null outside an online level. */
function bubbleAnchor(id) {
  const lvl = onlineLevel();
  const ch = lvl && id && charById(lvl, id);
  if (!ch || !ch.sprite || ch.isDead || !ch.sprite.worldVisible) return null;
  const b = ch.sprite.getBounds();
  const canvas = S.game.canvas.getBoundingClientRect();
  const x = Math.max(60, Math.min(window.innerWidth - 60, canvas.left + b.x + b.width / 2));
  const y = Math.max(70, Math.min(window.innerHeight - 10, canvas.top + b.y));
  return { x, y };
}

// ---------------------------------------------------------------- menu button

function addOnlineButton(hall) {
  const g = S.game;
  const btn = new S.mods.GoldButton(g, 0, 0, g.lang.locale('play_online'), onPlayOnline, 30);
  hall.addChild(btn);
  hall._olBtn = btn;
  const layout = hall.layoutContent;
  const place = () => {
    btn.x = 0;
    btn.y = hall.playBtn.y + hall.playBtn.height * 2.2;
  };
  hall.layoutContent = function (...a) {
    const r = layout.apply(this, a);
    place();
    return r;
  };
  place();
}

function watchMenu() {
  const g = S.game;
  if (g.state.current === 'menu') {
    const hall = g.state.states.menu && g.state.states.menu.templeHall;
    if (hall && hall.playBtn && !hall._olBtn && hall.game) addOnlineButton(hall);
  }
  requestAnimationFrame(watchMenu);
}

function onPlayOnline() {
  if (S.link) {
    if (S.role === 'host' && !S.connected) showInvite();
    else if (S.connected) S.lobby.toast(t('connected'));
    return;
  }
  S.lobby.characters = characterList();
  S.lobby.showChooseCharacter({ onPick: (id) => startHost(id), onCancel: () => S.lobby.close() });
}

// ---------------------------------------------------------------- boot

function injectStrings(game) {
  for (const lang of Object.keys(game.lang.dicts)) {
    game.lang.dicts[lang].play_online = translate(lang, 'play_online');
  }
}

// Phaser only asks for the next animation frame after game.update() returns, so a
// single exception anywhere in a frame would freeze the game for good (for both
// players when online). Log it and keep the loop alive instead.
function guardGameLoop() {
  const RAF = window.Phaser.RequestAnimationFrame && window.Phaser.RequestAnimationFrame.prototype;
  if (!RAF || RAF.updateRAF._olGuard) return;
  const updateRAF = RAF.updateRAF;
  RAF.updateRAF = function (time) {
    try {
      updateRAF.call(this, time);
    } catch (err) {
      console.error('[game] frame error', err);
      if (this.isRunning) this._timeOutID = window.requestAnimationFrame(this._onLoop);
    }
  };
  RAF.updateRAF._olGuard = true;
}

function init(game) {
  const req = window.require;
  S.game = game;
  guardGameLoop();
  S.mods = {
    Level: req('States/Level/Level'),
    Character: req('States/Level/Characters/Character'),
    LevelMenu: req('States/LevelMenu/LevelMenu'),
    GoldButton: req('States/Common/GoldButton'),
    MechManager: req('States/Level/MechManager'),
    Liquid: window.Devices.Liquid,
  };
  S.origCanRevive = game.gameConfig ? !!game.gameConfig.canRevive : true;
  S.lobby = new Lobby({ getLang, characters: characterList() });
  S.chat = new Chat({
    root: S.lobby.root,
    t,
    onSend: (text) => {
      if (!send({ t: 'say', text })) return;
      S.chat.show(S.controlled || S.myMain, text);
    },
    anchorFor: bubbleAnchor,
    nameOf: (id) => CHAR_NAMES[id] || '',
  });

  injectStrings(game);
  patchLevel(S.mods.Level);
  patchCharacter(S.mods.Character);
  patchDiamond(window.Devices.Diamond);
  patchMechManager(S.mods.MechManager);
  patchLevelMenu(S.mods.LevelMenu);
  patchFade(game);
  game.state.onStateChange.add(() => setTimeout(updateBanner, 0));
  requestAnimationFrame(watchMenu);

  // Expose a tiny read-only view for debugging and the e2e test.
  window.__online = {
    get role() {
      return S.role;
    },
    get connected() {
      return S.connected;
    },
    get myMain() {
      return S.myMain;
    },
    get inviteUrl() {
      return S.inviteUrl;
    },
    get seq() {
      return S.seq;
    },
    get controlled() {
      return S.controlled;
    },
    /** Whether this browser moves character `id` (always true offline). */
    owns(id) {
      return !liveSession() || !(id in S.owner) || S.owner[id] === S.role;
    },
  };

  const invite = parseInvite(location.hash);
  if (invite) {
    history.replaceState(null, '', location.pathname + location.search);
    startGuest(invite.secret);
    return;
  }
  const saved = loadSession();
  if (saved && saved.role === 'host' && MAIN.includes(saved.hostChar)) startHost(saved.hostChar, saved);
  else if (saved && saved.role === 'guest') startGuest(saved.secret, saved.token, MAIN.includes(saved.hostChar) ? saved.hostChar : null);
}

function gameReady() {
  const P = window.Phaser;
  const g = P && P.GAMES && P.GAMES[0];
  const req = window.require;
  return (
    g &&
    g.lang &&
    g.state &&
    g.gameConfig &&
    typeof req === 'function' &&
    req.defined &&
    req.defined('States/Level/Level') &&
    req.defined('States/LevelMenu/LevelMenu') &&
    window.Devices &&
    window.box2d
  );
}

(function waitForGame() {
  if (gameReady()) init(window.Phaser.GAMES[0]);
  else setTimeout(waitForGame, 30);
})();
