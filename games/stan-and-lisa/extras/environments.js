// Outdoor environments for Stan & Lisa levels, drawn from outside the compiled
// bundle (see extras.js). A level picks one with the map property
// `environment` (levels-src: `properties: { environment: 'snow' }`):
//
//   snow    snowfall over snow-capped ground under a pale sky
//   rain    grey sky, rain with splashes, wet dark ground
//   storm   a dark level (like darkness: 'dark') with rain, lightning that lights
//           everything for a moment, and thunder
//   spring  green grass with flowers, blossom petals drifting by
//   summer  warm sky with a sun, sandy ground, dry grass, pollen in the air
//   winter  a clear winter night: stars, moon, aurora, icy ground with icicles
//   lake    a lakeside: green shore, far hills, reeds by the water, dragonflies
//
// Everything here is decoration: the physics, liquids and devices are the
// level's own, so an environment never changes how a level plays (except that a
// storm is dark). Each browser draws its own weather, so online players don't
// need to share it.

const TILE = 32;
const PAD = 32; // the ground bitmap has a 32px border around the level

// Ground tile types in the bundle's Ground.json tileset.
const ROCK = 0;
const ICE = 10;
const FLOOR_SLOPES = new Set([1, 2]);
const LIQUIDS = new Set([5, 6, 7, 55]);

export const ENVIRONMENTS = {
  snow: {
    sky: ['#8ea2b6', '#dde6ee'],
    clouds: { count: 9, color: 'rgba(240,244,248,0.85)', heavy: true },
    hills: ['#c8d4de', '#e9eff4'],
    earth: { base: '#8f9eae', blobs: ['#a7b5c3', '#7d8b9a', '#c9d5e0'], stones: '#6f7c8a', patches: '#eef4fa' },
    cap: 'snow',
    weather: { type: 'snow', density: 1.3, wind: 18 },
  },
  rain: {
    sky: ['#465260', '#8a96a2'],
    clouds: { count: 10, color: 'rgba(70,80,92,0.9)', heavy: true },
    hills: ['#5c6a72', '#77858c'],
    earth: { base: '#54473b', blobs: ['#4a3e33', '#625244', '#3f352c'], stones: '#6d6a66', wet: true },
    cap: 'grass',
    grass: ['#3f6e3a', '#55894a'],
    weather: { type: 'rain', density: 1.6, wind: 60 },
    splashes: true,
  },
  storm: {
    dark: true,
    sky: ['#0d1018', '#283041'],
    clouds: { count: 10, color: 'rgba(30,36,48,0.95)', heavy: true },
    hills: ['#1c232e', '#262f3c'],
    earth: { base: '#4a4038', blobs: ['#3f362f', '#584c42', '#362e28'], stones: '#5f5d5a', wet: true },
    cap: 'grass',
    grass: ['#2f5530', '#3e6a3a'],
    weather: { type: 'rain', density: 2, wind: 120 },
    splashes: true,
    lightning: true,
  },
  spring: {
    sky: ['#79c3ee', '#dff3ff'],
    clouds: { count: 6, color: 'rgba(255,255,255,0.95)' },
    hills: ['#7cc46a', '#9ad67f'],
    trees: '#5e9f4e',
    earth: { base: '#86613f', blobs: ['#7a5636', '#94704c', '#6e4c2f'], stones: '#a49c92' },
    cap: 'grass',
    grass: ['#5fb043', '#7dcc55'],
    flowers: ['#ffd1e8', '#fff07a', '#ffffff', '#c9a6ff'],
    weather: { type: 'petals', density: 0.35, wind: 30 },
  },
  summer: {
    sky: ['#2f97e4', '#ffe7a6'],
    sun: true,
    clouds: { count: 3, color: 'rgba(255,255,255,0.9)' },
    hills: ['#e2b35e', '#f0cd82'],
    earth: { base: '#d8b475', blobs: ['#e4c48a', '#c9a265', '#efd6a2'], stones: '#b89462', strata: '#c49a5c' },
    cap: 'grass',
    grass: ['#b5a24a', '#d1bd5e'],
    weather: { type: 'pollen', density: 0.25, wind: 10 },
  },
  winter: {
    sky: ['#081530', '#2a4b72'],
    stars: true,
    moon: true,
    aurora: true,
    hills: ['#9fb8d3', '#c5d8ea'],
    earth: { base: '#6f86a3', blobs: ['#8099b5', '#5f7592', '#a9c0d8'], stones: '#58708d', patches: '#dcecfb' },
    cap: 'snow',
    icicles: true,
    weather: { type: 'snow', density: 0.35, wind: 8 },
  },
  lake: {
    sky: ['#62b1e4', '#d2efff'],
    clouds: { count: 5, color: 'rgba(255,255,255,0.92)' },
    hills: ['#6f9f72', '#8fbe85'],
    trees: '#4f8452',
    earth: { base: '#7b5e42', blobs: ['#6f533a', '#8a6c4f', '#5f4733'], stones: '#9a958c' },
    cap: 'grass',
    grass: ['#4d9a45', '#68b552'],
    reeds: true,
    weather: { type: 'dragonflies', density: 0.06, wind: 0 },
  },
};

