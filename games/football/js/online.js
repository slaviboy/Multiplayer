// Online play with a friend.
//
// The host picks a player, presses "Invite a friend" and shares the link or QR
// code; the friend opens it, picks a player and presses Ready. The host is the
// left player, the friend the right one. When both are ready the host starts the
// match (pitch and length are the host's).
//
// The match runs in lockstep (./lockstep.js): both browsers run the same
// deterministic simulation (./sim.js) tick by tick and exchange only the keys each
// player presses, sampled a few ticks ahead to hide the network delay. Every
// second both compare a hash of the match, so a difference would show at once.
// Signalling goes through public Nostr relays, the game itself over WebRTC
// directly between the two browsers (../../../shared/online/peer-link.js).
import { createInvite, inviteUrl, isInt, isShortString, parseInvite } from '../../../shared/online/protocol.js';
import { PeerLink } from '../../../shared/online/peer-link.js';
import { Lobby, translate } from '../../../shared/online/lobby.js';
import { Chat } from '../../../shared/online/chat.js';
import { Lockstep } from './lockstep.js';
import { DT, HEAD, MAX_INPUT, PLAYER_H, hashState } from './sim.js';
import { STADIUMS } from './catalog.js';
import { distinctKits, kitName, validKit } from './roster.js';

const APP_ID = 'football';
const SESSION_KEY = 'football:online';
const SESSION_MAX_AGE_MS = 2 * 60 * 60 * 1000;
const HASH_EVERY = 40; // ticks (one second)
const MAX_CATCH_UP = 6; // ticks run in one frame after a wait
const SIDES = ['left', 'right'];
const lang = () => (navigator.language || 'en').split('-')[0];

export class Online {
  /** `api`: the app (screens, sound, controls, renderer, startMatch, runTick, endMatch, toMenu…). */
  constructor(api) {
    this.api = api;
    this.link = null;
    this.role = null;
    this.secret = null;
    this.token = null;
    this.inviteUrl = null;
    this.connected = false;
    this.myKit = null; // my outfit once I'm ready to play
    this.partnerKit = null; // theirs once they're ready
    this.matchNo = 0;
    this.net = null; // the running lockstep match
    this.desyncs = [];
    this.lag = 0; // tests: delay incoming messages
    this.lobby = new Lobby({
      getLang: lang,
      characters: [
        { id: 'left', name: 'the player on the left', hint: 'Host', accent: '#3f8cff' },
        { id: 'right', name: 'the player on the right', hint: 'Guest', accent: '#ff8a2a' },
      ],
    });
    this.chat = new Chat({
      root: this.lobby.root,
      t: (key, vars) => translate(lang(), key, vars),
      onSend: (text) => {
        if (!this.send({ t: 'say', text })) return;
        this.chat.show(SIDES[this.me], text);
      },
      anchorFor: (who) => this.bubbleAnchor(who),
      nameOf: (who) => this.nameOf(SIDES.indexOf(who)),
    });
    setInterval(() => this.updateHud(), 1000);
  }

  get me() {
    return this.role === 'guest' ? 1 : 0;
  }

  get live() {
    return !!(this.link && this.connected);
  }

  send(msg) {
    return this.link ? this.link.send(msg) : false;
  }

  /** A lockstep match is on screen and not over yet. */
  get playing() {
    const m = this.api.match;
    return !!(this.net && m && m.net === this.net && !m.resultShown);
  }

  nameOf(slot) {
    const kit = slot === this.me ? this.myKit : this.partnerKit;
    const m = this.api.match;
    if (m && m.mode === 'online') return m.names[slot];
    return kit ? kitName(kit) : slot === this.me ? 'You' : 'Your friend';
  }

  // ------------------------------------------------------------ sessions

