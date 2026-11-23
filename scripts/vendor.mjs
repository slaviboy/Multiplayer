// Builds the browser-ready third-party files in shared/vendor/ from node_modules.
// The output is committed, so the site itself needs no build step.
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = 'shared/vendor';

const version = (name) => JSON.parse(readFileSync(`node_modules/${name}/package.json`, 'utf8')).version;

// Lets two devices whose clocks disagree find each other through the Nostr relays.
//
// Trystero's Nostr strategy stamps its signals with this device's clock and
// subscribes with `since: now()` from the same clock. Relays drop live events
// stamped before a subscription's `since`, and some refuse events stamped far
// from their own time. So when the host's clock ran 30 s behind the guest's, the
// guest didn't hear the host until the host's clock had caught up: a 30 s+ wait
// on "Joining your friend", or no connection at all for a clock that is hours off.
//
// The strategy's clock becomes this device's clock plus an offset the page learns
// from the site's server (shared/online/server-time.js), so both players stamp
// and filter by the same time. Its subscriptions also reach back
// CLOCK_SKEW_SECONDS in case the server could not be asked; Trystero's
// signalling kinds (20000-29999) are ephemeral, so relays keep nothing to replay.
export const CLOCK_SKEW_SECONDS = 600;
const NOSTR_STRATEGY = /[\\/]@trystero-p2p[\\/]nostr[\\/]dist[\\/]index\.mjs$/;
const CLOCK_MODULE = 'trystero-clock';
const SITES = [
  ['const now = () => Math.floor(Date.now() / 1e3);', 'const now = () => Math.floor((Date.now() + clockOffsetMs()) / 1e3);'],
  ['since: now()', `since: now() - ${CLOCK_SKEW_SECONDS}`],
  ['const since = now();', `const since = now() - ${CLOCK_SKEW_SECONDS};`],
];

/** Rewrites the strategy as above; throws if its code doesn't look as expected. */
export function patchNostrStrategy(code) {
  let patched = code;
  for (const [from, to] of SITES) {
    const count = patched.split(from).length - 1;
    if (count !== 1) {
      throw new Error(
        `vendor: expected "${from}" once in Trystero's Nostr strategy, found ${count}. ` +
          'Check its clock and subscription window after a Trystero upgrade.',
      );
    }
    patched = patched.replace(from, to);
  }
  return `import { clockOffsetMs } from '${CLOCK_MODULE}';\n${patched}`;
}

const clockSkewPlugin = {
  name: 'trystero-clock-skew',
  setup(b) {
    b.onResolve({ filter: new RegExp(`^${CLOCK_MODULE}$`) }, () => ({ path: CLOCK_MODULE, namespace: CLOCK_MODULE }));
    b.onLoad({ filter: /.*/, namespace: CLOCK_MODULE }, () => ({
      contents:
        'let offset = 0;\n' +
        'export const clockOffsetMs = () => offset;\n' +
        'export const setClockOffsetMs = (ms) => { offset = Number.isFinite(ms) ? ms : 0; };\n',
      loader: 'js',
    }));
    b.onLoad({ filter: NOSTR_STRATEGY }, (args) => ({
      contents: patchNostrStrategy(readFileSync(args.path, 'utf8')),
      loader: 'js',
      resolveDir: args.path.replace(/[\\/][^\\/]+$/, ''),
    }));
  },
};

// Run as `npm run vendor`; tests import patchNostrStrategy without building.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  mkdirSync(out, { recursive: true });
  await build({
    stdin: {
      contents: `export { joinRoom, selfId } from 'trystero/nostr';\nexport { setClockOffsetMs } from '${CLOCK_MODULE}';`,
      resolveDir: '.',
      loader: 'js',
    },
    bundle: true,
    format: 'esm',
    minify: true,
    target: 'es2020',
    platform: 'browser',
    legalComments: 'inline',
    plugins: [clockSkewPlugin],
    banner: {
      js: `/* trystero ${version('trystero')} (nostr strategy, clock-skew patch: see scripts/vendor.mjs), MIT License, https://github.com/dmotz/trystero */`,
    },
    outfile: `${out}/trystero-nostr.mjs`,
  });

  copyFileSync('node_modules/qrcode-generator/dist/qrcode.mjs', `${out}/qrcode.mjs`);

  console.log(`vendored trystero ${version('trystero')} and qrcode-generator ${version('qrcode-generator')} into ${out}/`);
}