// ---------------------------------------------------------------- helpers

const rand = (a, b) => a + Math.random() * (b - a);

/** A small deterministic random, so a level's decoration looks the same every time. */
function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

function tileType(map, col, row) {
  const data = map.layers[0].data;
  const t = data[row] && data[row][col];
  if (!t || t.index < 0 || !t.properties || t.properties.type === undefined) return null;
  return Number(t.properties.type);
}

const isFlatSolid = (t) => t === ROCK || t === ICE;
const isOpen = (t) => t === null || t === -1;

/** Tops of flat ground with open space above, merged into runs: {col, row, len}. */
function surfaces(map) {
  const runs = [];
  for (let row = 1; row < map.height; row++) {
    let run = null;
    for (let col = 0; col <= map.width; col++) {
      const top = col < map.width && isFlatSolid(tileType(map, col, row)) && isOpen(tileType(map, col, row - 1));
      if (top) {
        if (run) run.len++;
        else run = { col, row, len: 1 };
      } else if (run) {
        runs.push(run);
        run = null;
      }
    }
  }
  return runs;
}

/** Floor slopes with open space above: {col, row, dir} (dir 1 = rises to the right). */
function slopes(map) {
  const out = [];
  for (let row = 1; row < map.height; row++) {
    for (let col = 0; col < map.width; col++) {
      const t = tileType(map, col, row);
      if (FLOOR_SLOPES.has(t) && isOpen(tileType(map, col, row - 1))) out.push({ col, row, dir: t === 1 ? 1 : -1 });
    }
  }
  return out;
}

/** Undersides of flat ground with open space below: {col, row}. */
function ceilings(map) {
  const out = [];
  for (let row = 0; row < map.height - 1; row++) {
    for (let col = 0; col < map.width; col++) {
      if (isFlatSolid(tileType(map, col, row)) && isOpen(tileType(map, col, row + 1))) out.push({ col, row });
    }
  }
  return out;
}

