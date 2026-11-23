// Copies the deployable site into _site/ (what GitHub Pages serves).
// The site has no build step; this only leaves out sources, tooling and junk.
//   node scripts/build-site.mjs
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, sep } from 'node:path';

const OUT = '_site';
const INCLUDE = ['index.html', 'games.json', 'hub', 'shared', 'games'];
const SKIP_DIRS = new Set(['levels-src', 'node_modules', '.git']);
const SKIP_FILE = [/_BACKUP\./, / - Copy\./, /\.md$/];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);
for (const entry of INCLUDE) {
  if (!existsSync(entry)) throw new Error(`missing ${entry}`);
  cpSync(entry, `${OUT}/${entry}`, {
    recursive: true,
    filter: (src) => {
      if (src.split(sep).some((part) => SKIP_DIRS.has(part))) return false;
      return !SKIP_FILE.some((re) => re.test(basename(src)));
    },
  });
}
writeFileSync(`${OUT}/.nojekyll`, ''); // serve folders/files starting with "_" as-is
console.log(`built ${OUT}/ from ${INCLUDE.join(', ')}`);
