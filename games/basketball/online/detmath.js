// Bit-identical maths for lockstep play.
//
// Online, both browsers run the same match from the same inputs and must end up in
// exactly the same state. JavaScript's + - * / and Math.sqrt are exactly rounded
// everywhere, but Math.sin, cos, atan2, pow and friends are "implementation
// approximated": Chrome, Firefox and Safari can differ in the last bit, and the
// physics (nape) and the game call them every step. While simulation code runs,
// `deterministic()` swaps those functions (and Math.random) for the versions below,
// which only use exactly rounded operations, so every browser computes the same
// bits. They follow fdlibm (Sun's freely distributable libm), accurate to ~1 ulp.

const NATIVE = {
  random: Math.random,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  atan: Math.atan,
  atan2: Math.atan2,
  asin: Math.asin,
  acos: Math.acos,
  exp: Math.exp,
  log: Math.log,
  pow: Math.pow,
};

// ---------------------------------------------------------------- sin, cos

const INVPIO2 = 6.36619772367581382433e-1;
const PIO2_1 = 1.57079632673412561417e0; // first 33 bits of pi/2
const PIO2_1T = 6.07710050650619224932e-11; // pi/2 - PIO2_1
const PIO2_2 = 6.07710050630396597660e-11;
const PIO2_2T = 2.02226624879595063154e-21;

const S1 = -1.66666666666666324348e-1;
const S2 = 8.33333333332248946124e-3;
const S3 = -1.98412698298579493134e-4;
const S4 = 2.75573137070700676789e-6;
const S5 = -2.50507602534068634195e-8;
const S6 = 1.58969099521155010221e-10;

const C1 = 4.16666666666666019037e-2;
const C2 = -1.38888888888741095749e-3;
const C3 = 2.48015872894767294178e-5;
const C4 = -2.75573143513906633035e-7;
const C5 = 2.08757232129817482790e-9;
const C6 = -1.13596475577881948265e-11;

function kSin(x, y) {
  const z = x * x;
  const v = z * x;
  const r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)));
  return x - (z * (0.5 * y - v * r) - y - v * S1);
}

function kCos(x, y) {
  const z = x * x;
  const r = z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
  const hz = 0.5 * z;
  const w = 1 - hz;
  return w + (1 - w - hz + (z * r - x * y));
}

/** x = n·π/2 + (y0 + y1), |y0 + y1| ≤ π/4. Exact enough for |x| < 2^19·π/2. */
function remPio2(x) {
  const n = Math.round(x * INVPIO2); // Math.round is exact
  let r = x - n * PIO2_1;
  let w = n * PIO2_1T;
  let y0 = r - w;
  // one more step when cancellation was heavy (as in fdlibm's medium case)
  const t = r;
  w = n * PIO2_2;
  r = t - w;
  w = n * PIO2_2T - (t - r - w);
  y0 = r - w;
  const y1 = r - y0 - w;
  return { n, y0, y1 };
}

export function sin(x) {
  if (!Number.isFinite(x)) return NaN;
  const ax = x < 0 ? -x : x;
  if (ax <= 0.7853981633974483) return ax < 7.450580596923828e-9 ? x : kSin(x, 0);
  const { n, y0, y1 } = remPio2(x);
  switch (n & 3) {
    case 0:
      return kSin(y0, y1);
    case 1:
      return kCos(y0, y1);
    case 2:
      return -kSin(y0, y1);
    default:
      return -kCos(y0, y1);
  }
}

export function cos(x) {
  if (!Number.isFinite(x)) return NaN;
  const ax = x < 0 ? -x : x;
  if (ax <= 0.7853981633974483) return ax < 7.450580596923828e-9 ? 1 : kCos(x, 0);
  const { n, y0, y1 } = remPio2(x);
  switch (n & 3) {
    case 0:
      return kCos(y0, y1);
    case 1:
      return -kSin(y0, y1);
    case 2:
      return -kCos(y0, y1);
    default:
      return kSin(y0, y1);
  }
}

export function tan(x) {
  return sin(x) / cos(x);
}

// ---------------------------------------------------------------- atan, atan2

