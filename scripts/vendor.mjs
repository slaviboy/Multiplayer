// Builds the browser-ready third-party files in shared/vendor/ from node_modules.
// The output is committed, so the site itself needs no build step.
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';

const out = 'shared/vendor';
mkdirSync(out, { recursive: true });

const version = (name) => JSON.parse(readFileSync(`node_modules/${name}/package.json`, 'utf8')).version;

await build({
  stdin: { contents: "export { joinRoom, selfId } from 'trystero/nostr';", resolveDir: '.', loader: 'js' },
  bundle: true,
  format: 'esm',
  minify: true,
  target: 'es2020',
  platform: 'browser',
  legalComments: 'inline',
  banner: { js: `/* trystero ${version('trystero')} (nostr strategy), MIT License, https://github.com/dmotz/trystero */` },
  outfile: `${out}/trystero-nostr.mjs`,
});

copyFileSync('node_modules/qrcode-generator/dist/qrcode.mjs', `${out}/qrcode.mjs`);

console.log(`vendored trystero ${version('trystero')} and qrcode-generator ${version('qrcode-generator')} into ${out}/`);
