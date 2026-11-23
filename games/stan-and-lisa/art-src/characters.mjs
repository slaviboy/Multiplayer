// New looks for Stan (fire) and Lisa (water): cute, modern chibi characters with
// elemental hair. Every frame is drawn as SVG from (variant, character, animation,
// frame index); scripts/build-characters.mjs renders them into the game's
// CharAssets atlas under the original frame names and sizes, so the engine's
// movement, timing and alignment are unchanged.
//
// Coordinates: the origin is the sprite's anchor (frame centre; bottom centre for
// the door "stairs" animation). The face sits at y ≈ -4, the hair reaches up to
// y ≈ -56, shoulders are at +12, hips at +26 and the feet end at +39, matching
// the original art and the physics body. Running frames face right (the engine
// mirrors them when moving left).

const TAU = Math.PI * 2;
const f = (n) => Math.round(n * 100) / 100;

// ------------------------------------------------------------------ variants

const CLASSIC = {
  fire: {
    outline: '#2b1205', skin: '#ffd8b8', skinShade: '#f2b48f',
    hair: ['#d9301a', '#ff7a1a', '#ffd84d'], hairLine: '#3a0f00', shine: '#ffe99a',
    brow: '#7a2205', iris: '#6b2a0c', top: '#d9402a', topShade: '#a62a18', trim: '#ffb23c',
    pants: '#2f3142', shoe: '#ff8a3d', sole: '#fff4e6', glow: '255,120,40', accent: '#ffd84d',
  },
  water: {
    outline: '#0d2440', skin: '#ffe1c9', skinShade: '#f3c0a1',
    hair: ['#1878d8', '#3aa6f5', '#8fdcff'], hairLine: '#0b2c4d', shine: '#d9f6ff',
    brow: '#1b4f86', iris: '#1f63b5', top: '#4cb8f6', topShade: '#2b8ed2', trim: '#ffffff',
    pants: '#243560', shoe: '#ffffff', sole: '#4cb8f6', glow: '80,190,255', accent: '#e6f8ff',
  },
};

const PASTEL = {
  fire: {
    ...CLASSIC.fire,
    outline: '#5a2a2a', hair: ['#ff6f61', '#ff9a76', '#ffd3a5'], hairLine: '#7a3328', shine: '#fff1d6',
    brow: '#b5523b', iris: '#c0573e', top: '#ff8c7a', topShade: '#e8685a', trim: '#fff1d6',
    pants: '#6b6f9a', shoe: '#ffd3a5', sole: '#ffffff', glow: '255,150,120',
  },
  water: {
    ...CLASSIC.water,
    outline: '#2e3a66', hair: ['#6fa8ff', '#9ad0ff', '#d6c8ff'], hairLine: '#3b4f8a', shine: '#ffffff',
    brow: '#5a6fb5', iris: '#5b7fd6', top: '#a7e3ff', topShade: '#7cc3f0', trim: '#ffffff',
    pants: '#7d86c9', shoe: '#ffffff', sole: '#c7b8ff', glow: '150,190,255', accent: '#f4eaff',
  },
};

/**
 * The five looks offered. Each sets, per character: hair style, outfit, eye size,
 * accessory and palette.
 */
export const VARIANTS = {
  1: {
    name: 'Hoodie & Waves',
    fire: { hair: 'spiky', outfit: 'hoodie', eyes: 'normal', extra: null, palette: CLASSIC.fire },
    water: { hair: 'long', outfit: 'dress', eyes: 'normal', extra: 'clip', palette: CLASSIC.water },
  },
  2: {
    name: 'Sporty',
    fire: { hair: 'short', outfit: 'jersey', eyes: 'normal', extra: 'headband', palette: CLASSIC.fire },
    water: { hair: 'ponytail', outfit: 'sporty', eyes: 'normal', extra: 'scrunchie', palette: CLASSIC.water },
  },
  3: {
    name: 'Street Style',
    fire: { hair: 'swept', outfit: 'jacket', eyes: 'normal', extra: null, palette: CLASSIC.fire },
    water: { hair: 'bob', outfit: 'jacket', eyes: 'normal', extra: 'headband', palette: CLASSIC.water },
  },
  4: {
    name: 'Little Mages',
    fire: { hair: 'spiky', outfit: 'robe', eyes: 'big', extra: 'circlet', palette: CLASSIC.fire },
    water: { hair: 'twintails', outfit: 'robe', eyes: 'big', extra: 'tiara', palette: CLASSIC.water },
  },
  5: {
    name: 'Pastel Cuties',
    fire: { hair: 'swept', outfit: 'hoodie', eyes: 'big', extra: null, palette: PASTEL.fire },
    water: { hair: 'long', outfit: 'dress', eyes: 'big', extra: 'clip', palette: PASTEL.water },
  },
};

const styleOf = (variant, who) => VARIANTS[variant][who];