const ATANHI = [4.63647609000806093515e-1, 7.85398163397448278999e-1, 9.82793723247329054082e-1, 1.57079632679489655800e0];
const ATANLO = [2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17, 6.12323399573676603587e-17];
const AT = [
  3.33333333333329318027e-1, -1.99999999998764832476e-1, 1.42857142725034663711e-1, -1.11111104054623557880e-1,
  9.09088713343650656196e-2, -7.69187620504482999495e-2, 6.66107313738753120669e-2, -5.83357013379057348645e-2,
  4.97687799461593236017e-2, -3.65315727442169155270e-2, 1.62858201153657823623e-2,
];

export function atan(x) {
  if (Number.isNaN(x)) return NaN;
  const neg = x < 0 || Object.is(x, -0);
  let ax = neg ? -x : x;
  if (ax >= 7.378697629483821e19) return neg ? -(ATANHI[3] + ATANLO[3]) : ATANHI[3] + ATANLO[3]; // 2^66
  let id;
  if (ax < 0.4375) {
    if (ax < 3.725290298461914e-9) return x; // 2^-28
    id = -1;
  } else if (ax < 1.1875) {
    if (ax < 0.6875) {
      id = 0;
      ax = (2 * ax - 1) / (2 + ax);
    } else {
      id = 1;
      ax = (ax - 1) / (ax + 1);
    }
  } else if (ax < 2.4375) {
    id = 2;
    ax = (ax - 1.5) / (1 + 1.5 * ax);
  } else {
    id = 3;
    ax = -1 / ax;
  }
  const z = ax * ax;
  const w = z * z;
  const s1 = z * (AT[0] + w * (AT[2] + w * (AT[4] + w * (AT[6] + w * (AT[8] + w * AT[10])))));
  const s2 = w * (AT[1] + w * (AT[3] + w * (AT[5] + w * (AT[7] + w * AT[9]))));
  if (id < 0) return neg ? -(ax - ax * (s1 + s2)) : ax - ax * (s1 + s2);
  const r = ATANHI[id] - (ax * (s1 + s2) - ATANLO[id] - ax);
  return neg ? -r : r;
}

const PI = 3.1415926535897931160e0;
const PI_LO = 1.2246467991473531772e-16;

export function atan2(y, x) {
  if (Number.isNaN(x) || Number.isNaN(y)) return NaN;
  const yNeg = y < 0 || Object.is(y, -0);
  if (y === 0) {
    if (x > 0 || Object.is(x, 0)) return y; // ±0
    return yNeg ? -PI : PI;
  }
  if (x === 0) return yNeg ? -PI / 2 : PI / 2;
  if (!Number.isFinite(x)) {
    if (!Number.isFinite(y)) {
      const a = x > 0 ? PI / 4 : (3 * PI) / 4;
      return yNeg ? -a : a;
    }
    if (x > 0) return yNeg ? -0 : 0;
    return yNeg ? -PI : PI;
  }
  if (!Number.isFinite(y)) return yNeg ? -PI / 2 : PI / 2;
  const z = atan(Math.abs(y / x));
  if (x > 0) return yNeg ? -z : z;
  const r = PI - (z - PI_LO);
  return yNeg ? -r : r;
}

export function asin(x) {
  if (!(x >= -1 && x <= 1)) return NaN;
  return atan2(x, Math.sqrt((1 - x) * (1 + x)));
}

export function acos(x) {
  if (!(x >= -1 && x <= 1)) return NaN;
  return atan2(Math.sqrt((1 - x) * (1 + x)), x);
}

// ---------------------------------------------------------------- exp, log, pow

const LN2_HI = 6.93147180369123816490e-1;
const LN2_LO = 1.90821492927058770002e-10;
const INVLN2 = 1.44269504088896338700e0;
const LG = [6.666666666666735130e-1, 3.999999999940941908e-1, 2.857142874366239149e-1, 2.222219843214978396e-1,
  1.818357216161805012e-1, 1.531383769920937332e-1, 1.479819860511658591e-1];
const P1 = 1.66666666666666019037e-1;
const P2 = -2.77777777770155933842e-3;
const P3 = 6.61375632143793436117e-5;
const P4 = -1.65339022054652515390e-6;
const P5 = 4.13813679705723846039e-8;

