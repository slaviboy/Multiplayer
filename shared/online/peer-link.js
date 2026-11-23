// Two-player WebRTC link over Trystero (Nostr relays for signalling only).
//
// Roles: the *host* created the invite and waits; the *guest* opened the link.
// Handshake (both directions, sent to each peer that appears in the room):
//   hello {v, role, token?}  →  host answers the first guest with welcome {token}
// The token identifies the guest for the rest of the session: a guest that
// reconnects (reload, network blip) presents it and gets its seat back; anyone
// else who somehow has the link gets `full` and is ignored.
import { joinRoom } from '../vendor/trystero-nostr.mjs';
import { PROTOCOL_VERSION, createToken, isEnvelope, roomFor } from './protocol.js';

const GUEST_CONNECT_TIMEOUT_MS = 45_000;
const PING_EVERY_MS = 2_000;
const MAX_RECEIVE_BYTES = 64 * 1024;

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
    this.action = null;
    this.everConnected = false;
    this.timers = [];
    this.closed = false;
  }

  async start() {
    const roomId = await roomFor(this.appId, this.secret);
    if (this.closed) return;
    this.room = joinRoom(
      { appId: this.appId, password: this.secret, maxReceiveBytes: MAX_RECEIVE_BYTES },
      roomId,
      {
        onJoinError: (details) => {
          console.warn('[online] join error', details);
          if (this.status !== 'connected') this.setStatus('error', { reason: 'network' });
        },
      },
    );
    this.action = this.room.makeAction('m');
    this.action.onMessage = (data, meta) => this.receive(data, meta && meta.peerId);
    this.room.onPeerJoin = (peerId) => this.sendTo(peerId, this.helloMessage());
    this.room.onPeerLeave = (peerId) => {
      if (peerId !== this.partnerId) return;
      this.setStatus('away');
    };

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

  helloMessage() {
    return { t: 'hello', v: PROTOCOL_VERSION, role: this.role, token: this.role === 'guest' ? this.token : null };
  }

  setStatus(status, info = {}) {
    if (this.closed) return;
    this.status = status;
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
    const room = this.room;
    // Give the bye a moment to leave before the channel closes.
    setTimeout(() => room && room.leave(), 250);
  }
}
