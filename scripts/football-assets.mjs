// Builds games/football/assets/ from the art and sounds extracted from the
// original GoalHeads.io build (AssetRipper output, kept out of git in reference/).
//   node scripts/football-assets.mjs [source dir]
// Images are resized and re-encoded as WebP in Google Chrome (via playwright-core),
// and js/catalog.js lists every head, jersey and pair of boots. Each head gets the
// neck colour closest to its skin, sampled from the middle of the face.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { chromium } from 'playwright-core';

const SRC = process.argv[2] || 'reference/football-goalheads/Assets';
const OUT = 'games/football/assets';
const CATALOG = 'games/football/js/catalog.js';

if (!existsSync(SRC)) {
  console.error(`football-assets: ${SRC} not found (extract the original build with AssetRipper first)`);
  process.exit(1);
}

const slug = (name) =>
  name
    .replace(/^(Head|Jersey|Spikes|Neck)_/, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+$/, '')
    .toLowerCase();
const title = (name) =>
  name
    .replace(/^(Head|Jersey|Spikes|Neck)_/, '')
    .replace(/[_\s]+/g, ' ')
    .trim();
const pngs = (dir) =>
  readdirSync(join(SRC, dir))
    .filter((f) => f.endsWith('.png'))
    .sort();

// [source, output, max width (px) or null to keep the size]
const images = [];
const add = (src, out, width = null) => images.push({ src: join(SRC, src), out: join(OUT, out), width });

const heads = pngs('Sprites/Character/Characters').map((f) => ({ file: f, id: slug(basename(f, '.png')), name: title(basename(f, '.png')) }));
const jerseys = pngs('Sprites/Character/Jerseys').map((f) => ({ file: f, id: slug(basename(f, '.png')), name: title(basename(f, '.png')) }));
const boots = pngs('Sprites/Character/Spikes').map((f) => ({ file: f, id: slug(basename(f, '.png')), name: title(basename(f, '.png')) }));

// heads are 326x344 at 100 px per unit and drawn ~1.5 units wide: 220 px is plenty
for (const h of heads) add(`Sprites/Character/Characters/${h.file}`, `heads/${h.id}.webp`, 220);
for (const j of jerseys) add(`Sprites/Character/Jerseys/${j.file}`, `jerseys/${j.id}.webp`);
for (const b of boots) add(`Sprites/Character/Spikes/${b.file}`, `boots/${b.id}.webp`);
add('Sprites/Character/Necks/Neck_Dark.png', 'necks/dark.webp');
add('Sprites/Character/Necks/Neck_Soft.png', 'necks/soft.webp');
add('Sprites/Shadow/Elips.png', 'sprites/shadow.webp');
const T = 'Texture2D';
for (const [src, out, w] of [
  ['ball1.png', 'sprites/ball.webp'],
  ['Golden_Ball.png', 'sprites/golden-ball.webp'],
  ['Goalpost_Back2.png', 'sprites/goal-back.webp'],
  ['Goalpost_Front2.png', 'sprites/goal-front.webp'],
  ['SpriteSheet_DustEffect.png', 'sprites/dust.webp'],
  ['Game_Logo.png', 'ui/logo.webp'],
  ['Gooal.png', 'ui/goal.webp', 800],
  ['Match_Starts.png', 'ui/match-starts.webp', 560],
  ['Final_Whistle.png', 'ui/final-whistle.webp', 560],
  ['Icon_Vs.png', 'ui/vs.webp'],
  ['Character_Podium.png', 'ui/podium.webp', 400],
  ['Match_Tile.png', 'ui/stripes.webp'],
  ['Icon_Jump.png', 'ui/icon-jump.webp'],
  ['Icon_BallShot.png', 'ui/icon-shot.webp'],
  ['Icon_ArrowTUp.png', 'ui/icon-up.webp'],
  ['Icon_ArrowRSide.png', 'ui/icon-right.webp'],
  ['Icon_Home.png', 'ui/icon-home.webp'],
  ['Icon_Chat.png', 'ui/icon-chat.webp'],
  ['Icon_SfxActive.png', 'ui/icon-sound.webp'],
  ['Icon_MusicActive.png', 'ui/icon-music.webp'],
  ['Icon_Whistle.png', 'ui/icon-whistle.webp'],
  ['Icon_Joystick.png', 'ui/icon-joystick.webp'],
  ['Icon_PartyCharacter.png', 'ui/icon-friends.webp'],
  ['Referee_Whistle.png', 'ui/referee.webp', 260],
]) {
  add(`${T}/${src}`, out, w);
}

