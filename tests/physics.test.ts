import { expect, test } from 'vitest';
import { advanceSpeed, steadySpeed } from '../src/core/physics';

const kmh = (v: number) => v * 3.6;

test('vitesse stabilisée sur le plat : 200 W ≈ 33 km/h pour 80 kg', () => {
  expect(kmh(steadySpeed(200, 0, 80))).toBeGreaterThan(31);
  expect(kmh(steadySpeed(200, 0, 80))).toBeLessThan(36);
});
test('en montée à 8 %, 250 W ≈ 11-13 km/h', () => {
  const v = kmh(steadySpeed(250, 8, 80));
  expect(v).toBeGreaterThan(10.5);
  expect(v).toBeLessThan(13.5);
});
test('plus lourd = plus lent en montée', () => {
  expect(steadySpeed(250, 8, 90)).toBeLessThan(steadySpeed(250, 8, 70));
});
test('inertie : la vitesse converge sans sauter', () => {
  let v = 0;
  const seq: number[] = [];
  for (let i = 0; i < 120; i++) { v = advanceSpeed(v, 200, 0, 80); seq.push(v); }
  expect(seq[0]).toBeLessThan(steadySpeed(200, 0, 80));
  expect(seq[0]).toBeGreaterThan(0);
  expect(seq[119]).toBeCloseTo(steadySpeed(200, 0, 80), 1);
  for (let i = 1; i < seq.length; i++) expect(seq[i]).toBeGreaterThanOrEqual(seq[i - 1] - 1e-9);
});
test('sans pédaler en montée : on s\'arrête, jamais de vitesse négative', () => {
  let v = 5;
  for (let i = 0; i < 60; i++) v = advanceSpeed(v, 0, 6, 80);
  expect(v).toBe(0);
});
test('roue libre en descente : on accélère, plafonné à 90 km/h', () => {
  let v = 5;
  for (let i = 0; i < 30; i++) v = advanceSpeed(v, 0, -6, 80);
  expect(v).toBeGreaterThan(5);
  for (let i = 0; i < 600; i++) v = advanceSpeed(v, 0, -25, 80);
  expect(kmh(v)).toBeLessThanOrEqual(90);
});
