// Two-player WebRTC link over Trystero (Nostr relays for signalling only).
//
// Roles: the *host* created the invite and waits; the *guest* opened the link.
// Handshake (both directions, sent to each peer that appears in the room):
//   hello {v, role, token?}  →  host answers the first guest with welcome {token}
// The token identifies the guest for the rest of the session: a guest that
// reconnects (reload, network blip) presents it and gets its seat back; anyone
// else who somehow has the link gets `full` and is ignored.
//
// Connecting fast: Trystero announces a few times in the first seconds after
// joining, then only once a minute. When a WebRTC attempt fails after the
// offer/answer exchange it gives up on that attempt silently (~23 s) and the
// next try waits for the next announce, so one failed attempt used to cost up to
// a minute. We rejoin the room as soon as an attempt fails, which restarts the
// fast announces on both sides. ICE candidates travel inside the offer/answer
// (trickleIce: false) so a relay dropping or rate-limiting one of many small
// candidate messages can't leave a peer without the other's public address.
import { joinRoom } from '../vendor/trystero-nostr.mjs';
import { PROTOCOL_VERSION, createToken, isEnvelope, roomFor } from './protocol.js';

const GUEST_CONNECT_TIMEOUT_MS = 45_000;
const PING_EVERY_MS = 2_000;
const MAX_RECEIVE_BYTES = 64 * 1024;
const REJOIN_MIN_GAP_MS = 4_000;
const BYE_GRACE_MS = 250;
// Nostr relays for signalling. Trystero's default is 5 relays picked from a long
// community list by app id, and one of ours (relay.bullishbounty.com) is dead.
// These were checked to accept Trystero's events and answer within ~1.5 s; the
// first four are the working ones from the old default, so a partner still
// running a cached older page shares relays with us.
const RELAYS = [
  'wss://relay.grigic.org',
  'wss://nostr.christiansass.de',
  'wss://nostr.red5d.dev',
  'wss://cdn.satellite.earth',
  'wss://nos.lol',
  'wss://relay.layer.systems',
];

// Trystero hands back the *same* room object while a room with that id is still
// joined, so a new link must wait until the previous one has really left.
const leaving = new Map(); // roomId -> Promise

// Connection diagnostics in the console: "[online +3.2s] ..." lines show where
// the time goes (relays, a WebRTC attempt failing, the handshake).
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const T0 = now();
const log = (...a) => console.info(`[online +${((now() - T0) / 1000).toFixed(1)}s]`, ...a);
const candidateTypes = (sdp) => {
  const n = {};
  for (const m of String(sdp || '').matchAll(/ typ (\w+)/g)) n[m[1]] = (n[m[1]] || 0) + 1;
  return JSON.stringify(n);
};
let pcCount = 0;
const LoggedPeerConnection =
  typeof RTCPeerConnection === 'undefined'
    ? undefined
    : class extends RTCPeerConnection {
        constructor(config) {
          super(config);
          const id = ++pcCount;
          this.addEventListener('connectionstatechange', () => log(`webrtc #${id} ${this.connectionState}`));
          this.addEventListener('icegatheringstatechange', () => {
            if (this.iceGatheringState === 'complete')
              log(`webrtc #${id} own candidates ${candidateTypes(this.localDescription && this.localDescription.sdp)}`);
          });
        }
        async setRemoteDescription(desc) {
          log(`webrtc remote ${desc && desc.type}, candidates ${candidateTypes(desc && desc.sdp)}`);
          return super.setRemoteDescription(desc);
        }
      };

export class PeerLink {
  /**
   * @param {object} o
   * @param {string} o.appId        namespace, e.g. 'stan-and-lisa'
   * @param {string} o.secret       invite secret
   * @param {'host'|'guest'} o.role
   * @param {string|null} [o.token] guest: token from an earlier session (reconnect)
   * @param {(msg:object)=>void} o.onMessage   game messages (only from the partner, only once connected)
   * @param {(status:string, info?:object)=>void} o.onStatus
   *        'waiting' | 'connecting' | 'connected' {reconnect} | 'away' | 'error' {reason}
   */
  constructor({ appId, secret, role, token = null, onMessage, onStatus }) {
    this.appId = appId;
    this.secret = secret;
    this.role = role;
    this.token = token;
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.partnerId = null;
    this.status = 'idle';
    this.rtt = null;
    this.room = null;
    this.roomId = null;
    this.action = null;
    this.everConnected = false;
    this.timers = [];
    this.closed = false;
    this.rejoining = false;
    this.lastJoinAt = 0;
  }

  async start() {
    this.roomId = await roomFor(this.appId, this.secret);
    await this.joinRoom();
    if (this.closed) return;

    this.setStatus(this.role === 'host' ? 'waiting' : 'connecting');
    if (this.role === 'guest') {
      this.timers.push(
        setTimeout(() => {
          if (!this.everConnected && !this.closed) this.setStatus('error', { reason: 'timeout' });
        }, GUEST_CONNECT_TIMEOUT_MS),
      );
    }
    this.timers.push(setInterval(() => this.measurePing(), PING_EVERY_MS));
  }