const view = new DataView(new ArrayBuffer(8));

/** 2^k for an integer k, built from its bits. */
function pow2(k) {
  if (k > 1023) return Infinity;
  if (k < -1074) return 0;
  if (k < -1022) return pow2(k + 54) * 5.551115123125783e-17; // 2^-54, exact
  view.setUint32(0, (k + 1023) << 20);
  view.setUint32(4, 0);
  return view.getFloat64(0);
}

export function log(x) {
  if (Number.isNaN(x) || x < 0) return NaN;
  if (x === 0) return -Infinity;
  if (x === Infinity) return Infinity;
  let k = 0;
  if (x < 2.2250738585072014e-308) {
    x *= 18014398509481984; // 2^54: subnormal to normal
    k -= 54;
  }
  view.setFloat64(0, x);
  const hi = view.getUint32(0);
  k += ((hi >>> 20) & 0x7ff) - 1023;
  // mantissa in [sqrt(2)/2, sqrt(2))
  let mHi = (hi & 0x000fffff) | 0x3ff00000;
  if ((hi & 0x000fffff) > 0x6a09e) {
    mHi = (hi & 0x000fffff) | 0x3fe00000;
    k += 1;
  }
  view.setUint32(0, mHi);
  const m = view.getFloat64(0);
  const f = m - 1;
  const s = f / (2 + f);
  const z = s * s;
  const w = z * z;
  const t1 = w * (LG[1] + w * (LG[3] + w * LG[5]));
  const t2 = z * (LG[0] + w * (LG[2] + w * (LG[4] + w * LG[6])));
  const R = t2 + t1;
  const hfsq = 0.5 * f * f;
  return k * LN2_HI - (hfsq - (s * (hfsq + R) + k * LN2_LO) - f);
}

export function exp(x) {
  if (Number.isNaN(x)) return NaN;
  if (x > 709.782712893384) return Infinity;
  if (x < -745.1332191019411) return 0;
  if (Math.abs(x) < 3.725290298461914e-9) return 1 + x;
  const k = Math.round(x * INVLN2);
  const hi = x - k * LN2_HI;
  const lo = k * LN2_LO;
  const r = hi - lo;
  const t = r * r;
  const c = r - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
  const y = 1 - (lo - (r * c) / (2 - c) - hi);
  // y·2^k in two steps so it can't overflow or flush early
  const k1 = k >> 1;
  return y * pow2(k1) * pow2(k - k1);
}

export function pow(x, y) {
  if (y === 0) return 1;
  if (Number.isNaN(x) || Number.isNaN(y)) return NaN;
  if (Number.isInteger(y) && Math.abs(y) <= 1024 && Number.isFinite(x)) {
    // exponentiation by squaring: only exact multiplications
    let n = Math.abs(y);
    let base = x;
    let result = 1;
    while (n > 0) {
      if (n & 1) result *= base;
      base *= base;
      n = Math.floor(n / 2);
    }
    return y < 0 ? 1 / result : result;
  }
  if (x === 1) return 1;
  if (!Number.isFinite(x) || !Number.isFinite(y) || x <= 0) return NATIVE.pow(x, y); // edge cases: same everywhere by spec
  return exp(y * log(x));
}

// ---------------------------------------------------------------- random

/** A small seeded generator (mulberry32), returning floats in [0, 1). */
export function seededRandom(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.state = () => a;
  return next;
}

// ---------------------------------------------------------------- swapping

const DET = { sin, cos, tan, atan, atan2, asin, acos, exp, log, pow };
let depth = 0;

/** Runs fn with deterministic Math functions and `rng` as Math.random. */
export function deterministic(rng, fn) {
  if (depth > 0) return fn();
  depth++;
  const saved = {};
  for (const k of Object.keys(DET)) {
    saved[k] = Math[k];
    Math[k] = DET[k];
  }
  saved.random = Math.random;
  Math.random = rng;
  try {
    return fn();
  } finally {
    for (const k of Object.keys(saved)) Math[k] = saved[k];
    depth--;
  }
}

export { NATIVE };
