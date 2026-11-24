// Outfits: every head can wear any shirt and boots. Each head starts in a shirt that
// suits it; the rest get one picked from their name, so it never changes.
import { BOOTS, HEADS, JERSEYS } from './catalog.js';

const SHIRTS = {
  'leon-messo': 'miami-herons-home',
  'cristo-ronalto': 'yellow-canaries-home',
  'kylo-mbappy': 'royal-whites-home',
  'merlin-yalland': 'sky-blues-home',
  'mo-salaro': 'mersey-reds-away',
  'harvin-cane': 'bavarian-reds-home',
  'lamio-yamaro': 'catalan-giants-home',
  'philip-fodan': 'sky-blues-home',
  'alex-isako': 'black-stripes-away',
  'brian-mbeuro': 'red-devils-home',
  'romelo-lukano': 'northern-blue-home',
  'julio-alvarez': 'capital-reds-home',
  'vitor-ozyman': 'golden-lions-home',
  'usman-dembaro': 'paris-royals-home',
  'desiro-douex': 'paris-royals-home',
  'joano-nevaro': 'paris-royals-home',
  'dashraf-hakooky': 'paris-royals-home',
  'hamal-movesiala': 'bavarian-reds-home',
  'michael-oh-lazy': 'bavarian-reds-home',
  'federo-valverdo': 'royal-whites-home',
  'crossbar-arnuldo': 'royal-whites-home',
  'ayda-gunero': 'royal-whites-home',
  'domin-szobar': 'mersey-reds-away',
  'hogo-kitiko': 'mersey-reds-away',
  'maryo-goalcardi': 'golden-lions-home',
  'fermino-lopetti': 'catalan-giants-home',
  'berno-silvano': 'sky-blues-home',
  'rayden-cherko': 'sky-blues-home',
  'bruno-grinford': 'red-devils-home',
  'ibrahim-drizz': 'rosso-devils-home',
  'sandro-tonello': 'black-stripes-away',
  'anthomi-kordon': 'black-stripes-away',
  'elzo-fernandazz': 'royal-blues-home',
  'sun-hyunmo': 'white-spurs-home',
  'muset-osile': 'north-gunners-home',
};

const hash = (text) => {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
};

export const headById = (id) => HEADS.find((h) => h.id === id);
export const jerseyById = (id) => JERSEYS.find((j) => j.id === id);
export const bootsById = (id) => BOOTS.find((b) => b.id === id);

export function defaultKit(head) {
  const h = headById(head) || HEADS[0];
  return {
    head: h.id,
    jersey: SHIRTS[h.id] || JERSEYS[hash(h.id) % JERSEYS.length].id,
    boots: BOOTS[hash(`${h.id} boots`) % BOOTS.length].id,
    neck: h.neck,
  };
}

/** A kit from untrusted data (saved prefs, the other browser), or null. */
export function validKit(k) {
  if (!k || typeof k !== 'object') return null;
  const h = headById(k.head);
  if (!h || !jerseyById(k.jersey) || !bootsById(k.boots)) return null;
  return { head: h.id, jersey: k.jersey, boots: k.boots, neck: h.neck };
}

/** A random opponent, not the same head as `avoid` and in a different shirt. */
export function randomKit(random, avoid) {
  let head;
  do head = HEADS[Math.floor(random() * HEADS.length)].id;
  while (avoid && head === avoid.head);
  const kit = defaultKit(head);
  if (avoid && kit.jersey === avoid.jersey) kit.jersey = JERSEYS[(JERSEYS.findIndex((j) => j.id === kit.jersey) + 7) % JERSEYS.length].id;
  return kit;
}

/** Two players in the same shirt are hard to tell apart: the second changes. */
export function distinctKits(a, b) {
  if (a.jersey !== b.jersey) return [a, b];
  const i = JERSEYS.findIndex((j) => j.id === b.jersey);
  return [a, { ...b, jersey: JERSEYS[(i + 7) % JERSEYS.length].id }];
}

export const kitName = (kit) => (headById(kit.head) || { name: '?' }).name;

export function cycle(list, id, dir) {
  const i = list.findIndex((x) => x.id === id);
  return list[(i + dir + list.length) % list.length].id;
}