const stadiums = [
  ['Stad_Bg1.jpg', 'sunset'],
  ['Stad_Bg2.jpg', 'favela-day'],
  ['Stad_Bg3.jpg', 'favela-night'],
];

const sounds = {
  'Musics/Menu_Music2.m4a': 'menu-music',
  'Sfx/Start_Whistle.m4a': 'whistle-start',
  'Sfx/Finish_Whistle.m4a': 'whistle-end',
  'Sfx/Finish_WhistleWithReferee2.m4a': 'whistle-final',
  'Sfx/3-2.m4a': 'count-32',
  'Sfx/1.m4a': 'count-1',
  'Sfx/BallGoal1.m4a': 'goal-1',
  'Sfx/BallGoal2.m4a': 'goal-2',
  'Sfx/BallGoal3.m4a': 'goal-3',
  'Sfx/Celebration_Me1.m4a': 'cheer-1',
  'Sfx/Celebration_Me2.m4a': 'cheer-2',
  'Sfx/Celebration_Opponent1.m4a': 'boo-1',
  'Sfx/Shooting1.m4a': 'shot-1',
  'Sfx/Shooting3.m4a': 'shot-2',
  'Sfx/Shooting6.m4a': 'shot-3',
  'Sfx/Shooting7.m4a': 'shot-4',
  'Sfx/Touch1.m4a': 'touch-1',
  'Sfx/Touch2.m4a': 'touch-2',
  'Sfx/Touch3.m4a': 'touch-3',
  'Sfx/Touch5.m4a': 'touch-4',
  'Sfx/Ball_Tab1.m4a': 'bounce-1',
  'Sfx/Ball_Tab2.m4a': 'bounce-2',
  'Sfx/Ball_Tab3.m4a': 'bounce-3',
  'Sfx/Goalpost1.m4a': 'post-1',
  'Sfx/Goalpost2.m4a': 'post-2',
  'Sfx/Goalpost3.m4a': 'post-3',
  'Sfx/Jump1.m4a': 'jump-1',
  'Sfx/Jump3.m4a': 'jump-2',
  'Sfx/Hit1.m4a': 'hit-1',
  'Sfx/Hit2.m4a': 'hit-2',
  'Sfx/Button_Click.m4a': 'click',
  'Sfx/Button_Cancel.m4a': 'cancel',
  'Sfx/Opponent_Matched.m4a': 'matched',
  'Sfx/Finish_MatchGameOver.m4a': 'game-over',
  'Sfx/Level_Up.m4a': 'win',
};

for (const dir of ['heads', 'jerseys', 'boots', 'necks', 'sprites', 'ui', 'stadiums', 'sounds']) {
  rmSync(join(OUT, dir), { recursive: true, force: true });
  mkdirSync(join(OUT, dir), { recursive: true });
}

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome' });
const page = await browser.newPage();
await page.setContent('<canvas></canvas>');

