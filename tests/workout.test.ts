import { describe, expect, test } from 'vitest';
import { estimatePower } from '../src/core/power';
import {
  PRESETS, expandRepeat, powerStatus, speedForPower, stepAt, stepResults, suggestFtp, targetWatts, totalDuration,
} from '../src/core/workout';
import type { Sample, WorkoutStep } from '../src/core/types';

const steps: WorkoutStep[] = [
  { durationS: 60, kind: 'warmup', pct: 50 },
  { durationS: 30, kind: 'work', pct: 100 },
  { durationS: 30, kind: 'rest', pct: 50 },
];

describe('stepAt', () => {
  test('début', () => { expect(stepAt(steps, 0)).toMatchObject({ index: 0, remainingS: 60, next: steps[1] }); });
  test('fin de la première étape', () => { expect(stepAt(steps, 59)).toMatchObject({ index: 0, remainingS: 1 }); });
  test('changement d\'étape', () => { expect(stepAt(steps, 60)).toMatchObject({ index: 1, remainingS: 30 }); });
  test('dernière étape : pas de suivante', () => { expect(stepAt(steps, 100)).toMatchObject({ index: 2, remainingS: 20, next: null }); });
  test('séance terminée', () => { expect(stepAt(steps, 120)).toBeNull(); });
  test('durée totale', () => { expect(totalDuration(steps)).toBe(120); });
});

describe('cibles', () => {
  test('watts depuis % FTP', () => { expect(targetWatts(88, 250)).toBe(220); });
  test('vitesse à tenir = inverse de la puissance estimée', () => {
    const v = speedForPower(213, 3, 1);
    expect(v).toBeCloseTo(30, 0);
    expect(estimatePower(v, 3, 1)).toBeCloseTo(213, -0.5);
  });
  test('vitesse à tenir avec calibration', () => {
    const v = speedForPower(250, 5, 1.1);
    expect(Math.abs(estimatePower(v, 5, 1.1) - 250)).toBeLessThanOrEqual(1);
  });
  test('vitesse à tenir pour 0 W = 0', () => { expect(speedForPower(0, 3, 1)).toBe(0); });
  test('statut de puissance ±5 %', () => {
    expect(powerStatus(200, 200)).toBe('ok');
    expect(powerStatus(190, 200)).toBe('ok');
    expect(powerStatus(189, 200)).toBe('low');
    expect(powerStatus(211, 200)).toBe('high');
  });
  test('FTP suggérée = 95 % du record 20 min', () => {
    expect(suggestFtp(240)).toBe(228);
    expect(suggestFtp(null)).toBeNull();
  });
});

test('répéter un bloc effort + récup', () => {
  const r = expandRepeat({ durationS: 240, kind: 'work', pct: 110 }, { durationS: 180, kind: 'rest', pct: 55 }, 3);
  expect(r).toHaveLength(6);
  expect(r.map((s) => s.kind)).toEqual(['work', 'rest', 'work', 'rest', 'work', 'rest']);
});

test('résultats par étape', () => {
  const mk = (t: number, step: number, power: number, hr: number | null): Sample => ({ t, distM: t, speed: 30, hr, power, level: 3, step });
  const samples = [mk(1, 0, 100, 120), mk(2, 0, 120, null), mk(3, 1, 300, 160), mk(4, 1, 310, 170)];
  expect(stepResults(samples, steps)).toEqual([
    { durationS: 2, avgPower: 110, avgHr: 120 },
    { durationS: 2, avgPower: 305, avgHr: 165 },
    { durationS: 0, avgPower: null, avgHr: null },
  ]);
});

test('séances prêtes à l\'emploi valides', () => {
  expect(PRESETS.length).toBeGreaterThanOrEqual(6);
  for (const w of PRESETS) {
    expect(w.builtin).toBe(true);
    expect(w.steps.length).toBeGreaterThan(0);
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
    for (const s of w.steps) { expect(s.durationS).toBeGreaterThan(0); expect(s.pct).toBeGreaterThan(0); }
  }
});
