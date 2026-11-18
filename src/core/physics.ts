/**
 * Vitesse virtuelle sur une route : modèle cycliste classique avec inertie.
 * Forces : roulement (Crr), gravité (pente), air (CdA). 2 % de pertes de transmission.
 */
const G = 9.81;
const CRR = 0.004;
const CDA = 0.32;
const RHO = 1.2;
const DRIVETRAIN = 0.98;
const MAX_V = 25; // 90 km/h
const SUBSTEPS = 4;

function resistance(v: number, gradePct: number, massKg: number): number {
  const th = Math.atan(gradePct / 100);
  return CRR * massKg * G * Math.cos(th) + massKg * G * Math.sin(th) + 0.5 * RHO * CDA * v * v;
}

/** Nouvelle vitesse (m/s) après `dtS` secondes à la puissance donnée. */
export function advanceSpeed(v: number, powerW: number, gradePct: number, massKg: number, dtS = 1): number {
  const h = dtS / SUBSTEPS;
  for (let i = 0; i < SUBSTEPS; i++) {
    const push = (powerW * DRIVETRAIN) / Math.max(v, 1); // force de propulsion, bornée à très basse vitesse
    const a = (push - resistance(v, gradePct, massKg)) / massKg;
    v = Math.min(MAX_V, Math.max(0, v + a * h));
  }
  return v;
}

/** Vitesse d'équilibre (m/s) : puissance utile = puissance résistante. */
export function steadySpeed(powerW: number, gradePct: number, massKg: number): number {
  const f = (v: number) => powerW * DRIVETRAIN - resistance(v, gradePct, massKg) * v;
  let lo = 0, hi = MAX_V;
  if (f(hi) > 0) return MAX_V;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) lo = mid; else hi = mid;
  }
  return lo;
}
