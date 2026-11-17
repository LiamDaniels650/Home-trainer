/** Zone FC 0..4 (bornes à 60/70/80/90 % de la FC max). */
export function hrZone(hr: number, hrMax: number): number {
  const p = hr / hrMax;
  if (p < 0.6) return 0;
  if (p < 0.7) return 1;
  if (p < 0.8) return 2;
  if (p < 0.9) return 3;
  return 4;
}

export const ZONE_NAMES = ['Z1 Récup', 'Z2 Endurance', 'Z3 Tempo', 'Z4 Seuil', 'Z5 Max'];
