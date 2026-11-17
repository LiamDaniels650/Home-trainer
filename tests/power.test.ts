import { expect, test } from 'vitest';
import { bestAverage, estimatePower } from '../src/core/power';

test('niveau 8 à 40 km/h ≈ 690 W', () => {
  const p = estimatePower(40, 8);
  expect(p).toBeGreaterThanOrEqual(685);
  expect(p).toBeLessThanOrEqual(695);
});
test('niveau 3 à 30 km/h = 213 W', () => { expect(estimatePower(30, 3)).toBe(213); });
test('vitesse nulle = 0 W', () => { expect(estimatePower(0, 3)).toBe(0); });
test('facteur de calibration', () => { expect(estimatePower(30, 3, 1.1)).toBe(234); });
test('niveau borné à 1..8', () => {
  expect(estimatePower(30, 12)).toBe(estimatePower(30, 8));
  expect(estimatePower(30, 0)).toBe(estimatePower(30, 1));
});
test('meilleure moyenne glissante', () => { expect(bestAverage([100, 200, 300, 100], 2)).toBe(250); });
test('série trop courte = null', () => { expect(bestAverage([1], 5)).toBeNull(); });