  async joinRoom() {
    const roomId = this.roomId;
    while (leaving.has(roomId)) await leaving.get(roomId);
    if (this.closed) return;
    this.lastJoinAt = Date.now();
    log(`joining room as ${this.role}`);
    const room = joinRoom(
      {
        appId: this.appId,
        password: this.secret,
        maxReceiveBytes: MAX_RECEIVE_BYTES,
        trickleIce: false,
        rtcPolyfill: LoggedPeerConnection,
        relayConfig: { urls: RELAYS },
      },
      roomId,
      { onJoinError: (details) => this.onJoinError(room, details) },
    );
    this.room = room;
    this.action = room.makeAction('m');
    this.action.onMessage = (data, meta) => room === this.room && this.receive(data, meta && meta.peerId);
    room.onPeerJoin = (peerId) => {
      if (room !== this.room) return;
      log('peer joined, saying hello');
      this.sendTo(peerId, this.helloMessage());
    };
    room.onPeerLeave = (peerId) => {
      if (room !== this.room || peerId !== this.partnerId) return;
      this.setStatus('away');
    };
  }

  onJoinError(room, details) {
    console.warn('[online] join error', details);
    if (room !== this.room || this.status === 'connected') return;
    // A wrong password means a stranger in the same room; ignore them.
    if (/password/i.test((details && details.error) || '')) return;
    // A connection attempt failed: try again right away rather than waiting for
    // Trystero's next once-a-minute announce. The guest still gives up after
    // GUEST_CONNECT_TIMEOUT_MS.
    this.rejoin();
  }

  async rejoin() {
    if (this.closed || this.rejoining) return;
    this.rejoining = true;
    try {
      const wait = this.lastJoinAt + REJOIN_MIN_GAP_MS - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      if (this.closed || this.status === 'connected') return;
      log('connection attempt failed, rejoining the room');
      await leaveRoom(this.roomId, this.room, 0);
      this.room = this.action = null;
      await this.joinRoom();
    } finally {
      this.rejoining = false;
    }
  }

  helloMessage() {
    return { t: 'hello', v: PROTOCOL_VERSION, role: this.role, token: this.role === 'guest' ? this.token : null };
  }

  setStatus(status, info = {}) {
    if (this.closed) return;
    this.status = status;
    log(`status ${status}`, info.reason || (info.reconnect ? 'reconnect' : ''));
    this.onStatus && this.onStatus(status, info);
  }

  sendTo(peerId, msg) {
    if (!this.action || !peerId) return;
    this.action.send(msg, { target: peerId }).catch(() => {});
  }

  /** Send a game message to the partner. Returns false when there is no live partner. */
  send(msg) {
    if (this.status !== 'connected' || !this.partnerId) return false;
    this.sendTo(this.partnerId, msg);
    return true;
  }

  receive(data, peerId) {
    if (this.closed || !peerId || !isEnvelope(data)) return;

    if (data.t === 'hello') return this.onHello(data, peerId);

    if (data.t === 'welcome') {
      if (this.role !== 'guest' || typeof data.token !== 'string') return;
      if (this.partnerId && peerId !== this.partnerId) return;
      this.partnerId = peerId;
      const reconnect = this.everConnected || this.token === data.token;
      this.token = data.token;
      this.everConnected = true;
      return this.setStatus('connected', { reconnect, token: data.token });
    }

    if (data.t === 'full') {
      if (this.role === 'guest' && !this.everConnected) this.setStatus('error', { reason: 'full' });
      return;
    }

    if (peerId !== this.partnerId || this.status !== 'connected') return;
    if (data.t === 'bye') return this.setStatus('away', { left: true });
    this.onMessage && this.onMessage(data);
  }

  onHello(msg, peerId) {
    if (msg.v !== PROTOCOL_VERSION) {
      this.setStatus('error', { reason: 'version' });
      return;
    }
    if (this.role === 'host') {
      if (msg.role !== 'guest') return;
      const partnerLive = this.partnerId && this.status === 'connected' && peerId !== this.partnerId;
      const isReturningGuest = this.token && msg.token === this.token;
      if (partnerLive || (this.everConnected && !isReturningGuest)) {
        this.sendTo(peerId, { t: 'full' });
        return;
      }
      const reconnect = this.everConnected;
      if (!this.token) this.token = createToken();
      this.partnerId = peerId;
      this.everConnected = true;
      this.sendTo(peerId, { t: 'welcome', token: this.token });
      this.setStatus('connected', { reconnect });
    } else {
      if (msg.role !== 'host') return;
      // Answer the host so it learns about us even if it joined the room first.
      if (this.partnerId !== peerId) this.sendTo(peerId, this.helloMessage());
      this.partnerId = peerId;
    }
  }

  async measurePing() {
    if (this.status !== 'connected' || !this.room || !this.partnerId) return;
    try {
      this.rtt = Math.round(await this.room.ping(this.partnerId));
    } catch {
      /* peer gone; onPeerLeave reports it */
    }
  }

  close() {
    if (this.closed) return;
    try {
      if (this.status === 'connected') this.sendTo(this.partnerId, { t: 'bye' });
    } catch {
      /* ignore */
    }
    this.closed = true;
    this.timers.forEach((id) => {
      clearTimeout(id);
      clearInterval(id);
    });
    // Give a bye a moment to leave before the channel closes.
    leaveRoom(this.roomId, this.room, this.status === 'connected' ? BYE_GRACE_MS : 0);
  }
}

function leaveRoom(roomId, room, delayMs) {
  if (!room) return Promise.resolve();
  const done = (async () => {
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    try {
      await room.leave();
    } catch {
      /* already gone */
    }
  })();
  const entry = done.finally(() => {
    if (leaving.get(roomId) === entry) leaving.delete(roomId);
  });
  leaving.set(roomId, entry);
  return entry;
}