/** Ground cells right next to a liquid's surface, for reeds: {x, y} in level px. */
function shores(map) {
  const out = [];
  for (let row = 1; row < map.height; row++) {
    for (let col = 0; col < map.width; col++) {
      if (!LIQUIDS.has(tileType(map, col, row))) continue;
      for (const side of [-1, 1]) {
        const c = col + side;
        if (isFlatSolid(tileType(map, c, row)) && isOpen(tileType(map, c, row - 1))) {
          out.push({ x: (side < 0 ? c + 1 : c) * TILE, y: row * TILE });
        }
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- ground

function paintCaps(ctx, map, env, rnd) {
  const runs = surfaces(map);
  if (env.cap === 'snow') {
    for (const r of runs) {
      const x0 = r.col * TILE + PAD - 2;
      const x1 = (r.col + r.len) * TILE + PAD + 2;
      const y = r.row * TILE + PAD;
      ctx.fillStyle = '#f7fbff';
      ctx.beginPath();
      ctx.moveTo(x0, y + 4);
      // a soft lumpy top, then a wavy underside
      for (let x = x0; x <= x1; x += 8) ctx.quadraticCurveTo(x + 4, y - 4 - rnd() * 3, Math.min(x + 8, x1), y - 1);
      for (let x = x1; x >= x0; x -= 6) ctx.lineTo(x, y + 6 + rnd() * 5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(180,205,235,0.55)';
      ctx.fillRect(x0 + 2, y + 5, x1 - x0 - 4, 2);
    }
    for (const s of slopes(map)) {
      const x = s.col * TILE + PAD;
      const y = s.row * TILE + PAD;
      ctx.strokeStyle = '#f7fbff';
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.beginPath();
      if (s.dir > 0) {
        ctx.moveTo(x + 2, y + TILE - 2);
        ctx.lineTo(x + TILE - 1, y + 2);
      } else {
        ctx.moveTo(x + 1, y + 2);
        ctx.lineTo(x + TILE - 2, y + TILE - 2);
      }
      ctx.stroke();
    }
    return;
  }
  if (env.cap === 'grass') {
    const [dark, light] = env.grass;
    for (const r of runs) {
      const x0 = r.col * TILE + PAD;
      const x1 = (r.col + r.len) * TILE + PAD;
      const y = r.row * TILE + PAD;
      ctx.fillStyle = dark;
      ctx.fillRect(x0, y, x1 - x0, 7);
      ctx.fillStyle = light;
      ctx.fillRect(x0, y, x1 - x0, 3);
      // blades
      for (let x = x0 + 2; x < x1 - 1; x += 3 + rnd() * 3) {
        const h = 4 + rnd() * 6;
        ctx.fillStyle = rnd() < 0.5 ? dark : light;
        ctx.beginPath();
        ctx.moveTo(x - 1.6, y + 2);
        ctx.lineTo(x + (rnd() - 0.5) * 3, y - h);
        ctx.lineTo(x + 1.6, y + 2);
        ctx.closePath();
        ctx.fill();
      }
      if (env.flowers) {
        for (let x = x0 + 6; x < x1 - 4; x += 10 + rnd() * 26) {
          if (rnd() < 0.45) continue;
          const c = env.flowers[Math.floor(rnd() * env.flowers.length)];
          const fy = y - 3 - rnd() * 4;
          ctx.fillStyle = c;
          for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2;
            ctx.beginPath();
            ctx.arc(x + Math.cos(a) * 2.2, fy + Math.sin(a) * 2.2, 1.8, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = '#f4b400';
          ctx.beginPath();
          ctx.arc(x, fy, 1.3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    for (const s of slopes(map)) {
      const x = s.col * TILE + PAD;
      const y = s.row * TILE + PAD;
      ctx.strokeStyle = dark;
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      if (s.dir > 0) {
        ctx.moveTo(x + 2, y + TILE - 2);
        ctx.lineTo(x + TILE - 1, y + 2);
      } else {
        ctx.moveTo(x + 1, y + 2);
        ctx.lineTo(x + TILE - 2, y + TILE - 2);
      }
      ctx.stroke();
    }
  }
}

function paintIcicles(ctx, map, rnd) {
  for (const c of ceilings(map)) {
    if (rnd() < 0.45) continue;
    const x = c.col * TILE + PAD;
    const y = (c.row + 1) * TILE + PAD;
    for (let i = 0; i < 2; i++) {
      if (rnd() < 0.3) continue;
      const ix = x + 6 + i * 14 + rnd() * 6;
      const len = 6 + rnd() * 14;
      const g = ctx.createLinearGradient(ix, y, ix, y + len);
      g.addColorStop(0, 'rgba(235,248,255,0.95)');
      g.addColorStop(1, 'rgba(170,215,250,0.6)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(ix - 3, y - 1);
      ctx.lineTo(ix + 3, y - 1);
      ctx.lineTo(ix, y + len);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function paintReeds(ctx, map, rnd) {
  for (const s of shores(map)) {
    for (let i = 0; i < 4; i++) {
      const x = s.x + PAD + (rnd() - 0.5) * 18;
      const h = 16 + rnd() * 18;
      ctx.strokeStyle = rnd() < 0.5 ? '#3f7a3a' : '#5c9a48';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, s.y + PAD + 2);
      ctx.quadraticCurveTo(x + (rnd() - 0.5) * 8, s.y + PAD - h / 2, x + (rnd() - 0.5) * 6, s.y + PAD - h);
      ctx.stroke();
      if (rnd() < 0.5) {
        ctx.fillStyle = '#6b4325';
        ctx.fillRect(x - 2, s.y + PAD - h * 0.8, 4, 9);
      }
    }
  }
}

function paintEarth(ctx, w, h, earth, rnd) {
  ctx.fillStyle = earth.base;
  ctx.fillRect(0, 0, w, h);
  if (earth.strata) {
    ctx.strokeStyle = earth.strata;
    ctx.lineWidth = 3;
    for (let y = 10; y < h; y += 14 + rnd() * 18) {
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= w; x += 40) ctx.lineTo(x, y + Math.sin(x / 90 + y) * 4);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  const n = (w * h) / 1100;
  // soft patches of slightly different earth
  for (let i = 0; i < n; i++) {
    ctx.globalAlpha = 0.16 + rnd() * 0.22;
    ctx.fillStyle = earth.blobs[Math.floor(rnd() * earth.blobs.length)];
    ctx.beginPath();
    ctx.ellipse(rnd() * w, rnd() * h, 14 + rnd() * 26, 8 + rnd() * 12, (rnd() - 0.5) * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // pebbles and stones with a dark rim
  for (let i = 0; i < n / 7; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const rx = 3 + rnd() * 7;
    const ry = 2 + rnd() * 5;
    ctx.fillStyle = earth.stones;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rnd() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.ellipse(x - rx * 0.3, y - ry * 0.35, rx * 0.4, ry * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (earth.patches) {
    for (let i = 0; i < n / 10; i++) {
      ctx.globalAlpha = 0.35 + rnd() * 0.35;
      ctx.fillStyle = earth.patches;
      ctx.beginPath();
      ctx.ellipse(rnd() * w, rnd() * h, 5 + rnd() * 14, 2 + rnd() * 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  if (earth.wet) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(120,150,180,0.12)');
    g.addColorStop(1, 'rgba(20,30,40,0.18)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
}

/** Paints the ground bitmap with the environment's earth and decoration. */
export function decorateGround(ground, env) {
  const bmd = ground.bmd;
  const mask = ground.maskBmd;
  if (!bmd || !mask) return;
  const ctx = bmd.ctx;
  const w = bmd.width;
  const h = bmd.height;
  const map = ground.mapData;
  const rnd = seeded(map.width * 131 + map.height * 7 + 1);
  ctx.save();
  // natural rock or soil instead of the temple's bricks, inside the ground's shape
  ctx.globalCompositeOperation = 'source-atop';
  paintEarth(ctx, w, h, env.earth, rnd);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(mask.canvas, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  paintCaps(ctx, map, env, rnd);
  if (env.icicles) paintIcicles(ctx, map, rnd);
  if (env.reeds) paintReeds(ctx, map, rnd);
  ctx.restore();
  bmd.dirty = true;
}

// ---------------------------------------------------------------- sky

function hillLine(ctx, w, base, amp, color, rnd, step = 40) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, base + amp);
  const phase = rnd() * 10;
  for (let x = 0; x <= w + step; x += step) {
    const y = base - amp * (0.5 + 0.5 * Math.sin(x / 170 + phase) * Math.cos(x / 97 + phase * 0.7));
    ctx.lineTo(x, y);
  }
  ctx.lineTo(w, 1e5);
  ctx.lineTo(0, 1e5);
  ctx.closePath();
  ctx.fill();
}

function cloud(ctx, x, y, s, color) {
  ctx.fillStyle = color;
  for (const [dx, dy, r] of [
    [0, 0, 26],
    [24, -10, 22],
    [48, 0, 24],
    [22, 8, 24],
    [-22, 6, 18],
    [68, 8, 16],
  ]) {
    ctx.beginPath();
    ctx.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** A sky picture for a level of this size, at half resolution (show it scaled 2x). */
export function paintSky(game, width, height, env) {
  const bmd = game.make.bitmapData(Math.ceil(width / 2), Math.ceil(height / 2));
  const ctx = bmd.ctx;
  ctx.scale(0.5, 0.5); // draw in level pixels
  const rnd = seeded(width * 3 + height);
  const g = ctx.createLinearGradient(0, 0, 0, height);
  g.addColorStop(0, env.sky[0]);
  g.addColorStop(1, env.sky[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);

  if (env.stars) {
    for (let i = 0; i < (width * height) / 2500; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.35 + rnd() * 0.65})`;
      const r = rnd() < 0.08 ? 1.6 : 0.9;
      ctx.beginPath();
      ctx.arc(rnd() * width, rnd() * height * 0.75, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (env.aurora) {
    ctx.globalCompositeOperation = 'lighter';
    for (let band = 0; band < 3; band++) {
      const y0 = height * (0.12 + band * 0.08);
      const grad = ctx.createLinearGradient(0, y0 - 60, 0, y0 + 60);
      grad.addColorStop(0, 'rgba(60,255,170,0)');
      grad.addColorStop(0.5, `rgba(${band === 1 ? '90,200,255' : '60,255,170'},0.22)`);
      grad.addColorStop(1, 'rgba(60,255,170,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(0, y0);
      const ph = rnd() * 6;
      for (let x = 0; x <= width; x += 20) ctx.lineTo(x, y0 + Math.sin(x / 120 + ph) * 26 - 50);
      for (let x = width; x >= 0; x -= 20) ctx.lineTo(x, y0 + Math.sin(x / 120 + ph) * 26 + 50);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  if (env.moon) {
    const mx = width * 0.82;
    const my = height * 0.16;
    const glow = ctx.createRadialGradient(mx, my, 10, mx, my, 90);
    glow.addColorStop(0, 'rgba(255,255,230,0.5)');
    glow.addColorStop(1, 'rgba(255,255,230,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(mx - 90, my - 90, 180, 180);
    ctx.fillStyle = '#fbf6dc';
    ctx.beginPath();
    ctx.arc(mx, my, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(200,195,170,0.45)';
    for (const [dx, dy, r] of [
      [-8, -6, 6],
      [9, 4, 4],
      [-2, 11, 3],
    ]) {
      ctx.beginPath();
      ctx.arc(mx + dx, my + dy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (env.sun) {
    const sx = width * 0.8;
    const sy = height * 0.18;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.fillStyle = 'rgba(255,240,160,0.35)';
    for (let i = 0; i < 12; i++) {
      ctx.rotate(Math.PI / 6);
      ctx.beginPath();
      ctx.moveTo(-10, 0);
      ctx.lineTo(10, 0);
      ctx.lineTo(0, 170);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    const glow = ctx.createRadialGradient(sx, sy, 20, sx, sy, 120);
    glow.addColorStop(0, 'rgba(255,250,200,0.9)');
    glow.addColorStop(1, 'rgba(255,240,170,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sx - 120, sy - 120, 240, 240);
    ctx.fillStyle = '#fff3a0';
    ctx.beginPath();
    ctx.arc(sx, sy, 36, 0, Math.PI * 2);
    ctx.fill();
  }
  if (env.clouds) {
    const { count, color, heavy } = env.clouds;
    for (let i = 0; i < count; i++) {
      const s = heavy ? rand(1.2, 2) : rand(0.7, 1.2);
      cloud(ctx, rnd() * width, (heavy ? 0.04 : 0.08) * height + rnd() * height * (heavy ? 0.18 : 0.3), s, color);
    }
  }
  if (env.hills) {
    hillLine(ctx, width, height * 0.62, 90, env.hills[0], rnd, 30);
    if (env.trees) {
      ctx.fillStyle = env.trees;
      for (let x = rnd() * 60; x < width; x += 40 + rnd() * 90) {
        const y = height * 0.7 + rnd() * 30;
        const r = 14 + rnd() * 14;
        ctx.fillRect(x - 2, y, 4, 26);
        ctx.beginPath();
        ctx.arc(x, y - r * 0.5, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    hillLine(ctx, width, height * 0.78, 60, env.hills[1], rnd, 30);
  }
  bmd.dirty = true;
  return bmd;
}

// ---------------------------------------------------------------- weather

function particleTexture(game, type) {
  const key = `ext_weather_${type}`;
  if (game.cache.checkBitmapDataKey && game.cache.checkBitmapDataKey(key)) return game.cache.getBitmapData(key);
  let bmd;
  if (type === 'snow') {
    bmd = game.make.bitmapData(12, 12);
    const g = bmd.ctx.createRadialGradient(6, 6, 0, 6, 6, 6);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    bmd.ctx.fillStyle = g;
    bmd.ctx.fillRect(0, 0, 12, 12);
  } else if (type === 'rain') {
    bmd = game.make.bitmapData(3, 22);
    const g = bmd.ctx.createLinearGradient(0, 0, 0, 22);
    g.addColorStop(0, 'rgba(200,225,255,0)');
    g.addColorStop(1, 'rgba(210,232,255,0.85)');
    bmd.ctx.fillStyle = g;
    bmd.ctx.fillRect(0, 0, 3, 22);
  } else if (type === 'splash') {
    bmd = game.make.bitmapData(16, 8);
    bmd.ctx.strokeStyle = 'rgba(215,235,255,0.9)';
    bmd.ctx.lineWidth = 1.5;
    bmd.ctx.beginPath();
    bmd.ctx.ellipse(8, 5, 6.5, 2.2, 0, Math.PI, 0);
    bmd.ctx.stroke();
  } else if (type === 'petals') {
    bmd = game.make.bitmapData(10, 7);
    bmd.ctx.fillStyle = '#ffc4dd';
    bmd.ctx.beginPath();
    bmd.ctx.ellipse(5, 3.5, 4.5, 2.6, 0, 0, Math.PI * 2);
    bmd.ctx.fill();
    bmd.ctx.fillStyle = '#ffe3ef';
    bmd.ctx.beginPath();
    bmd.ctx.ellipse(4, 3, 2, 1.1, 0, 0, Math.PI * 2);
    bmd.ctx.fill();
  } else if (type === 'pollen') {
    bmd = game.make.bitmapData(8, 8);
    const g = bmd.ctx.createRadialGradient(4, 4, 0, 4, 4, 4);
    g.addColorStop(0, 'rgba(255,245,170,1)');
    g.addColorStop(1, 'rgba(255,230,120,0)');
    bmd.ctx.fillStyle = g;
    bmd.ctx.fillRect(0, 0, 8, 8);
  } else if (type === 'dragonflies') {
    bmd = game.make.bitmapData(22, 10);
    const c = bmd.ctx;
    c.fillStyle = 'rgba(215,240,255,0.75)';
    for (const [x, y] of [
      [7, 3],
      [15, 3],
      [7, 7],
      [15, 7],
    ]) {
      c.beginPath();
      c.ellipse(x, y, 4, 1.8, 0, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = '#2f7fa8';
    c.fillRect(2, 4, 18, 2);
    c.fillStyle = '#1d5878';
    c.beginPath();
    c.arc(20, 5, 1.8, 0, Math.PI * 2);
    c.fill();
  }
  if (game.cache.addBitmapData) game.cache.addBitmapData(key, bmd);
  return bmd;
}

class Weather {
  constructor(level, env) {
    const game = level.game;
    this.level = level;
    this.env = env;
    this.type = env.weather.type;
    this.wind = env.weather.wind || 0;
    this.w = level.size.width;
    this.h = level.size.height;
    this.group = game.make.group(0, 0);
    // which cells are solid ground, so nothing shows inside the rock
    const raw = game.cache.getTilemapData('map').data;
    const layer = raw.layers.find((l) => l.type === 'tilelayer');
    this.cols = layer.width;
    this.rows = layer.height;
    this.solid = layer.data.map((g) => g >= 1 && g <= 5 || g === 14); // rock, slopes, ice
    const n = Math.round(((this.w * this.h) / 10000) * env.weather.density);
    const tex = particleTexture(game, this.type);
    this.parts = [];
    for (let i = 0; i < n; i++) {
      const img = game.make.image(0, 0, tex);
      img.anchor.set(0.5);
      this.group.add(img);
      const p = { img };
      this.reset(p, true);
      this.parts.push(p);
    }
    this.splashes = [];
    if (env.splashes) {
      this.floor = [];
      for (const r of surfacesFromRaw(raw)) for (let i = 0; i < r.len; i++) this.floor.push({ x: (r.col + i) * TILE, y: r.row * TILE });
      const stex = particleTexture(game, 'splash');
      for (let i = 0; i < Math.min(40, this.floor.length); i++) {
        const img = game.make.image(0, 0, stex);
        img.anchor.set(0.5, 1);
        img.alpha = 0;
        this.group.add(img);
        this.splashes.push({ img, t: Math.random() });
      }
    }
    // under the darkness (so a storm hides it until lightning), above everything else
    const root = level.root;
    const dark = level.darkness;
    if (dark && dark.parent === root) root.addChildAt(this.group, root.getChildIndex(dark));
    else root.addChild(this.group);
  }

  reset(p, anywhere) {
    const t = this.type;
    p.x = rand(0, this.w);
    p.y = anywhere ? rand(0, this.h) : rand(-30, 0);
    p.phase = rand(0, Math.PI * 2);
    if (t === 'snow') {
      p.vy = rand(28, 70);
      p.s = rand(0.35, 1);
      p.img.alpha = rand(0.55, 1);
    } else if (t === 'rain') {
      p.vy = rand(520, 760);
      p.s = rand(0.7, 1.1);
      p.img.alpha = rand(0.35, 0.8);
    } else if (t === 'petals') {
      p.vy = rand(22, 45);
      p.s = rand(0.7, 1.2);
      p.spin = rand(-3, 3);
    } else if (t === 'pollen') {
      p.vy = rand(-6, 10);
      p.s = rand(0.5, 1.1);
      p.img.alpha = rand(0.4, 0.9);
    } else if (t === 'dragonflies') {
      p.y = rand(this.h * 0.2, this.h * 0.85);
      p.vx = rand(40, 90) * (Math.random() < 0.5 ? -1 : 1);
      p.vy = 0;
      p.s = 1;
    }
    p.img.scale.set(p.s);
  }

  /** Inside the level and not inside solid ground. */
  inAir(x, y) {
    if (x < 2 || y < 2 || x > this.w - 2 || y > this.h - 2) return false;
    return !this.solid[Math.floor(y / TILE) * this.cols + Math.floor(x / TILE)];
  }

  update(dt) {
    const time = this.level.game.time.now / 1000;
    for (const p of this.parts) {
      const t = this.type;
      if (t === 'snow') {
        p.x += (this.wind + Math.sin(time * 1.3 + p.phase) * 20) * p.s * dt;
        p.y += p.vy * p.s * dt;
      } else if (t === 'rain') {
        p.x += this.wind * dt;
        p.y += p.vy * dt;
        p.img.rotation = -Math.atan2(this.wind, p.vy);
      } else if (t === 'petals') {
        p.x += (this.wind + Math.sin(time * 1.7 + p.phase) * 30) * dt;
        p.y += p.vy * dt;
        p.img.rotation += p.spin * dt;
      } else if (t === 'pollen') {
        p.x += (this.wind + Math.sin(time * 0.7 + p.phase) * 12) * dt;
        p.y += (p.vy + Math.cos(time * 0.9 + p.phase) * 8) * dt;
        if (p.y < -10) p.y = this.h + 5;
      } else if (t === 'dragonflies') {
        p.x += p.vx * dt * (0.6 + 0.4 * Math.sin(time * 2 + p.phase));
        p.y += Math.sin(time * 3 + p.phase) * 30 * dt;
        p.img.scale.x = p.vx < 0 ? -1 : 1;
        if (Math.random() < 0.004) p.vx = -p.vx;
        if (p.x < -40 || p.x > this.w + 40) p.vx = -p.vx;
      }
      if (t !== 'dragonflies') {
        // wind carries them across: come back in on the other side
        if (p.x > this.w) p.x -= this.w;
        else if (p.x < 0) p.x += this.w;
      }
      if (p.y > this.h + 10 || p.x < -40 || p.x > this.w + 40) {
        if (t !== 'dragonflies') this.reset(p, false);
      }
      p.img.x = p.x;
      p.img.y = p.y;
      p.img.visible = this.inAir(p.x, p.y);
    }
    for (const s of this.splashes) {
      s.t += dt * 2.4;
      if (s.t >= 1) {
        s.t = 0;
        const f = this.floor[Math.floor(Math.random() * this.floor.length)];
        s.img.x = f.x + rand(4, TILE - 4);
        s.img.y = f.y + 1;
      }
      s.img.alpha = s.t < 0.15 ? s.t / 0.15 : Math.max(0, 1 - s.t);
      s.img.scale.set(0.6 + s.t * 0.8, 1);
    }
  }

  destroy() {
    this.group.destroy(true);
  }
}

/** surfaces() for the raw Tiled data in the cache (numbers instead of Tile objects). */
function surfacesFromRaw(raw) {
  const layer = raw.layers.find((l) => l.type === 'tilelayer');
  const w = layer.width;
  const h = layer.height;
  // gids from scripts/build-levels.mjs: rock 1, ice 14, back wall 11, empty 0
  const solid = (c, r) => {
    const g = layer.data[r * w + c];
    return g === 1 || g === 14;
  };
  const open = (c, r) => {
    const g = layer.data[r * w + c];
    return g === 0 || g === 11;
  };
  const runs = [];
  for (let r = 1; r < h; r++) {
    let run = null;
    for (let c = 0; c <= w; c++) {
      const top = c < w && solid(c, r) && open(c, r - 1);
      if (top) {
        if (run) run.len++;
        else run = { col: c, row: r, len: 1 };
      } else if (run) {
        runs.push(run);
        run = null;
      }
    }
  }
  return runs;
}

// ---------------------------------------------------------------- lightning and thunder

class Lightning {
  constructor(level) {
    this.level = level;
    this.next = rand(2.5, 5);
    this.flash = 0;
    this.gfx = level.game.make.graphics(0, 0);
    const root = level.root;
    const dark = level.darkness;
    // the bolt shows above the darkness
    root.addChild(this.gfx);
    if (dark) this.darkAlpha = dark.alpha;
  }

  strike() {
    const { width, height } = this.level.size;
    const g = this.gfx;
    g.clear();
    let x = rand(width * 0.1, width * 0.9);
    let y = 0;
    const end = rand(height * 0.4, height * 0.75);
    const pts = [[x, y]];
    while (y < end) {
      y += rand(18, 42);
      x += rand(-30, 30);
      pts.push([x, y]);
    }
    for (const [w, c, a] of [
      [9, 0x9fc7ff, 0.35],
      [3, 0xffffff, 1],
    ]) {
      g.lineStyle(w, c, a);
      g.moveTo(pts[0][0], pts[0][1]);
      for (const [px, py] of pts.slice(1)) g.lineTo(px, py);
    }
    // a branch
    const k = Math.floor(pts.length / 2);
    g.lineStyle(2, 0xffffff, 0.8);
    g.moveTo(pts[k][0], pts[k][1]);
    g.lineTo(pts[k][0] + rand(-70, 70), pts[k][1] + rand(40, 90));
    g.alpha = 1;
    this.flash = 1;
    this.flicker = Math.random() < 0.6;
    thunder(this.level.game, rand(0.25, 1.1));
  }

  update(dt) {
    this.next -= dt;
    if (this.next <= 0) {
      this.strike();
      this.next = rand(4, 9);
    }
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 1.6);
      // a quick second flicker, like real lightning
      let f = this.flash;
      if (this.flicker && f < 0.75 && f > 0.6) f *= 0.35;
      if (this.level.darkness) this.level.darkness.alpha = 1 - 0.92 * Math.min(1, f * 1.4);
      this.gfx.alpha = Math.min(1, f * 1.5);
    } else if (this.level.darkness && this.level.darkness.alpha !== 1) {
      this.level.darkness.alpha = 1;
    }
  }

  destroy() {
    this.gfx.destroy();
  }
}

/** A rumble made from filtered noise, so no sound file is needed. */
function thunder(game, delay) {
  try {
    if (!game.settings || !game.settings.fx || game.sound.mute) return;
    const ctx = game.sound.context;
    if (!ctx || ctx.state !== 'running') return;
    const len = 3.2;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * len), ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; // brown noise
      d[i] = last * 3.5;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 380;
    const gain = ctx.createGain();
    const t0 = ctx.currentTime + delay;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(0.9, t0 + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.9);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + len);
    src.connect(lp);
    lp.connect(gain);
    gain.connect(ctx.destination);
    src.start(t0);
    src.stop(t0 + len);
  } catch {
    /* no audio */
  }
}

// ---------------------------------------------------------------- wiring

function wrap(proto, name, fn) {
  const orig = proto[name];
  proto[name] = function (...args) {
    return fn.call(this, orig, args);
  };
}

/** The environment chosen by the level being built, or null. */
function envOf(level) {
  const name = level && level._ext && level._ext.environment;
  return (name && ENVIRONMENTS[name]) || null;
}

export function patchEnvironments(req) {
  const Ground = req('States/Level/Ground').prototype;
  const Level = req('States/Level/Level').prototype;

  wrap(Ground, 'convertTilemap', function (orig, args) {
    const result = orig.apply(this, args);
    const env = envOf(this.game.level);
    if (env) decorateGround(this, env);
    return result;
  });

  // the temple's moss, cracks and dead branches don't belong outdoors
  wrap(Ground, 'decorate', function (orig, args) {
    if (envOf(this.game.level)) return undefined;
    return orig.apply(this, args);
  });

  wrap(Ground, 'applyFilter', function (orig, args) {
    const result = orig.apply(this, args);
    const env = envOf(this.game.level);
    if (env) {
      const layer = this.game.layers.background;
      const sky = this.game.make.image(0, 0, paintSky(this.game, this.options.width, this.options.height, env));
      sky.scale.set(2);
      // replaces the temple's back wall
      layer.children.forEach((c) => (c.visible = false));
      layer.addChild(sky);
    }
    return result;
  });

  // a storm is dark: borrow the engine's darkness the same way darkness: 'dark' does
  wrap(Level, 'setupLayers', function (orig, args) {
    const result = orig.apply(this, args);
    const env = envOf(this);
    if (env && env.dark && this._ext && !this._ext.darkness) this._ext.darkness = 'dark';
    return result;
  });

  // The engine redraws its darkness over the whole level every frame. Long dark
  // levels do that at half resolution: a quarter of the pixels to draw and upload.
  wrap(Level, 'setupDarkness', function (orig, args) {
    const result = orig.apply(this, args);
    const env = envOf(this);
    if (env && env.dark && this.darkness && this.darknessBmd) {
      const full = this.darknessBmd;
      const half = this.game.make.bitmapData(Math.ceil(full.width / 2), Math.ceil(full.height / 2));
      half.offset = full.offset;
      half.ctx.scale(0.5, 0.5); // the engine draws in level pixels
      this.darknessBmd = half;
      this.darkness.loadTexture(half);
      this.darkness.scale.set(2);
      full.destroy();
    }
    return result;
  });
  // the engine's per-frame callback still holds the old bitmap: draw into the current one
  wrap(Level, 'updateDarkness', function (orig, args) {
    return orig.apply(this, this.darknessBmd ? [this.darknessBmd] : args);
  });

  wrap(Level, 'update', function (orig, args) {
    if (this.loadCompleted && !this._olKilled) {
      const env = envOf(this);
      if (env && !this._env && this.root && this.size) {
        this._env = {
          weather: env.weather ? new Weather(this, env) : null,
          lightning: env.lightning ? new Lightning(this) : null,
        };
      }
      if (this._env) {
        const dt = Math.min(0.05, this.game.time.elapsed / 1000);
        if (this._env.weather) this._env.weather.update(dt);
        if (this._env.lightning) this._env.lightning.update(dt);
      }
    }
    return orig.apply(this, args);
  });

  wrap(Level, 'shutdown', function (orig, args) {
    try {
      return orig.apply(this, args);
    } finally {
      if (this._env) {
        if (this._env.weather) this._env.weather.destroy();
        if (this._env.lightning) this._env.lightning.destroy();
      }
      this._env = null;
    }
  });
}
