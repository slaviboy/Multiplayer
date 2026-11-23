// Invite links and message framing shared by every online game in this repo.
//
// An invite is a 16-byte random secret. It travels only in the URL *hash*
// (`#g=<secret>`), so browsers never send it to the web server. Both players
// derive the same Trystero room id from it with SHA-256, and the secret itself
// is the Trystero `password`, so relays see neither the secret nor the
// WebRTC offers.

export const PROTOCOL_VERSION = 1;
export const MAX_MESSAGE_BYTES = 16 * 1024;

const SECRET_BYTES = 16;
const SECRET_LENGTH = 22; // base64url length of 16 bytes, no padding
const INVITE_RE = /^#g=([A-Za-z0-9_-]{22})$/;

export function toBase64Url(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomId(bytes = SECRET_BYTES) {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return toBase64Url(buf);
}

/** A fresh invite: `{ secret }`. */
export function createInvite() {
  return { secret: randomId(SECRET_BYTES) };
}

/** A per-session identity token; lets the same guest reconnect, keeps third parties out. */
export function createToken() {
  return randomId(16);
}

/** Room id both players derive from the secret. Reveals nothing about the secret. */
export async function roomFor(appId, secret) {
  const data = new TextEncoder().encode(`${appId} room:${secret}`);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  return toBase64Url(digest.slice(0, 16));
}

/** The link the host shares: current page without query/hash, plus `#g=<secret>`. */
export function inviteUrl(pageHref, invite) {
  const url = new URL(pageHref);
  return `${url.origin}${url.pathname}#g=${invite.secret}`;
}

/** Parses `location.hash`; returns `{ secret }` or null. Accepts only the exact format. */
export function parseInvite(hash) {
  const m = INVITE_RE.exec(hash || '');
  return m && m[1].length === SECRET_LENGTH ? { secret: m[1] } : null;
}

/**
 * First-line validation for anything that arrives from the other browser:
 * must be a plain object with a short string `t`, and small when serialised.
 * Games validate the fields of each message type on top of this.
 */
export function isEnvelope(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  if (typeof value.t !== 'string' || value.t.length === 0 || value.t.length > 16) return false;
  let size;
  try {
    size = JSON.stringify(value).length;
  } catch {
    return false;
  }
  return size <= MAX_MESSAGE_BYTES;
}

export const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);
export const isInt = (v) => Number.isInteger(v);
export const isBool = (v) => typeof v === 'boolean';
export const isShortString = (v, max = 64) => typeof v === 'string' && v.length <= max;
