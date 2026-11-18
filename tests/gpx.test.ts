// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';
import { adviseLevel, gradeAt, parseGpx, positionAt, remainingGain, suggestLevel } from '../src/core/gpx';

// ~111,2 m par 0,001° de latitude
const trk = (pts: [number, number, number?][], name = 'Col test') => `<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>${name}</name><trkseg>
${pts.map(([la, lo, e]) => `<trkpt lat="${la}" lon="${lo}">${e != null ? `<ele>${e}</ele>` : ''}</trkpt>`).join('\n')}
</trkseg></trk></gpx>`;

describe('parseGpx', () => {
  test('trace : distance, dénivelé, nom', () => {
    const r = parseGpx(trk([[45, 6, 100], [45.001, 6, 110], [45.002, 6, 105], [45.003, 6, 120]]));
    expect(r.name).toBe('Col test');
    expect(r.points).toHaveLength(4);
    expect(r.distanceM).toBeCloseTo(333.6, 0);
    expect(r.gainM).toBeCloseTo(25, 5);
    expect(r.hasElevation).toBe(true);
    expect(r.points[3].d).toBeCloseTo(r.distanceM, 6);
  });
  test('itinéraire (rtept) accepté', () => {
    const xml = `<gpx><rte><name>R</name><rtept lat="45" lon="6"><ele>1</ele></rtept><rtept lat="45.01" lon="6"><ele>2</ele></rtept></rte></gpx>`;
    expect(parseGpx(xml).points).toHaveLength(2);
  });
  test('points à moins de 5 m fusionnés', () => {
    const r = parseGpx(trk([[45, 6, 100], [45.00001, 6, 100], [45.001, 6, 100]]));
    expect(r.points).toHaveLength(2);
  });
  test('sans altitude : route plate', () => {
    const r = parseGpx(trk([[45, 6], [45.001, 6]]));
    expect(r.hasElevation).toBe(false);
    expect(r.gainM).toBe(0);
    expect(r.points.every((p) => p.ele === 0)).toBe(true);
  });
  test('nom par défaut si absent', () => {
    expect(parseGpx(`<gpx><trk><trkseg><trkpt lat="45" lon="6"/><trkpt lat="45.01" lon="6"/></trkseg></trk></gpx>`, 'mon-fichier').name).toBe('mon-fichier');
  });
  test('au plus 5000 points', () => {
    const pts: [number, number, number][] = Array.from({ length: 12000 }, (_, i) => [45 + i * 0.0001, 6, 100]);
    const r = parseGpx(trk(pts));
    expect(r.points.length).toBeLessThanOrEqual(5000);
    expect(r.distanceM).toBeCloseTo(11999 * 11.12, -2);
  });
  test('fichier invalide ou trop court refusé', () => {
    expect(() => parseGpx('pas du xml')).toThrow(/GPX/);
    expect(() => parseGpx(trk([[45, 6, 1]]))).toThrow(/points/);
    expect(() => parseGpx(trk([[200, 6, 1], [45, 6, 1]]))).toThrow(/points/);
  });
});

describe('position et pente', () => {
  const r = parseGpx(trk([[45, 6, 100], [45.001, 6, 110], [45.002, 6, 110], [45.003, 6, 100]]));
  const seg = r.points[1].d;
  test('interpolation de la position', () => {
    const p = positionAt(r, seg / 2);
    expect(p.lat).toBeCloseTo(45.0005, 6);
    expect(p.ele).toBeCloseTo(105, 6);
  });
  test('bornes', () => {
    expect(positionAt(r, -10).ele).toBe(100);
    expect(positionAt(r, 1e9).ele).toBe(100);
  });
  test('pente sur les 100 m à venir', () => {
    expect(gradeAt(r, 0)).toBeCloseTo(9, 0); // 10 m sur 111 m
    expect(gradeAt(r, seg + 1)).toBeCloseTo(0, 1);
    expect(gradeAt(r, 2 * seg + 1)).toBeCloseTo(-9, 0);
  });
  test('pente en bout de route : dernier tronçon', () => {
    expect(gradeAt(r, r.distanceM)).toBeCloseTo(-9, 0);
  });
  test('dénivelé positif restant', () => {
    expect(remainingGain(r, 0)).toBeCloseTo(10, 6);
    expect(remainingGain(r, seg / 2)).toBeCloseTo(5, 6);
    expect(remainingGain(r, seg)).toBe(0);
  });
});