  saveSession() {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ role: this.role, secret: this.secret, token: this.token, at: Date.now() }));
    } catch {
      /* storage blocked: no resume after a reload */
    }
  }

  loadSession() {
    try {
      const s = JSON.parse(sessionStorage.getItem(SESSION_KEY));
      if (s && (s.role === 'host' || s.role === 'guest') && typeof s.secret === 'string' && Date.now() - s.at < SESSION_MAX_AGE_MS) return s;
    } catch {
      /* none */
    }
    return null;
  }

  clearSession() {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
  }

  /** At page load: join from an invite link, or pick up a session after a reload. */
  resume() {
    const invite = parseInvite(location.hash);
    if (invite) {
      history.replaceState(null, '', location.pathname + location.search);
      this.startGuest(invite.secret);
      return true;
    }
    const saved = this.loadSession();
    if (saved && saved.role === 'host') {
      this.myKit = this.api.kit;
      this.startHost(saved);
      return true;
    }
    if (saved && saved.role === 'guest') {
      this.startGuest(saved.secret, saved.token);
      return true;
    }
    return false;
  }

  /** "Play online with a friend": pick a player, then invite. */
  host() {
    const { screens } = this.api;
    const options = this.api.options;
    screens.select({
      title: 'Choose your player',
      sub: 'Then invite a friend: you play on the left, your friend on the right.',
      kit: this.api.kit,
      options: { stadium: options.stadium, seconds: options.seconds, onChange: (k, v) => (options[k] = v) },
      confirm: 'Invite a friend',
      onBack: () => this.api.toMenu(),
      onDone: (kit) => {
        this.api.kit = kit;
        this.myKit = kit;
        this.startHost();
      },
    });
  }

  startHost(resume = null) {
    const invite = resume ? { secret: resume.secret } : createInvite();
    this.role = 'host';
    this.secret = invite.secret;
    this.token = resume ? resume.token : null;
    this.inviteUrl = inviteUrl(location.href, invite);
    this.saveSession();
    this.openLink();
    this.showWaiting();
    this.lobby.showInvite({ url: this.inviteUrl, friendCharId: 'right', onCancel: () => this.leave() });
  }

  startGuest(secret, token = null) {
    this.role = 'guest';
    this.secret = secret;
    this.token = token;
    this.saveSession();
    this.openLink();
    this.api.screens.versus({ kits: [null, null], names: ['', ''], labels: ['Your friend', 'You'] });
    this.lobby.showJoining({ myCharId: 'right', onCancel: () => this.leave() });
  }

  openLink() {
    if (this.link) this.link.close();
    this.connected = false;
    const receive = (m) => (this.lag ? setTimeout(() => this.onMessage(m), this.lag) : this.onMessage(m));
    this.link = new PeerLink({
      appId: APP_ID,
      secret: this.secret,
      role: this.role,
      token: this.token,
      onMessage: receive,
      onStatus: (status, info) => this.onStatus(status, info),
    });
    this.link.start().catch((err) => {
      console.error('[online] could not start', err);
      this.onStatus('error', { reason: 'network' });
    });
  }

  /** Ends the online session and goes back to the menu. */
  leave() {
    if (this.link) this.link.close();
    this.link = null;
    this.connected = false;
    this.role = this.secret = this.token = this.inviteUrl = null;
    this.net = null;
    this.partnerKit = null;
    this.myKit = null;
    this.clearSession();
    this.lobby.close();
    this.lobby.hideHud();
    this.lobby.banner(null);
    this.chat.clear();
    this.chat.setEnabled(false);
    this.api.toMenu();
  }

  confirmLeave() {
    const L = this.lobby;
    L.open(
      L.card('Leave the match?', 'Your friend will be told that you left.', [], [
        L.button('Leave', () => this.leave(), 'primary'),
        L.button('Stay', () => L.close()),
      ]),
    );
  }

  onStatus(status, info = {}) {
    if (status === 'connected') {
      this.connected = true;
      this.token = this.role === 'host' ? this.link.token : info.token || this.token;
      this.saveSession();
      this.lobby.showConnected(SIDES[this.me]);
      // the online bar is small: just "Left" / "Right" there
      const full = this.lobby.characters;
      this.lobby.characters = full.map((c) => ({ ...c, name: c.id === 'left' ? 'Left' : 'Right' }));
      this.lobby.showHud({ myCharId: SIDES[this.me], onLeave: () => this.confirmLeave(), onChat: () => this.chat.toggle() });
      this.lobby.characters = full;
      this.chat.setEnabled(true);
      this.updateHud();
      this.send({ t: 'hi', kit: this.myKit, m: this.playing ? this.net.no : 0 });
      if (this.playing) {
        // back after a blip: ask for the inputs that were lost meanwhile
        this.send({ t: 'resend', m: this.net.no, k: this.net.ls.tick });
        return;
      }
      if (this.role === 'guest' && !this.myKit) this.chooseAsGuest();
      else this.showWaiting();
    } else if (status === 'away') {
      this.connected = false;
      this.api.controls.releaseAll();
      this.lobby.showAway({ onLeave: () => this.leave() });
    } else if (status === 'error') {
      if (this.connected) return;
      const canRetry = this.role === 'guest' && info.reason !== 'full' && info.reason !== 'version';
      this.lobby.showError({
        reason: info.reason,
        onRetry: canRetry
          ? () => {
              this.openLink();
              this.lobby.showJoining({ myCharId: 'right', onCancel: () => this.leave() });
            }
          : null,
        onClose: () => this.leave(),
      });
    }
  }

  updateHud() {
    if (!this.link) return;
    const rtt = this.link.rtt;
    this.lobby.setHudPing(this.connected ? rtt : null, !this.connected ? 'away' : rtt > 200 ? 'slow' : 'ok');
  }

  /** Room the online bar needs above the scoreboard, in CSS pixels. */
  hudSpace() {
    const hud = this.lobby.hud;
    return hud && this.api.match && this.api.match.mode === 'online' ? hud.getBoundingClientRect().bottom + 4 : 0;
  }

  // ------------------------------------------------------------ choosing and starting

  chooseAsGuest() {
    this.api.screens.select({
      title: 'Choose your player',
      sub: 'You play on the right. Your friend starts the match when you are ready.',
      kit: this.api.kit,
      side: 'right',
      confirm: 'Ready',
      onBack: () => this.leave(),
      onDone: (kit) => {
        this.api.kit = kit;
        this.setReady(kit);
      },
    });
  }

  setReady(kit) {
    this.myKit = kit;
    this.send({ t: 'ready', kit });
    this.showWaiting();
    this.maybeStart();
  }

  /** The versus screen while someone is still choosing. */
  showWaiting() {
    const kits = this.me === 0 ? [this.myKit, this.partnerKit] : [this.partnerKit, this.myKit];
    const names = kits.map((k) => (k ? kitName(k) : ''));
    const labels = this.me === 0 ? ['You', 'Your friend'] : ['Your friend', 'You'];
    let status = '';
    if (!this.connected) status = this.role === 'host' ? 'Waiting for your friend…' : 'Connecting…';
    else if (!this.partnerKit) status = 'Your friend is choosing a player…';
    else if (this.role === 'guest') status = 'Starting…';
    this.api.screens.versus({ kits, names, labels, status });
  }

  maybeStart() {
    if (this.role !== 'host' || !this.live || !this.myKit || !this.partnerKit || this.playing) return;
    clearTimeout(this.startTimer);
    this.showWaiting();
    this.startTimer = setTimeout(() => {
      if (this.role !== 'host' || !this.live || !this.myKit || !this.partnerKit || this.playing) return;
      const rtt = this.link.rtt || 120;
      const delay = Math.max(2, Math.min(10, Math.ceil((rtt / 2 + 30) / 25)));
      const msg = {
        t: 'start',
        m: ++this.matchNo,
        delay,
        kits: [this.myKit, this.partnerKit],
        stadium: this.api.options.stadium,
        seconds: this.api.options.seconds,
      };
      if (this.send(msg)) this.begin(msg);
    }, 1800);
  }

  async begin(msg) {
    this.matchNo = Math.max(this.matchNo, msg.m);
    const kits = distinctKits(validKit(msg.kits[0]), validKit(msg.kits[1]));
    this.partnerKit = null; // each player says "ready" again for the next match
    this.myKitForMatch = this.myKit;
    this.myKit = null;
    this.net = {
      no: msg.m,
      me: this.me,
      ls: new Lockstep({ delay: msg.delay, me: this.me }),
      outbox: [],
      outboxFrom: 0,
      hashes: new Map(),
      acc: 0,
      desynced: false,
    };
    const names = kits.map(kitName);
    await this.api.startMatch({ mode: 'online', kits, names, stadium: msg.stadium, seconds: msg.seconds, online: this.net });
    this.chat.clear();
    this.chat.setEnabled(true);
  }

  /** Called every frame during an online match; returns the render interpolation (0…1). */
  frame(dt) {
    const n = this.net;
    const m = this.api.match;
    if (!n || !m || m.net !== n || m.resultShown) return 1;
    n.acc += dt;
    let ran = 0;
    n.waiting = false;
    while (n.acc >= DT && ran < MAX_CATCH_UP) {
      this.sample(n);
      if (!n.ls.ready()) {
        n.waiting = true;
        break;
      }
      const tick = n.ls.tick;
      this.api.runTick(n.ls.take());
      n.acc -= DT;
      ran++;
      if (tick % HASH_EVERY === 0) {
        const h = hashState(m.s);
        this.send({ t: 'h', m: n.no, k: tick, h });
        this.compareHash(tick, h, 'local');
      }
    }
    if (n.waiting || ran === MAX_CATCH_UP) n.acc = Math.min(n.acc, DT); // waited: don't rush to catch up
    this.flush(n);
    return n.waiting ? 1 : n.acc / DT;
  }

  sample(n) {
    let tick;
    while ((tick = n.ls.nextSample()) >= 0) {
      const bits = this.connected ? this.api.controls.solo() : 0;
      n.ls.addLocal(tick, bits);
      if (!n.outbox.length) n.outboxFrom = tick;
      n.outbox.push(bits);
    }
  }

  flush(n) {
    if (!n.outbox.length) return;
    if (this.send({ t: 'in', m: n.no, k: n.outboxFrom, v: n.outbox })) n.outbox = [];
    else if (n.outbox.length > 400) n.outbox = []; // the partner will ask for them again
  }

  compareHash(tick, h, who) {
    const n = this.net;
    const e = n.hashes.get(tick) || {};
    e[who] = h;
    n.hashes.set(tick, e);
    if (e.local !== undefined && e.remote !== undefined) {
      if (e.local !== e.remote && !n.desynced) {
        n.desynced = true;
        this.desyncs.push(tick);
        console.warn(`[online] the two games went out of sync at tick ${tick}`);
        this.lobby.toast('Out of sync with your friend');
      }
      n.hashes.delete(tick);
    }
  }

  /** The partner reloaded or left the match: it's over for both. */
  abandonMatch() {
    this.net = null;
    this.api.endMatch();
    this.lobby.toast('Your friend left the match');
    if (this.role === 'guest') this.chooseAsGuest();
    else {
      this.myKit = this.myKit || this.myKitForMatch || this.api.kit;
      this.showWaiting();
    }
  }

  showResult(m, title) {
    const { screens } = this.api;
    this.api.controls.setEnabled(false);
    const again = () => this.setReady(this.myKitForMatch || this.api.kit);
    screens.result({
      title,
      sub: m.s.golden ? 'Decided by a golden goal' : '',
      score: m.s.score,
      kits: m.kits,
      names: m.names,
      winner: m.s.winner,
      buttons: [
        { label: 'Play again', kind: 'green', action: 'again', onClick: again },
        {
          label: 'Change player',
          kind: 'blue',
          action: 'change',
          onClick: () => {
            this.net = null;
            this.api.endMatch();
            if (this.role === 'guest') this.chooseAsGuest();
            else this.hostRechoose();
          },
        },
        { label: 'Leave', kind: 'orange', action: 'leave', onClick: () => this.leave() },
      ],
    });
  }

  hostRechoose() {
    this.api.screens.select({
      title: 'Choose your player',
      sub: 'You play on the left.',
      kit: this.myKitForMatch || this.api.kit,
      options: { stadium: this.api.options.stadium, seconds: this.api.options.seconds, onChange: (k, v) => (this.api.options[k] = v) },
      confirm: 'Ready',
      onBack: () => this.confirmLeave(),
      onDone: (kit) => {
        this.api.kit = kit;
        this.setReady(kit);
      },
    });
  }

  // ------------------------------------------------------------ messages

  valid(m) {
    const fromHost = this.role === 'guest';
    switch (m.t) {
      case 'hi':
        return isInt(m.m) && (m.kit === null || !!validKit(m.kit));
      case 'ready':
        return !!validKit(m.kit);
      case 'start':
        return (
          fromHost && isInt(m.m) && m.m > 0 && isInt(m.delay) && m.delay >= 1 && m.delay <= 12 &&
          Array.isArray(m.kits) && m.kits.length === 2 && m.kits.every((k) => !!validKit(k)) &&
          STADIUMS.includes(m.stadium) && isInt(m.seconds) && m.seconds >= 5 && m.seconds <= 600
        );
      case 'in':
        return isInt(m.m) && isInt(m.k) && m.k >= 0 && Array.isArray(m.v) && m.v.length <= 420 && m.v.every((b) => isInt(b) && b >= 0 && b <= MAX_INPUT);
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

  onMessage(m) {
    if (!this.valid(m)) return;
    const n = this.net;
    switch (m.t) {
      case 'hi':
        // the partner (re)joined: if they are not in our match any more, it's over
        if (this.playing && m.m !== n.no) this.abandonMatch();
        if (m.kit) this.onPartnerReady(validKit(m.kit));
        break;
      case 'ready':
        if (this.playing) this.abandonMatch();
        this.onPartnerReady(validKit(m.kit));
        break;
      case 'start':
        if (n && m.m === n.no) break;
        this.begin(m);
        break;
      case 'in':
        if (n && m.m === n.no) m.v.forEach((b, i) => n.ls.addRemote(m.k + i, b));
        break;
      case 'h':
        if (n && m.m === n.no) this.compareHash(m.k, m.h, 'remote');
        break;
      case 'resend':
        if (n && m.m === n.no) {
          const { from, values } = n.ls.localFrom(m.k);
          for (let i = 0; i < values.length; i += 200) this.send({ t: 'in', m: n.no, k: from + i, v: values.slice(i, i + 200) });
        }
        break;
      case 'say':
        this.chat.show(SIDES[1 - this.me], m.text);
        break;
    }
  }

  onPartnerReady(kit) {
    this.partnerKit = kit;
    const sc = this.api.screens.current;
    if (sc === 'versus') this.showWaiting();
    this.maybeStart();
  }

  // ------------------------------------------------------------ chat bubbles

  bubbleAnchor(who) {
    const m = this.api.match;
    if (!m || m.mode !== 'online' || m.resultShown) return null;
    const p = m.s.players[SIDES.indexOf(who)];
    if (!p) return null;
    const at = this.api.renderer.toCss(p.x + HEAD.x * p.f, p.y + PLAYER_H + 0.35);
    return { x: Math.max(60, Math.min(window.innerWidth - 60, at.x)), y: Math.max(56, at.y) };
  }
}
