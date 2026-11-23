// Players whose device clocks disagree must still find each other through the relays.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { measureClockOffset } from '../../shared/online/server-time.js';
import { CLOCK_SKEW_SECONDS, patchNostrStrategy } from '../../scripts/vendor.mjs';

const answer = (date) => async () => ({ headers: new Map([['Date', date]].filter(([, v]) => v)) });

test('the clock offset comes from the Date header, mid round trip', async () => {
  const times = [1_000_000, 1_000_200]; // sent, received
  const offset = await measureClockOffset({
    url: 'https://example.test/',
    now: () => times.shift(),
    fetch: answer(new Date(5_000_000).toUTCString()),
  });
  // server second 5_000_000 (+500 ms into it) minus the round trip's midpoint
  assert.equal(offset, 5_000_000 + 500 - 1_000_100);
});

test('no usable answer keeps the device clock', async () => {
  const url = 'https://example.test/';
  assert.equal(await measureClockOffset({ url, fetch: answer(null) }), null);
  assert.equal(await measureClockOffset({ url, fetch: answer('not a date') }), null);
  assert.equal(
    await measureClockOffset({
      url,
      fetch: async () => {
        throw new Error('offline');
      },
    }),
    null,
  );
  assert.equal(await measureClockOffset({ url: '', fetch: answer('x') }), null);
});

test("Trystero's Nostr clock and subscription window are patched", () => {
  const source = readFileSync('node_modules/@trystero-p2p/nostr/dist/index.mjs', 'utf8');
  const patched = patchNostrStrategy(source);
  assert.match(patched, /^import \{ clockOffsetMs \} from 'trystero-clock';/);
  assert.ok(patched.includes('Math.floor((Date.now() + clockOffsetMs()) / 1e3)'));
  assert.ok(patched.includes(`const since = now() - ${CLOCK_SKEW_SECONDS};`));
  assert.ok(!patched.includes('Math.floor(Date.now() / 1e3)'));
  assert.throws(() => patchNostrStrategy('const now = () => 0;'), /after a Trystero upgrade/);
});

test('the committed vendor bundle carries the patch', () => {
  const bundle = readFileSync('shared/vendor/trystero-nostr.mjs', 'utf8');
  assert.match(bundle, /setClockOffsetMs/);
  assert.match(bundle, new RegExp(`\\(\\)-${CLOCK_SKEW_SECONDS}[;,]`));
  assert.ok(!bundle.includes('Math.floor(Date.now()/1e3)'), 'no unpatched clock left');
});