function defs(st, id) {
  const p = st.palette;
  return `<defs>
  <linearGradient id="${id}h" x1="0" y1="1" x2="0" y2="0">
    <stop offset="0" stop-color="${p.hair[0]}"/><stop offset="0.55" stop-color="${p.hair[1]}"/><stop offset="1" stop-color="${p.hair[2]}"/>
  </linearGradient>
  <radialGradient id="${id}g"><stop offset="0" stop-color="rgba(${p.glow},0.38)"/><stop offset="1" stop-color="rgba(${p.glow},0)"/></radialGradient>
  <linearGradient id="${id}t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.top}"/><stop offset="1" stop-color="${p.topShade}"/></linearGradient>
</defs>`;
}

// ------------------------------------------------------------------ faces

/** Eyes, brows and mouth. `look` shifts the gaze; `expr`: smile | grin | o | wow. */
function face(who, st, { look = 0, blink = false, expr = 'smile' }) {
  const p = st.palette;
  const girl = who === 'water';
  const big = st.eyes === 'big' ? 1.22 : 1;
  const ex = (girl ? 9 : 8.5) * (big > 1 ? 1.04 : 1);
  let s = '';
  for (const side of [-1, 1]) {
    const x = side * ex + look;
    if (blink) {
      s += `<path d="M${f(x - 5)},-3 Q${f(x)},1 ${f(x + 5)},-3" stroke="${p.outline}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
    } else {
      const rx = (girl ? 5.6 : 5.1) * big;
      const ry = (girl ? 6.9 : 6.2) * big;
      const ix = x + look * 0.4 + 0.6;
      s += `<ellipse cx="${f(x)}" cy="-3" rx="${f(rx)}" ry="${f(ry)}" fill="#fff" stroke="${p.outline}" stroke-width="1.8"/>`;
      s += `<circle cx="${f(ix)}" cy="-2.2" r="${f((girl ? 4 : 3.6) * big)}" fill="${p.iris}"/>`;
      s += `<circle cx="${f(ix)}" cy="-2" r="${f((girl ? 2.1 : 1.9) * big)}" fill="#120a06"/>`;
      s += `<circle cx="${f(ix + 1.5 * big)}" cy="${f(-4.4 * big)}" r="${f(1.5 * big)}" fill="#fff"/>`;
      if (girl || big > 1) s += `<circle cx="${f(ix - 0.8)}" cy="${f(0.5 * big)}" r="${f(0.8 * big)}" fill="#fff"/>`;
    }
    if (girl && !blink) {
      const ox = x + side * 4.6 * big;
      const oy = -7.5 * big;
      s += `<path d="M${f(ox)},${f(oy)} l${side * 3},-2.6 M${f(ox - side * 1.2)},${f(oy - 1.7)} l${side * 1.8},-2.8" stroke="${p.outline}" stroke-width="1.6" stroke-linecap="round"/>`;
    }
    const by = -12.4 - (big - 1) * 7;
    if (girl) {
      s += `<path d="M${f(x - 4.5)},${f(by + 0.2)} Q${f(x)},${f(by - 2.2)} ${f(x + 4.5)},${f(by - 0.2)}" stroke="${p.brow}" stroke-width="1.7" fill="none" stroke-linecap="round"/>`;
    } else {
      const inner = side === -1 ? x + 4.5 : x - 4.5;
      const outer = side === -1 ? x - 5 : x + 5;
      s += `<path d="M${f(outer)},${f(by - 0.2)} L${f(inner)},${f(by + 1.2)}" stroke="${p.brow}" stroke-width="3.4" stroke-linecap="round"/>`;
    }
  }
  if (girl || st.palette === PASTEL.fire) {
    s += `<ellipse cx="${f(-13 + look)}" cy="5.5" rx="4" ry="2.4" fill="#ff8fa8" opacity="${girl ? 0.55 : 0.35}"/>`;
    s += `<ellipse cx="${f(13 + look)}" cy="5.5" rx="4" ry="2.4" fill="#ff8fa8" opacity="${girl ? 0.55 : 0.35}"/>`;
  }
  const mx = look * 0.8;
  const my = big > 1 ? 1.5 : 0;
  if (expr === 'o') {
    s += `<ellipse cx="${f(mx)}" cy="${f(10 + my)}" rx="3" ry="3.6" fill="#7a2614" stroke="${p.outline}" stroke-width="1.4"/>`;
  } else if (expr === 'wow') {
    s += `<path d="M${f(mx - 5)},${f(8 + my)} Q${f(mx)},${f(15 + my)} ${f(mx + 5)},${f(8 + my)} Z" fill="#7a2614" stroke="${p.outline}" stroke-width="1.4" stroke-linejoin="round"/>`;
  } else if (expr === 'grin') {
    s += `<path d="M${f(mx - 6)},${f(7.5 + my)} Q${f(mx)},${f(13.5 + my)} ${f(mx + 6)},${f(7.5 + my)} Q${f(mx)},${f(9.5 + my)} ${f(mx - 6)},${f(7.5 + my)} Z" fill="#fff" stroke="${p.outline}" stroke-width="1.6" stroke-linejoin="round"/>`;
  } else {
    s += `<path d="M${f(mx - 4.5)},${f(8 + my)} Q${f(mx)},${f(11.6 + my)} ${f(mx + 4.5)},${f(8 + my)}" stroke="${p.outline}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
  }
  return s;
}

function faceBase(who, st) {
  const p = st.palette;
  const girl = who === 'water';
  const rx = girl ? 22 : 23;
  const ry = girl ? 21 : 22;
  const ear = girl ? 21 : 22.5;
  return `<ellipse cx="${-ear}" cy="-1" rx="3.6" ry="4.6" fill="${p.skin}" stroke="${p.outline}" stroke-width="2"/>
<ellipse cx="${ear}" cy="-1" rx="3.6" ry="4.6" fill="${p.skin}" stroke="${p.outline}" stroke-width="2"/>
<ellipse cx="0" cy="-4" rx="${rx}" ry="${ry}" fill="${p.skin}" stroke="${p.outline}" stroke-width="3"/>
<path d="M${-rx + 4},6 Q0,${ry - 3} ${rx - 4},6" stroke="${p.skinShade}" stroke-width="3" fill="none" opacity="0.6"/>`;
}

// ------------------------------------------------------------------ hair

/** Stan's flame hair. style: spiky | swept | short. wind bends the flames, t animates them. */
function flameHair(st, id, { t, wind, windAmt, stretch }) {
  const p = st.palette;
  const R = 22;
  const style = st.hair;
  const angles = [192, 212, 233, 254, 276, 298, 319, 340];
  let lengths = [12, 19, 25, 29, 28, 24, 17, 10];
  let lean = 0;
  if (style === 'swept') {
    lengths = [7, 11, 18, 26, 31, 29, 23, 12];
    lean = -0.55; // a pompadour swept back to the left
  } else if (style === 'short') {
    lengths = [7, 9, 12, 13, 13, 12, 9, 6];
  }
  let spikes = '';
  let inner = '';
  angles.forEach((a, k) => {
    const rad = (a * Math.PI) / 180;
    const nx = Math.cos(rad);
    const ny = Math.sin(rad);
    const flick = 1 + 0.13 * Math.sin(TAU * t + k * 1.7) + 0.06 * Math.sin(TAU * 2 * t + k);
    const L = lengths[k] * stretch * flick;
    let dx = nx * (1 - windAmt) + (wind[0] + lean) * windAmt + lean * 0.35;
    let dy = ny * (1 - windAmt) + wind[1] * windAmt;
    const m = Math.hypot(dx, dy) || 1;
    dx /= m;
    dy /= m;
    const half = 0.3;
    const b1 = [Math.cos(rad - half) * (R + 1), Math.sin(rad - half) * (R + 1) - 5];
    const b2 = [Math.cos(rad + half) * (R + 1), Math.sin(rad + half) * (R + 1) - 5];
    const tip = [nx * R + dx * L, ny * R - 5 + dy * L];
    const curl = 4 * Math.sin(TAU * t + k);
    const c1 = [(b1[0] + tip[0]) / 2 - dy * curl, (b1[1] + tip[1]) / 2 + dx * curl];
    const c2 = [(b2[0] + tip[0]) / 2 + dy * 3, (b2[1] + tip[1]) / 2 - dx * 3];
    spikes += `M${f(b1[0])},${f(b1[1])} Q${f(c1[0])},${f(c1[1])} ${f(tip[0])},${f(tip[1])} Q${f(c2[0])},${f(c2[1])} ${f(b2[0])},${f(b2[1])} Z `;
    // a lighter tongue inside each flame
    const i1 = [Math.cos(rad - 0.13) * (R - 1), Math.sin(rad - 0.13) * (R - 1) - 5];
    const i2 = [Math.cos(rad + 0.13) * (R - 1), Math.sin(rad + 0.13) * (R - 1) - 5];
    const itip = [nx * R + dx * L * 0.58, ny * R - 5 + dy * L * 0.58];
    inner += `M${f(i1[0])},${f(i1[1])} Q${f((i1[0] + itip[0]) / 2 - dy * curl * 0.5)},${f((i1[1] + itip[1]) / 2 + dx * curl * 0.5)} ${f(itip[0])},${f(itip[1])} Q${f((i2[0] + itip[0]) / 2)},${f((i2[1] + itip[1]) / 2)} ${f(i2[0])},${f(i2[1])} Z `;
  });
  const bangs =
    style === 'swept'
      ? 'L20,-12 L10,-12 L2,-15 L-8,-13 L-16,-11 L-23,-2 Z'
      : 'L19,-11 L13,-7 L8,-14 L2,-8 L-4,-14 L-10,-7 L-16,-12 L-23,-2 Z';
  const cap = `M-23,-2 C-26,-30 -12,-34 0,-34 C12,-34 26,-30 23,-6 ` + bangs;
  return `<path d="${spikes}" fill="url(#${id}h)" stroke="${p.hairLine}" stroke-width="2.2" stroke-linejoin="round"/>
<path d="${inner}" fill="${p.hair[2]}" opacity="0.9"/>
<path d="${cap}" fill="url(#${id}h)" stroke="${p.hairLine}" stroke-width="2.6" stroke-linejoin="round"/>
<path d="M-12,-26 Q-4,-31 6,-29" stroke="${p.shine}" stroke-width="2.4" fill="none" stroke-linecap="round" opacity="0.8"/>`;
}

/** Hair behind Lisa's face. style: long | ponytail | twintails | bob. end = where the hair ends. */
function waterHairBack(st, id, { t, end }) {
  const p = st.palette;
  const style = st.hair;
  const [ex, eyRaw] = end;
  const sway = 2.5 * Math.sin(TAU * t);
  if (style === 'ponytail' || style === 'twintails') {
    // a short layer behind the head, plus tails
    let tails = '';
    const tail = (sx, sy, dir) => {
      const floating = eyRaw < 0;
      const tx = sx + dir * (floating ? 17 : 8) + ex * 0.9 + sway;
      const ty = floating ? 3 : Math.min(eyRaw, 24) + (style === 'twintails' ? 0 : 4);
      const w = style === 'twintails' ? 6 : 7;
      return `M${sx},${sy} C${f(sx + dir * 14 + ex * 0.4)},${f(sy + 4)} ${f(tx + dir * 6)},${f((sy + ty) / 2)} ${f(tx)},${f(ty)} C${f(tx - dir * w)},${f(ty - 6)} ${f(sx + dir * 4)},${f(sy + 10)} ${f(sx - dir * 2)},${f(sy + 6)} Z`;
    };
    if (style === 'ponytail') tails = tail(14, -28, 1);
    else tails = tail(-20, -18, -1) + ' ' + tail(20, -18, 1);
    const back = 'M0,-31 C-22,-33 -30,-18 -28,0 C-20,6 20,6 28,0 C30,-18 22,-33 0,-31 Z';
    return `<path d="${tails}" fill="url(#${id}h)" stroke="${p.hairLine}" stroke-width="2.4" stroke-linejoin="round"/>
<path d="${back}" fill="url(#${id}h)" stroke="${p.hairLine}" stroke-width="2.6" stroke-linejoin="round"/>`;
  }
  const ey = eyRaw < 0 ? (style === 'bob' ? 3 : 7) : style === 'bob' ? Math.min(eyRaw, 9) : eyRaw;
  const lx = -27 + ex + sway;
  const rx = 27 + ex + sway;
  const y = ey;
  const wave = (x0, x1) =>
    style === 'bob'
      ? `Q${f((x0 + x1) / 2)},${f(y + 3)} ${f(x1)},${f(y)}`
      : `Q${f((x0 * 3 + x1) / 4)},${f(y + 6)} ${f((x0 + x1) / 2)},${f(y)} Q${f((x0 + 3 * x1) / 4)},${f(y + 6)} ${f(x1)},${f(y)}`;
  const d =
    `M0,-31 C-22,-33 -30,-18 -29,-2 ` +
    `C${f(-30 + ex * 0.3)},${f(8 + (y - 20) * 0.4)} ${f(lx - 2)},${f(y - 8)} ${f(lx)},${f(y)} ` +
    `${wave(lx, (lx + rx) / 2)} ${wave((lx + rx) / 2, rx)} ` +
    `C${f(rx + 2)},${f(y - 8)} ${f(30 + ex * 0.3)},${f(8 + (y - 20) * 0.4)} 29,-2 C30,-18 22,-33 0,-31 Z`;
  const strands =
    `M-15,-25 Q${f(-26 + ex * 0.4)},-6 ${f(lx + 4)},${f(y - 3)} M15,-25 Q${f(26 + ex * 0.4)},-6 ${f(rx - 4)},${f(y - 3)}` +
    (eyRaw < 0 ? ` M${f(lx + 2)},${f(y - 2)} q-4,-10 0,-16 M${f(rx - 2)},${f(y - 2)} q4,-10 0,-16` : '');
  return `<path d="${d}" fill="url(#${id}h)" stroke="${p.hairLine}" stroke-width="2.4" stroke-linejoin="round"/>
<path d="${strands}" stroke="${p.hairLine}" stroke-width="1.4" fill="none" opacity="0.45" stroke-linecap="round"/>`;
}

function waterHairFront(st, id, { t, lock }) {
  const p = st.palette;
  const style = st.hair;
  const s = 1.5 * Math.sin(TAU * t + 1);
  const [lx, ly] = lock;
  const cap =
    style === 'bob'
      ? 'M-24,-2 C-27,-24 -14,-34 0,-34 C15,-34 27,-24 24,-2 C22,-9 20,-12 16,-14 L-16,-14 C-20,-12 -22,-9 -24,-2 Z'
      : 'M-24,-2 C-27,-24 -14,-34 0,-34 C15,-34 27,-24 24,-3 C20,-10 14,-14 8,-15 C4,-11 -4,-9 -10,-12 C-14,-9 -19,-7 -24,-2 Z';
  const longLocks = style === 'long' || style === 'twintails';
  const locks = longLocks
    ? `M-22,-6 C${f(-25 + lx)},${f(4 + ly)} ${f(-24 + lx + s)},${f(12 + ly)} ${f(-19 + lx + s)},${f(17 + ly)} C-20,10 -19,2 -16,-6 Z ` +
      `M22,-7 C${f(25 + lx)},${f(3 + ly)} ${f(24 + lx - s)},${f(11 + ly)} ${f(19 + lx - s)},${f(16 + ly)} C20,9 19,1 16,-7 Z`
    : `M-22,-6 C-24,0 -23,5 -19,8 C-19,3 -18,-2 -16,-6 Z M22,-7 C24,-1 23,4 19,7 C19,2 18,-3 16,-7 Z`;
  let extra = '';
  if (st.extra === 'clip') {
    const petals = [0, 72, 144, 216, 288]
      .map((a) => `<circle cx="${f(18 + Math.cos((a * Math.PI) / 180) * 3.2)}" cy="${f(-17 + Math.sin((a * Math.PI) / 180) * 3.2)}" r="2.6" fill="#ffffff" stroke="${p.outline}" stroke-width="1.1"/>`)
      .join('');
    extra = petals + `<circle cx="18" cy="-17" r="1.9" fill="#ffd84d" stroke="${p.outline}" stroke-width="0.9"/>`;
  } else if (st.extra === 'headband') {
    extra = `<path d="M-21,-23 C-12,-32 12,-32 21,-23" stroke="${p.outline}" stroke-width="5.6" fill="none" stroke-linecap="round"/>
<path d="M-21,-23 C-12,-32 12,-32 21,-23" stroke="${p.trim === '#ffffff' ? '#ffd84d' : p.trim}" stroke-width="3.6" fill="none" stroke-linecap="round"/>`;
  } else if (st.extra === 'scrunchie') {
    extra = `<circle cx="15" cy="-27" r="4.4" fill="#ffd84d" stroke="${p.outline}" stroke-width="1.8"/>`;
  } else if (st.extra === 'tiara') {
    extra = `<path d="M-12,-27 L-8,-33 L-3,-28 L0,-36 L3,-28 L8,-33 L12,-27 Q0,-24 -12,-27 Z" fill="#ffe27a" stroke="${p.outline}" stroke-width="1.6" stroke-linejoin="round"/>
<circle cx="0" cy="-30" r="1.8" fill="#4cb8f6"/>`;
  }
  if (style === 'twintails') {
    extra += `<circle cx="-20" cy="-20" r="3.6" fill="#ffd84d" stroke="${p.outline}" stroke-width="1.6"/><circle cx="20" cy="-20" r="3.6" fill="#ffd84d" stroke="${p.outline}" stroke-width="1.6"/>`;
  }
  return `<path d="${locks}" fill="url(#${id}h)" stroke="${p.hairLine}" stroke-width="2.2" stroke-linejoin="round"/>
<path d="${cap}" fill="url(#${id}h)" stroke="${p.hairLine}" stroke-width="2.6" stroke-linejoin="round"/>
<path d="M-15,-25 Q-6,-31 5,-30" stroke="${p.shine}" stroke-width="2.6" fill="none" stroke-linecap="round" opacity="0.85"/>
${extra}`;
}

function fireExtra(st) {
  const p = st.palette;
  if (st.extra === 'headband') {
    return `<path d="M-23.5,-13 C-14,-19 14,-19 23.5,-13" stroke="${p.outline}" stroke-width="7.4" fill="none" stroke-linecap="round"/>
<path d="M-23.5,-13 C-14,-19 14,-19 23.5,-13" stroke="#ffffff" stroke-width="4.4" fill="none" stroke-linecap="round"/>
<path d="M-23.5,-13 C-14,-19 14,-19 23.5,-13" stroke="${p.top}" stroke-width="1.4" fill="none"/>
<path d="M-23,-12 l-8,5 M-23,-12 l-9,-1" stroke="${p.outline}" stroke-width="3.6" stroke-linecap="round"/>
<path d="M-23,-12 l-8,5 M-23,-12 l-9,-1" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round"/>`;
  }
  if (st.extra === 'circlet') {
    return `<path d="M-23,-14 C-14,-20 14,-20 23,-14" stroke="${p.outline}" stroke-width="5" fill="none" stroke-linecap="round"/>
<path d="M-23,-14 C-14,-20 14,-20 23,-14" stroke="#ffe27a" stroke-width="2.6" fill="none" stroke-linecap="round"/>
<path d="M0,-22 L3.5,-17.5 L0,-13 L-3.5,-17.5 Z" fill="#ff4a2a" stroke="${p.outline}" stroke-width="1.4"/>`;
  }
  return '';
}

/** One head frame. anim: idle | run | rise | fall (the engine calls running "jumping"). */
export function headSVG(variant, who, anim, i, n, w, h) {
  const st = styleOf(variant, who);
  const id = `v${variant}${who}${anim}${i}`;
  const t = n > 1 ? i / n : 0;
  const bob = anim === 'idle' ? Math.sin(TAU * t) * 1.2 : 0;
  const blink = anim === 'idle' && n >= 10 && i >= n - 2;
  const look = anim === 'run' ? 3 : 0;
  const expr = anim === 'fall' ? 'o' : anim === 'rise' ? 'wow' : anim === 'run' ? 'grin' : 'smile';
  let hairBack = '';
  let hairFront = '';
  if (who === 'fire') {
    const modes = {
      idle: { wind: [0.25 * Math.sin(TAU * t), -1], windAmt: 0.2, stretch: 1 },
      run: { wind: [-1, -0.15], windAmt: 0.72, stretch: 1.18 },
      rise: { wind: [0, 1], windAmt: 0.32, stretch: 0.72 },
      fall: { wind: [0, -1], windAmt: 0.6, stretch: 1.32 },
    };
    hairFront = flameHair(st, id, { t, ...modes[anim] }) + fireExtra(st);
  } else {
    const ends = { idle: [0, 21], run: [-16, 12], rise: [0, 30], fall: [0, -46] };
    const locks = { idle: [0, 0], run: [-5, -2], rise: [0, 4], fall: [0, -10] };
    hairBack = waterHairBack(st, id, { t, end: ends[anim] });
    hairFront = waterHairFront(st, id, { t, lock: locks[anim] });
  }
  const glow = `<ellipse cx="0" cy="-10" rx="44" ry="46" fill="url(#${id}g)"/>`;
  const body = `${glow}<g transform="translate(0 ${f(bob)})">${hairBack}${faceBase(who, st)}${face(who, st, { look, blink, expr })}${hairFront}</g>`;
  return svg(w, h, defs(st, id) + `<g transform="translate(${w / 2} ${h / 2})">${body}</g>`);
}

// ------------------------------------------------------------------ bodies

function limb(x1, y1, x2, y2, color, outline, width) {
  return `<path d="M${f(x1)},${f(y1)} L${f(x2)},${f(y2)}" stroke="${outline}" stroke-width="${width + 3.2}" stroke-linecap="round"/>
<path d="M${f(x1)},${f(y1)} L${f(x2)},${f(y2)}" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/>`;
}

function shoe(x, y, dir, p) {
  const cx = x + dir * 2;
  return `<path d="M${f(cx - 5)},${f(y + 2.6)} Q${f(cx - 5.4)},${f(y - 3)} ${f(cx)},${f(y - 3)} Q${f(cx + 5.6)},${f(y - 2.6)} ${f(cx + 5.6)},${f(y + 2.6)} Z" fill="${p.shoe}" stroke="${p.outline}" stroke-width="1.8" stroke-linejoin="round"/>
<path d="M${f(cx - 4.6)},${f(y + 1.6)} L${f(cx + 5)},${f(y + 1.6)}" stroke="${p.sole}" stroke-width="1.6"/>`;
}

function torso(who, st, id, back) {
  const p = st.palette;
  const o = p.outline;
  switch (st.outfit) {
    case 'dress':
      return `<path d="M-9,12 Q-11,18 -8,21 L-14,31 Q0,34.5 14,31 L8,21 Q11,18 9,12 Q0,9.5 -9,12 Z" fill="url(#${id}t)" stroke="${o}" stroke-width="2.4" stroke-linejoin="round"/>
<path d="M-8,21 Q0,23 8,21" stroke="${p.topShade}" stroke-width="1.8" fill="none"/>` +
        (back ? '' : `<path d="M-6,11.5 L0,16.5 L6,11.5 Q0,10 -6,11.5 Z" fill="${p.trim}" stroke="${o}" stroke-width="1.6" stroke-linejoin="round"/>`);
    case 'sporty':
      return `<path d="M-12,22 L-13.5,30 Q0,32.5 13.5,30 L12,22 Z" fill="${p.pants}" stroke="${o}" stroke-width="2.2" stroke-linejoin="round"/>
<path d="M-12.6,27 Q0,29.4 12.6,27" stroke="#ffffff" stroke-width="1.6" fill="none"/>
<path d="M-9,12 Q-11,17 -9,21 L9,21 Q11,17 9,12 Q0,9.5 -9,12 Z" fill="url(#${id}t)" stroke="${o}" stroke-width="2.4" stroke-linejoin="round"/>
<path d="M-8,20.5 L8,20.5" stroke="#ffffff" stroke-width="1.6"/>`;
    case 'jersey':
      return `<path d="M-11,12 Q-12,20 -10,27.5 L10,27.5 Q12,20 11,12 L6,11 Q0,15 -6,11 Z" fill="url(#${id}t)" stroke="${o}" stroke-width="2.4" stroke-linejoin="round"/>` +
        (back ? '' : `<text x="0" y="24.5" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="9" fill="#ffffff" stroke="${o}" stroke-width="0.8">7</text>`) +
        `<path d="M-10,25.6 L10,25.6" stroke="#ffffff" stroke-width="1.6"/>`;
    case 'jacket': {
      const tee = who === 'water' ? '#ffffff' : '#2b2d3a';
      return `<path d="M-12,12 Q-14,20 -11,28 L11,28 Q14,20 12,12 Q0,9 -12,12 Z" fill="url(#${id}t)" stroke="${o}" stroke-width="2.4" stroke-linejoin="round"/>` +
        (back
          ? `<path d="M-6,14 L6,14" stroke="${p.topShade}" stroke-width="2"/>`
          : `<path d="M-4.5,11 L4.5,11 L4,28 L-4,28 Z" fill="${tee}" stroke="${o}" stroke-width="1.6"/>` +
            `<path d="M-4.5,11 L-8,16 M4.5,11 L8,16" stroke="${p.topShade}" stroke-width="2.2" stroke-linecap="round"/>` +
            (who === 'fire' ? `<path d="M0,17 C-2,19.5 -2,21.5 0,23 C2,21.5 2,19.5 0,17 Z" fill="${p.trim}"/>` : `<circle cx="0" cy="19.5" r="2" fill="#4cb8f6"/>`));
    }
    case 'robe': {
      const sash = who === 'fire' ? '#ffe27a' : '#ffffff';
      return `<path d="M-10,12 Q-13,22 -15,32 Q0,35 15,32 Q13,22 10,12 Q0,9 -10,12 Z" fill="url(#${id}t)" stroke="${o}" stroke-width="2.4" stroke-linejoin="round"/>
<path d="M-11.5,21 Q0,24 11.5,21" stroke="${o}" stroke-width="4.6" fill="none"/>
<path d="M-11.5,21 Q0,24 11.5,21" stroke="${sash}" stroke-width="2.6" fill="none"/>` +
        (back ? '' : `<path d="M0,11 L0,21" stroke="${p.topShade}" stroke-width="1.6"/><circle cx="0" cy="22.6" r="2.2" fill="${who === 'fire' ? '#ff4a2a' : '#4cb8f6'}" stroke="${o}" stroke-width="1.2"/>`);
    }
    default: // hoodie
      return `<path d="M-12.5,12 Q-14.5,20 -11,27.5 L11,27.5 Q14.5,20 12.5,12 Q0,9 -12.5,12 Z" fill="url(#${id}t)" stroke="${o}" stroke-width="2.4" stroke-linejoin="round"/>
<path d="M-11,25.5 L11,25.5" stroke="${p.trim}" stroke-width="2"/>` +
        (back
          ? `<path d="M-8,11.5 Q0,19 8,11.5" stroke="${p.topShade}" stroke-width="2" fill="none"/>`
          : `<path d="M0,15.5 C-2.6,18.5 -2.6,21 0,22.5 C2.6,21 2.6,18.5 0,15.5 Z" fill="${p.trim}" stroke="${o}" stroke-width="1.2"/>` +
            `<path d="M-4,12.2 L-3,16 M4,12.2 L3,16" stroke="#fff3df" stroke-width="1.4" stroke-linecap="round"/>`);
  }
}

/** A cape behind the mage outfit. */
function cape(who, st, { dir, sway }) {
  if (st.outfit !== 'robe' || who !== 'fire') return '';
  const p = st.palette;
  const tail = dir ? -10 : 0;
  return `<path d="M-11,12 Q${f(-17 + tail)},26 ${f(-15 + tail + sway)},36 Q${f(0 + tail / 2)},${f(38 + sway)} ${f(15 + tail * 0.4)},36 Q16,24 11,12 Z" fill="#7a1f12" stroke="${p.outline}" stroke-width="2.2" stroke-linejoin="round"/>`;
}

/**
 * Torso, arms and legs. legs/arms: [front, back] angles in radians from vertical
 * (positive = forward/right); dir 0 = facing the viewer, 1 = running right.
 */
function bodyParts(who, st, id, { legs = [0, 0], arms = [0, 0], dir = 0, bob = 0, back = false }) {
  const p = st.palette;
  const legLen = 12.5;
  const bareArms = st.outfit === 'jersey' || st.outfit === 'sporty' || (who === 'water' && st.outfit === 'dress');
  const longSkirt = st.outfit === 'robe';
  let s = `<g transform="translate(0 ${f(bob)})">`;
  s += cape(who, st, { dir, sway: legs[0] * 3 });
  const hips = dir ? [[-1.5, 0], [1.5, 0]] : [[-5, 0], [5, 0]];
  const legDraw = (k) => {
    const [hx] = hips[k];
    const a = legs[k] * (longSkirt ? 0.7 : 1);
    const fx = hx + Math.sin(a) * legLen;
    const fy = 26 + Math.cos(a) * legLen;
    return limb(hx, 26, fx, fy - 1, p.pants, p.outline, 5.2) + shoe(fx, fy, dir || (k === 0 ? -0.6 : 0.6), p);
  };
  s += dir ? legDraw(1) + legDraw(0) : legDraw(0) + legDraw(1);
  const armDraw = (side, a) => {
    const sx = dir ? side * 4 : side * 11;
    const len = 11;
    const hx = sx + Math.sin(a) * len + (dir ? 0 : side * 2.5);
    const hy = 14 + Math.cos(a) * len;
    return limb(sx, 14.5, hx, hy, bareArms ? p.skin : p.top, p.outline, 4.6) + `<circle cx="${f(hx)}" cy="${f(hy)}" r="2.9" fill="${p.skin}" stroke="${p.outline}" stroke-width="1.6"/>`;
  };
  if (dir) s += armDraw(-1, arms[1]);
  s += torso(who, st, id, back);
  if (dir) s += armDraw(1, arms[0]);
  else s += armDraw(-1, arms[1]) + armDraw(1, arms[0]);
  return s + '</g>';
}

export function legsSVG(variant, who, anim, i, n, w, h) {
  const st = styleOf(variant, who);
  const id = `v${variant}${who}legs${anim}${i}`;
  let pose;
  if (anim === 'idle') {
    pose = { legs: [0.06, -0.06], arms: [0.1, -0.1], dir: 0 };
  } else {
    const ph = (TAU * i) / n;
    const swing = 0.62 * Math.sin(ph);
    pose = { legs: [swing, -swing], arms: [-0.75 * Math.sin(ph), 0.75 * Math.sin(ph)], dir: 1, bob: -1.4 * Math.abs(Math.cos(ph)) };
  }
  return svg(w, h, defs(st, id) + `<g transform="translate(${w / 2} ${h / 2})">${bodyParts(who, st, id, pose)}</g>`);
}

/** Little sprays of ice behind the feet while sliding. */
export function iceSVG(variant, who, anim, i, n, w, h) {
  const seeds = [
    [[-16, 37, 3.2], [-10, 39, 2.4], [-21, 35, 2], [-6, 40, 1.8]],
    [[-18, 36, 2.6], [-12, 39.5, 3], [-24, 33, 1.8], [-8, 38, 2]],
    [[-14, 38, 3], [-20, 34, 2.4], [-9, 40, 2], [-25, 36, 1.6]],
  ];
  const shards = seeds[i % seeds.length]
    .map(
      ([x, y, r]) =>
        `<path d="M${x},${f(y - r)} L${f(x + r * 0.7)},${y} L${x},${f(y + r)} L${f(x - r * 0.7)},${y} Z" fill="#eafcff" stroke="#7fc8e8" stroke-width="0.9"/>`,
    )
    .join('');
  return svg(w, h, `<g transform="translate(${w / 2} ${h / 2})">${shards}</g>`);
}

/** Walking up the steps into the door, seen from behind (anchor: bottom centre). */
export function stairsSVG(variant, who, anim, i, n, w, h) {
  const st = styleOf(variant, who);
  const id = `v${variant}${who}st${i}`;
  const k = i / (n - 1);
  const s = 1 - 0.26 * k;
  const climb = -30 * k;
  const alpha = k > 0.72 ? Math.max(0, 1 - (k - 0.72) / 0.28) : 1;
  const step = Math.sin((i / 4) * Math.PI);
  const pose = { legs: [0.35 * step, -0.35 * step], arms: [-0.3 * step, 0.3 * step], dir: 0, back: true };
  const p = st.palette;
  let hair;
  if (who === 'fire') {
    hair = flameHair(st, id, { t: k * 3, wind: [0, -1], windAmt: 0.25, stretch: 1 }) +
      `<ellipse cx="0" cy="-6" rx="23" ry="22" fill="url(#${id}h)" stroke="${p.hairLine}" stroke-width="2.6"/>` +
      `<path d="M-8,-24 Q-12,-8 -6,12 M8,-24 Q12,-8 6,12 M0,-27 L0,12" stroke="${p.hairLine}" stroke-width="1.4" fill="none" opacity="0.4"/>`;
  } else {
    hair = waterHairBack(st, id, { t: k, end: [0, 22] }) +
      `<ellipse cx="0" cy="-8" rx="23" ry="21" fill="url(#${id}h)" stroke="${p.hairLine}" stroke-width="2.6"/>` +
      `<path d="M-10,-26 Q-16,-8 -12,10 M10,-26 Q16,-8 12,10 M0,-29 Q2,-10 0,10" stroke="${p.hairLine}" stroke-width="1.4" fill="none" opacity="0.4"/>`;
  }
  const char = `<g transform="translate(0 -39)">${bodyParts(who, st, id, pose)}${hair}</g>`;
  return svg(
    w,
    h,
    defs(st, id) +
      `<g transform="translate(${w / 2} ${h}) translate(0 ${f(climb)}) scale(${f(s)})" opacity="${f(alpha)}">${char}</g>`,
  );
}

export function glowSVG(variant, who, anim, i, n, w, h) {
  const p = styleOf(variant, who).palette;
  return svg(
    w,
    h,
    `<defs><radialGradient id="g"><stop offset="0" stop-color="rgba(${p.glow},0.55)"/><stop offset="1" stop-color="rgba(${p.glow},0)"/></radialGradient></defs>` +
      `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2}" ry="${h / 2}" fill="url(#g)"/>`,
  );
}

function svg(w, h, inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${inner}</svg>`;
}

/** Which drawing function and animation a CharAssets frame name maps to. */
export function frameRecipe(name) {
  const m = /^(fire|water)_(.+?)(\d{4})$/.exec(name);
  if (!m) return null;
  const [, who, part, num] = m;
  const map = {
    head_idle: [headSVG, 'idle'],
    head_jumping: [headSVG, 'run'],
    head_rising: [headSVG, 'rise'],
    head_falling: [headSVG, 'fall'],
    legs_idle: [legsSVG, 'idle'],
    legs_running: [legsSVG, 'run'],
    ice_legs: [iceSVG, 'ice'],
    stairs: [stairsSVG, 'stairs'],
    glow: [glowSVG, 'glow'],
  };
  const entry = map[part];
  return entry ? { who, part, draw: entry[0], anim: entry[1], i: Number(num) } : null;
}
