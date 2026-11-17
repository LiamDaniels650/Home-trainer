/**
 * Puissance ESTIMÉE pour l'Elite Novo Force (8 niveaux).
 * Elite ne publie pas de courbe officielle : forme classique d'un home trainer magnétique
 * P = m(niveau) × (5·v + 0.306·v²), v en km/h, avec m(n) = 0.3 + 0.1·(n−1).
 * Calage : niveau 8 à 40 km/h ≈ 690 W (valeur max annoncée). Le facteur `calib` permet d'ajuster.
 */
const A = 5;
const C = 0.306;

export function levelMultiplier(level: number): number {
  const n = Math.min(8, Math.max(1, Math.round(level)));
  return 0.3 + 0.1 * (n - 1);
}

export function estimatePower(speedKmh: number, level: number, calib = 1): number {
  if (!(speedKmh > 0)) return 0;
  return Math.round(calib * levelMultiplier(level) * (A * speedKmh + C * speedKmh * speedKmh));
}

/** Meilleure moyenne sur une fenêtre glissante de `windowSec` échantillons (1 Hz). */
export function bestAverage(values: number[], windowSec: number): number | null {
  if (windowSec <= 0 || values.length < windowSec) return null;
  let sum = 0;
  for (let i = 0; i < windowSec; i++) sum += values[i];
  let best = sum;
  for (let i = windowSec; i < values.length; i++) {
    sum += values[i] - values[i - windowSec];
    if (sum > best) best = sum;
  }
  return best / windowSec;
}