/** Resizes and encodes one image in the browser; returns WebP bytes (and the face tone for heads). */
async function convert(file, width, { tone = false, type = 'image/webp', quality = 0.9 } = {}) {
  const mime = file.endsWith('.jpg') ? 'image/jpeg' : 'image/png';
  const dataUrl = `data:${mime};base64,${readFileSync(file).toString('base64')}`;
  const res = await page.evaluate(
    async ({ dataUrl, width, tone, type, quality }) => {
      const img = new Image();
      img.src = dataUrl;
      await img.decode();
      const w = width && img.naturalWidth > width ? width : img.naturalWidth;
      const h = Math.round((img.naturalHeight * w) / img.naturalWidth);
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, 0, 0, w, h);
      let luma = null;
      if (tone) {
        // cheeks and nose: the middle of the face, a little below the centre
        const d = g.getImageData(Math.round(w * 0.42), Math.round(h * 0.5), Math.round(w * 0.22), Math.round(h * 0.18)).data;
        let sum = 0;
        let n = 0;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] < 200) continue;
          const y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          if (y < 40) continue; // outlines
          sum += y;
          n++;
        }
        luma = n ? sum / n : null;
      }
      const url = c.toDataURL(type, quality);
      return { b64: url.slice(url.indexOf(',') + 1), luma, w, h };
    },
    { dataUrl, width, tone, type, quality },
  );
  return { bytes: Buffer.from(res.b64, 'base64'), luma: res.luma, w: res.w, h: res.h };
}

let total = 0;
const lumaOf = new Map();
for (const img of images) {
  const isHead = /[\\/]heads[\\/]/.test(img.out);
  const { bytes, luma } = await convert(img.src, img.width, { tone: isHead });
  writeFileSync(img.out, bytes);
  total += bytes.length;
  if (isHead) lumaOf.set(basename(img.out, '.webp'), luma);
}
for (const [src, id] of stadiums) {
  const { bytes } = await convert(join(SRC, 'Sprites/Stads', src), null, { type: 'image/jpeg', quality: 0.86 });
  writeFileSync(join(OUT, 'stadiums', `${id}.jpg`), bytes);
  total += bytes.length;
}
await browser.close();

for (const [src, id] of Object.entries(sounds)) {
  const from = join(SRC, 'AudioFiles', src);
  copyFileSync(from, join(OUT, 'sounds', `${id}.m4a`));
  total += readFileSync(from).length;
}

// Neck_Soft is a light skin tone, Neck_Dark a dark one; split between them.
// A few faces sit near the split (beards, shadows); these were checked by eye.
const NECK_SPLIT = 150;
const NECK_OVERRIDES = { 'sandro-tonello': 'soft', 'crossbar-arnuldo': 'soft', 'malik-goalmore': 'dark' };
const headList = heads.map((h) => ({
  id: h.id,
  name: h.name,
  neck: NECK_OVERRIDES[h.id] || ((lumaOf.get(h.id) ?? 255) < NECK_SPLIT ? 'dark' : 'soft'),
}));

const js = `// Generated by scripts/football-assets.mjs from the original GoalHeads.io art. Do not edit.
// Every head, jersey and pair of boots in assets/; \`neck\` is the neck sprite matching the skin.

export const HEADS = ${JSON.stringify(headList, null, 1).replace(/\n\s*/g, ' ')};

export const JERSEYS = ${JSON.stringify(jerseys.map(({ id, name }) => ({ id, name })), null, 1).replace(/\n\s*/g, ' ')};

export const BOOTS = ${JSON.stringify(boots.map(({ id, name }) => ({ id, name })), null, 1).replace(/\n\s*/g, ' ')};

export const STADIUMS = ${JSON.stringify(stadiums.map(([, id]) => id))};

export const SOUNDS = ${JSON.stringify(Object.values(sounds))};
`;
writeFileSync(CATALOG, js);
console.log(
  `football-assets: ${images.length + stadiums.length} images, ${Object.keys(sounds).length} sounds, ${(total / 1048576).toFixed(1)} MB; ` +
    `necks: ${headList.filter((h) => h.neck === 'dark').length} dark / ${headList.filter((h) => h.neck === 'soft').length} soft`,
);
console.log(
  [...lumaOf]
    .sort((a, b) => a[1] - b[1])
    .map(([id, l]) => `${id}:${Math.round(l)}`)
    .join(' '),
);
