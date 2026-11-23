// Renders preview sheets of the character variants (needs Google Chrome):
//   node scripts/preview-characters.mjs            all variants → art-src/previews/
//   node scripts/preview-characters.mjs 3          only variant 3
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { VARIANTS, frameRecipe } from '../games/stan-and-lisa/art-src/characters.mjs';

const ART = 'games/stan-and-lisa/art-src';
const OUT = `${ART}/previews`;

function readAtlas() {
  const buf = readFileSync(`${ART}/CharAssets.orig.json`);
  const text = buf[0] === 0xff && buf[1] === 0xfe ? buf.toString('utf16le') : buf.toString('utf8');
  return JSON.parse(text.replace(/^﻿/, ''));
}

const atlas = readAtlas();
const size = Object.fromEntries(atlas.frames.map((fr) => [fr.filename, fr.sourceSize]));
const count = (prefix) => atlas.frames.filter((fr) => fr.filename.startsWith(prefix)).length;

/** SVG for one atlas frame name in a variant. */
export function frameSVG(variant, name) {
  const r = frameRecipe(name);
  const { w, h } = size[name];
  const n = count(name.replace(/\d{4}$/, ''));
  return r.draw(variant, r.who, r.anim, r.i, n, w, h);
}

// poses shown in the sheet: [label, [frame names drawn on the same anchor], anchor]
const POSES = (who) => {
  const idleN = count(`${who}_head_idle`);
  return [
    ['idle', [`${who}_legs_idle0000`, `${who}_head_idle0000`]],
    ['blink', [`${who}_legs_idle0000`, `${who}_head_idle${String(idleN - 1).padStart(4, '0')}`]],
    ['run', [`${who}_legs_running0001`, `${who}_head_jumping0002`]],
    ['run', [`${who}_legs_running0005`, `${who}_head_jumping0006`]],
    ['jump up', [`${who}_legs_running0002`, `${who}_head_rising0001`]],
    ['fall', [`${who}_legs_idle0000`, `${who}_head_falling0001`]],
    ['into door', [`${who}_stairs0008`], 'bottom'],
  ];
};

async function main() {
  const only = process.argv[2] ? [process.argv[2]] : Object.keys(VARIANTS);
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome' });
  const page = await browser.newPage();
  const scale = 1.7;
  const cellW = 150;
  const rowH = 250;
  const sheets = [];
  for (const v of only) {
    const rows = ['fire', 'water'].map((who) => ({
      who,
      poses: POSES(who).map(([label, names, anchor]) => ({
        label,
        anchor: anchor || 'center',
        frames: names.map((name) => ({ svg: frameSVG(v, name), ...size[name] })),
      })),
    }));
    // a small strip at the real in-game size (sprite scale 0.95)
    const tiny = ['fire', 'water'].map((who) => ({ svg: [frameSVG(v, `${who}_legs_idle0000`), frameSVG(v, `${who}_head_idle0000`)], ...size[`${who}_head_idle0000`] }));
    const png = await page.evaluate(
      async ({ rows, tiny, scale, cellW, rowH, title }) => {
        const load = (svg) =>
          new Promise((res, rej) => {
            const img = new Image();
            img.onload = () => res(img);
            img.onerror = rej;
            img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
          });
        const W = 120 + cellW * 7 + 170;
        const H = 70 + rowH * 2;
        const c = document.createElement('canvas');
        c.width = W;
        c.height = H;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#4a5240';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#ffe27a';
        ctx.font = 'bold 26px system-ui, sans-serif';
        ctx.fillText(title, 20, 40);
        for (const [r, row] of rows.entries()) {
          const cy = 70 + r * rowH + rowH / 2 - 10;
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 18px system-ui, sans-serif';
          ctx.fillText(row.who === 'fire' ? 'Stan' : 'Lisa', 20, cy);
          for (const [k, pose] of row.poses.entries()) {
            const cx = 120 + k * cellW + cellW / 2;
            for (const fr of pose.frames) {
              const img = await load(fr.svg);
              const w = fr.w * scale;
              const h = fr.h * scale;
              const y = pose.anchor === 'bottom' ? cy + 39 * scale - h : cy - h / 2;
              ctx.drawImage(img, cx - w / 2, y, w, h);
            }
            ctx.fillStyle = 'rgba(255,255,255,0.85)';
            ctx.font = '13px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(pose.label, cx, cy + 39 * scale + 22);
            ctx.textAlign = 'left';
          }
        }
        // real size
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.font = '13px system-ui, sans-serif';
        ctx.fillText('in-game size', W - 150, 90);
        for (const [k, t] of tiny.entries()) {
          for (const svg of t.svg) {
            const img = await load(svg);
            ctx.drawImage(img, W - 150 + k * 70, 120, img.width * 0.95, img.height * 0.95);
          }
        }
        return c.toDataURL('image/png');
      },
      { rows, tiny, scale, cellW, rowH, title: `${v}. ${VARIANTS[v].name}` },
    );
    const file = `${OUT}/variant-${v}.png`;
    writeFileSync(file, Buffer.from(png.split(',')[1], 'base64'));
    sheets.push(file);
    console.log('wrote', file);
  }
  await browser.close();
  return sheets;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