test('niveau conseillé', () => {
  expect(suggestLevel(0, 3)).toBe(3);
  expect(suggestLevel(1.9, 3)).toBe(3);
  expect(suggestLevel(2, 3)).toBe(4);
  expect(suggestLevel(6.5, 3)).toBe(6);
  expect(suggestLevel(15, 3)).toBe(8);
  expect(suggestLevel(-1.9, 3)).toBe(3);
  expect(suggestLevel(-2.5, 3)).toBe(2);
  expect(suggestLevel(-8, 1)).toBe(1);
});

describe('corrections relecture', () => {
  test("altitude GPS bruitée : pas de faux pics de pente ni de D+ gonflé", () => {
    // 2 km plat à 100 m, bruit de ±4 m tous les 10 m
    const pts: [number, number, number][] = Array.from({ length: 201 }, (_, i) => [45 + (i * 10) / 111195, 6, 100 + (i % 2 ? 4 : -4)]);
    const r = parseGpx(trk(pts));
    expect(r.gainM).toBeLessThan(5);
    let maxAbs = 0;
    for (let d = 0; d < r.distanceM; d += 10) maxAbs = Math.max(maxAbs, Math.abs(gradeAt(r, d)));
    expect(maxAbs).toBeLessThan(2);
  });
  test('une vraie montée reste une montée', () => {
    const pts: [number, number, number][] = Array.from({ length: 201 }, (_, i) => [45 + (i * 10) / 111195, 6, 100 + i * 0.7 + (i % 2 ? 2 : -2)]);
    const r = parseGpx(trk(pts));
    expect(r.gainM).toBeGreaterThan(125);
    expect(r.gainM).toBeLessThan(150);
    expect(gradeAt(r, 1000)).toBeCloseTo(7, 0);
  });
  test('lat/lon absents ou altitude vide : point ignoré, pas de (0,0) ni de chute à 0 m', () => {
    const xml = `<gpx><trk><trkseg>
      <trkpt lat="45" lon="6"><ele>100</ele></trkpt>
      <trkpt lon="6"><ele>100</ele></trkpt>
      <trkpt lat="45.001" lon="6"><ele></ele></trkpt>
      <trkpt lat="45.002" lon="6"><ele>100</ele></trkpt>
    </trkseg></trk></gpx>`;
    const r = parseGpx(xml);
    expect(r.distanceM).toBeLessThan(300);
    expect(r.points.every((p) => p.ele === 100)).toBe(true);
  });
  test('nom : celui de la trace, pas celui d\'un point de passage', () => {
    const xml = `<gpx><metadata></metadata><wpt lat="45" lon="6"><name>Boulangerie</name></wpt>
      <trk><name>Tour du lac</name><trkseg><trkpt lat="45" lon="6"/><trkpt lat="45.01" lon="6"/></trkseg></trk></gpx>`;
    expect(parseGpx(xml).name).toBe('Tour du lac');
  });
  test('nom des métadonnées en priorité', () => {
    const xml = `<gpx><metadata><name>Sortie du dimanche</name></metadata>
      <trk><name>Trace 1</name><trkseg><trkpt lat="45" lon="6"/><trkpt lat="45.01" lon="6"/></trkseg></trk></gpx>`;
    expect(parseGpx(xml).name).toBe('Sortie du dimanche');
  });
});

describe('conseil de niveau stable', () => {
  test('pas de changement pour une pente qui oscille autour du seuil', () => {
    expect(adviseLevel(2.2, 3, 3)).toBe(3); // juste au-dessus de 2 % : on garde 3
    expect(adviseLevel(2.6, 3, 3)).toBe(4); // nettement au-dessus : 4
    expect(adviseLevel(1.8, 3, 4)).toBe(4); // juste en dessous : on garde 4
    expect(adviseLevel(1.4, 3, 4)).toBe(3);
    expect(adviseLevel(-2.3, 3, 3)).toBe(3);
    expect(adviseLevel(-2.6, 3, 3)).toBe(2);
  });
  test('sans conseil précédent : niveau direct', () => {
    expect(adviseLevel(2.2, 3, null)).toBe(4);
  });
  test('grand changement de pente : effet immédiat', () => {
    expect(adviseLevel(9, 3, 3)).toBe(7);
  });
});
