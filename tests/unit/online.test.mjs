import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createInvite,
  createToken,
  inviteUrl,
  isEnvelope,
  parseInvite,
  roomFor,
  MAX_MESSAGE_BYTES,
} from '../../shared/online/protocol.js';
import { cleanChatText, MAX_CHAT_LENGTH } from '../../shared/online/chat.js';
import { qrModules, qrSvg } from '../../shared/online/qr.js';

test('an invite is 22 url-safe characters and round-trips through the link', () => {
  const invite = createInvite();
  assert.match(invite.secret, /^[A-Za-z0-9_-]{22}$/);
  const url = inviteUrl('https://user.github.io/repo/games/stan-and-lisa/?x=1#old', invite);
  assert.equal(url, `https://user.github.io/repo/games/stan-and-lisa/#g=${invite.secret}`);
  assert.deepEqual(parseInvite(new URL(url).hash), invite);
  assert.notEqual(createInvite().secret, invite.secret);
  assert.match(createToken(), /^[A-Za-z0-9_-]{22}$/);
});

test('parseInvite accepts only the exact format', () => {
  for (const bad of ['', '#', '#g=', '#g=short', '#g=' + 'a'.repeat(23), '#x=' + 'a'.repeat(22), '#g=' + 'a'.repeat(21) + '!']) {
    assert.equal(parseInvite(bad), null, bad);
  }
});

test('both players derive the same room, which reveals nothing about the secret', async () => {
  const { secret } = createInvite();
  const a = await roomFor('stan-and-lisa', secret);
  assert.equal(a, await roomFor('stan-and-lisa', secret));
  assert.notEqual(a, await roomFor('another-game', secret));
  assert.ok(!a.includes(secret));
  assert.match(a, /^[A-Za-z0-9_-]{22}$/);
});

test('isEnvelope rejects anything but small tagged objects', () => {
  assert.ok(isEnvelope({ t: 'hello' }));
  for (const bad of [null, 1, 'x', [], {}, { t: 1 }, { t: '' }, { t: 'x'.repeat(17) }]) assert.ok(!isEnvelope(bad), JSON.stringify(bad));
  assert.ok(!isEnvelope({ t: 'big', data: 'x'.repeat(MAX_MESSAGE_BYTES) }));
});

test('chat text is trimmed, stripped of control characters and limited', () => {
  assert.equal(cleanChatText('  hi  '), 'hi');
  assert.equal(cleanChatText('a\u0000b\nc'), 'a b c');
  assert.equal(cleanChatText(42), '');
  assert.equal(cleanChatText('   '), '');
  const long = '😀'.repeat(MAX_CHAT_LENGTH + 10);
  assert.equal([...cleanChatText(long)].length, MAX_CHAT_LENGTH, 'counts characters, not UTF-16 units');
});

test('the QR code is square and rendered locally as one SVG path', () => {
  const url = 'https://user.github.io/repo/games/stan-and-lisa/#g=' + 'a'.repeat(22);
  const grid = qrModules(url);
  assert.ok(grid.length >= 21 && grid.every((row) => row.length === grid.length));
  const svg = qrSvg(url);
  assert.match(svg, /^<svg [^>]*viewBox="0 0 \d+ \d+"/);
  assert.equal((svg.match(/<path /g) || []).length, 1);
});
