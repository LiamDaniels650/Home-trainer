import type { Route, RoutePoint } from './types';

const MIN_SPACING_M = 5;
/**
 * Lissage de l'altitude (demi-largeur, m) : léger pour un fichier propre (itinéraire calculé sur un modèle de terrain),
 * fort pour une trace GPS bruitée. Le fichier est jugé bruité si un lissage fort lui fait perdre plus de 25 % de D+.
 */
const SMOOTH_LIGHT_M = 10;
const SMOOTH_STRONG_M = 50;
/** une variation d'altitude de moins de 1 m dans l'autre sens ne coupe pas une montée */
const CLIMB_THRESHOLD_M = 1;
/** conseil de niveau : marge de pente pour changer, temps minimal entre deux conseils */
const ADVICE_MARGIN_PCT = 1;
const ADVICE_HOLD_S = 45;
/** écart de niveau qui justifie un conseil immédiat (vraie montée ou descente) */
const ADVICE_JUMP = 3;
/** distance sur laquelle la pente est mesurée pour le conseil de niveau */
export const ADVICE_LOOKAHEAD_M = 300;
const MAX_POINTS = 5000;
const R_EARTH = 6371000;

export function haversine(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(h)));
}

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `r-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Lit un fichier GPX (trace ou itinéraire). Lève une erreur en français si le fichier est inutilisable. */
export function parseGpx(xml: string, fallbackName = 'Route'): Route {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length || doc.documentElement?.localName !== 'gpx') {
    throw new Error("Ce fichier n'est pas un fichier GPX valide.");
  }
  let nodes = [...doc.getElementsByTagNameNS('*', 'trkpt')];
  if (!nodes.length) nodes = [...doc.getElementsByTagNameNS('*', 'rtept')];

  const raw: { lat: number; lon: number; ele: number | null }[] = [];
  const num = (v: string | null | undefined) => (v == null || v.trim() === '' ? NaN : Number(v));
  for (const n of nodes) {
    const lat = num(n.getAttribute('lat')), lon = num(n.getAttribute('lon'));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    const eleNode = [...n.children].find((c) => c.localName === 'ele');
    const ele = num(eleNode?.textContent);
    raw.push({ lat, lon, ele: Number.isFinite(ele) ? ele : null });
  }
  if (raw.length < 2) throw new Error('Le fichier GPX ne contient pas assez de points pour faire une route.');

  const hasElevation = raw.some((p) => p.ele != null);
  let lastEle = raw.find((p) => p.ele != null)?.ele ?? 0;
  const full = raw.map((p) => {
    if (p.ele != null) lastEle = p.ele;
    return { lat: p.lat, lon: p.lon, ele: hasElevation ? lastEle : 0 };
  });

  // distance totale pour choisir l'espacement minimal (5 m, ou plus pour rester sous 5000 points)
  let total = 0;
  for (let i = 1; i < full.length; i++) total += haversine(full[i - 1], full[i]);
  const spacing = Math.max(MIN_SPACING_M, total / (MAX_POINTS - 1));

  const points: RoutePoint[] = [{ ...full[0], d: 0 }];
  let d = 0, since = 0;
  for (let i = 1; i < full.length; i++) {
    const step = haversine(full[i - 1], full[i]);
    d += step;
    since += step;
    const last = i === full.length - 1;
    if (since >= spacing || (last && since > 0)) {
      if (last && since < spacing && points.length > 1) points.pop(); // le dernier point remplace un point trop proche
      points.push({ ...full[i], d });
      since = 0;
    }
  }
  if (points.length < 2) throw new Error('Le fichier GPX ne contient pas assez de points pour faire une route.');

  const before = points.map((p) => p.ele);
  const strong = smoothed(points, SMOOTH_STRONG_M);
  const noisy = climb(strong) < 0.75 * climb(before, 0);
  const final = noisy ? strong : smoothed(points, SMOOTH_LIGHT_M);
  points.forEach((p, i) => { p.ele = final[i]; });
  const gainM = climb(final);

  // nom : métadonnées, puis trace, puis itinéraire (jamais celui d'un point de passage)
  const childName = (el: Element | undefined) => [...(el?.children ?? [])].find((c) => c.localName === 'name')?.textContent?.trim();
  const first = (tag: string) => doc.getElementsByTagNameNS('*', tag)[0];
  const name = childName(first('metadata')) || childName(first('trk')) || childName(first('rte')) || fallbackName;
  return { id: newId(), name, points, distanceM: points[points.length - 1].d, gainM, hasElevation };
}

/** Altitudes lissées par moyenne glissante sur ±half mètres. */
function smoothed(points: RoutePoint[], half: number): number[] {
  const out: number[] = [];
  let lo = 0, hi = 0, sum = 0;
  for (let i = 0; i < points.length; i++) {
    while (hi < points.length && points[hi].d - points[i].d <= half) sum += points[hi++].ele;
    while (points[i].d - points[lo].d > half) sum -= points[lo++].ele;
    out.push(sum / (hi - lo));
  }
  return out;
}

/**
 * Dénivelé positif avec hystérésis : chaque montée est comptée en entier (du creux au sommet),
 * mais une descente de moins de `threshold` mètres ne la coupe pas, et ne crée pas de fausse montée.
 */
export function climb(eles: number[], threshold = CLIMB_THRESHOLD_M): number {
  if (!eles.length) return 0;
  let up = true, valley = eles[0], peak = eles[0], gain = 0;
  for (const e of eles) {
    if (up) {
      if (e > peak) peak = e;
      else if (e < peak - threshold) { gain += peak - valley; valley = e; up = false; }
    } else if (e < valley) valley = e;
    else if (e > valley + threshold) { up = true; peak = e; }
  }
  return up ? gain + (peak - valley) : gain;
}

/** Index du tronçon [i, i+1] qui contient la distance d. */
function segmentIndex(r: Route, d: number): number {
  const pts = r.points;
  let lo = 0, hi = pts.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (pts[mid].d <= d) lo = mid; else hi = mid - 1;
  }
  return lo;
}

export function positionAt(r: Route, d: number): { lat: number; lon: number; ele: number } {
  const x = Math.min(Math.max(d, 0), r.distanceM);
  const i = segmentIndex(r, x);
  const a = r.points[i], b = r.points[i + 1];
  const t = b.d > a.d ? (x - a.d) / (b.d - a.d) : 0;
  return { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t, ele: a.ele + (b.ele - a.ele) * t };
}

/** Pente (%) moyenne sur les `aheadM` mètres à venir (sur les derniers mètres en bout de route). */
export function gradeAt(r: Route, d: number, aheadM = 100): number {
  const span = Math.min(aheadM, r.distanceM);
  let from = Math.min(Math.max(d, 0), r.distanceM);
  if (from + span > r.distanceM) from = r.distanceM - span;
  if (span <= 0) return 0;
  return ((positionAt(r, from + span).ele - positionAt(r, from).ele) / span) * 100;
}

/** Dénivelé positif restant depuis la distance d. */
export function remainingGain(r: Route, d: number): number {
  const x = Math.min(Math.max(d, 0), r.distanceM);
  const i = segmentIndex(r, x);
  return climb([positionAt(r, x).ele, ...r.points.slice(i + 1).map((p) => p.ele)]);
}

/** Niveau conseillé : niveau habituel sur le plat, +1 par tranche de 2 % de montée, −1 en descente (≤ −2 %). */
export function suggestLevel(gradePct: number, baseLevel: number): number {
  const lvl = gradePct >= 0 ? baseLevel + Math.floor(gradePct / 2) : gradePct <= -2 ? baseLevel - 1 : baseLevel;
  return Math.min(8, Math.max(1, lvl));
}

/**
 * Conseil de niveau stable, pour ne pas faire bouger la manette sans arrêt :
 * - la pente doit dépasser le seuil d'au moins 1 % pour changer de conseil ;
 * - au moins 45 s entre deux conseils, sauf écart de 3 niveaux ou plus (vraie montée ou descente).
 * Réglages choisis sur un parcours réel de 43 km : environ un conseil toutes les 1 min 30.
 */
export function adviseLevel(gradePct: number, baseLevel: number, previous: number | null, heldS: number): number {
  const now = suggestLevel(gradePct, baseLevel);
  if (previous == null || now === previous) return now;
  if (Math.abs(now - previous) < ADVICE_JUMP && heldS < ADVICE_HOLD_S) return previous;
  if (now > previous) return Math.max(previous, suggestLevel(gradePct - ADVICE_MARGIN_PCT, baseLevel));
  return Math.min(previous, suggestLevel(gradePct + ADVICE_MARGIN_PCT, baseLevel));
}
