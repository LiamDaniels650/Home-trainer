import { describe, expect, test } from 'vitest';
import { Recorder, summarize } from '../src/core/recorder';
import { hrZone } from '../src/core/zones';
import type { Sample } from '../src/core/types';

const opts = { startedAt: new Date('2026-11-17T18:00:00Z'), level: 3, calib: 1, hrMax: 190, autoPause: false };
// 30 km/h = 8.3333 m/s
const V = 30, STEP = 30 / 3.6;

function ride(r: Recorder, n: number, from = 0, hr: number | null = 140) {
  for (let i = 1; i <= n; i++) r.tick({ distM: (from + i) * STEP, speed: V, hr });
}

describe('Recorder', () => {
  test('1 échantillon par tick, puissance estimée', () => {
    const r = new Recorder(opts);
    ride(r, 10);
    expect(r.samples).toHaveLength(10);
    expect(r.samples.map((s) => s.t)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(r.samples[0].power).toBe(213);
    expect(r.samples[9].distM).toBeCloseTo(10 * STEP, 6);
  });
  test('pause : aucun échantillon et la distance roulée pendant la pause ne compte pas', () => {
    const r = new Recorder(opts);
    ride(r, 5);
    r.pause();
    expect(r.paused).toBe(true);
    ride(r, 3, 5);
    expect(r.samples).toHaveLength(5);
    r.resume();
    ride(r, 1, 8);
    expect(r.samples).toHaveLength(6);
    expect(r.samples[5].t).toBe(6);
    expect(r.samples[5].distM).toBeCloseTo(6 * STEP, 6);
  });
  test('pause automatique quand la vitesse est nulle', () => {
    const r = new Recorder({ ...opts, autoPause: true });
    ride(r, 2);
    r.tick({ distM: 2 * STEP, speed: 0, hr: 120 });
    r.tick({ distM: 2 * STEP, speed: 0, hr: 120 });
    expect(r.samples).toHaveLength(2);
    expect(r.autoPaused).toBe(true);
    ride(r, 1, 2);
    expect(r.samples).toHaveLength(3);
    expect(r.autoPaused).toBe(false);
  });
  test('sans pause automatique, vitesse nulle = échantillon à 0', () => {
    const r = new Recorder(opts);
    r.tick({ distM: 0, speed: 0, hr: null });
    expect(r.samples).toEqual([{ t: 1, distM: 0, speed: 0, hr: null, power: 0, level: 3 }]);
  });
  test('changement de niveau', () => {
    const r = new Recorder(opts);
    ride(r, 1);
    r.setLevel(5);
    ride(r, 1, 1);
    expect(r.samples.map((s) => s.level)).toEqual([3, 5]);
    expect(r.samples[1].power).toBeGreaterThan(r.samples[0].power);
  });
  test('brouillon : sauvegarde et restauration', () => {
    const r = new Recorder(opts);
    ride(r, 4);
    r.setLevel(4);
    const back = Recorder.restore(JSON.parse(JSON.stringify(r.toDraft())));
    expect(back.samples).toEqual(r.samples);
    // nouveau capteur après rechargement : la distance repart de 0 côté capteur
    back.tick({ distM: STEP, speed: V, hr: 140 });
    expect(back.samples[4].distM).toBeCloseTo(5 * STEP, 6);
    expect(back.samples[4].level).toBe(4);
    expect(back.samples[4].t).toBe(5);
    expect(back.finish().id).toBe(r.toDraft().id);
  });
  test('finish produit une séance avec résumé', () => {
    const r = new Recorder(opts);
    ride(r, 10);
    const s = r.finish();
    expect(s.startedAt).toBe('2026-11-17T18:00:00.000Z');
    expect(s.summary.durationS).toBe(10);
    expect(s.summary.distanceM).toBeCloseTo(10 * STEP, 6);
  });
});

describe('zones et résumé', () => {
  test('zones FC', () => {
    expect(hrZone(150, 190)).toBe(2);
    expect(hrZone(100, 190)).toBe(0);
    expect(hrZone(180, 190)).toBe(4);
  });
  test('summarize', () => {
    const samples: Sample[] = [
      { t: 1, distM: 10, speed: 36, hr: 100, power: 100, level: 3 },
      { t: 2, distM: 20, speed: 36, hr: null, power: 300, level: 3 },
      { t: 3, distM: 30, speed: 40, hr: 180, power: 200, level: 3 },
    ];
    const s = summarize(samples, 190);
    expect(s.durationS).toBe(3);
    expect(s.distanceM).toBe(30);
    expect(s.avgSpeed).toBeCloseTo(36, 6);
    expect(s.maxSpeed).toBe(40);
    expect(s.avgHr).toBe(140);
    expect(s.maxHr).toBe(180);
    expect(s.avgPower).toBe(200);
    expect(s.maxPower).toBe(300);
    expect(s.best).toEqual({ '5': null, '60': null, '300': null, '1200': null });
    expect(s.hrZonesS).toEqual([1, 0, 0, 0, 1]);
  });
  test('summarize sans FC ni échantillon', () => {
    const s = summarize([], 190);
    expect(s.durationS).toBe(0);
    expect(s.avgHr).toBeNull();
    expect(s.avgSpeed).toBe(0);
  });
});

describe('corrections relecture', () => {
  test('capteur en reconnexion : pas de pause auto, le temps continue', () => {
    const r = new Recorder({ ...opts, autoPause: true });
    ride(r, 2);
    r.tick({ distM: 2 * STEP, speed: 0, hr: 140, sensorLost: true });
    r.tick({ distM: 2 * STEP, speed: 0, hr: 140, sensorLost: true });
    expect(r.autoPaused).toBe(false);
    expect(r.samples).toHaveLength(4);
    expect(r.samples[3]).toMatchObject({ t: 4, speed: 0, power: 0 });
  });
  test('FC à 0 (ceinture sans contact) = pas de donnée', () => {
    const r = new Recorder(opts);
    r.tick({ distM: STEP, speed: V, hr: 0 });
    expect(r.samples[0].hr).toBeNull();
  });
});

describe('séance guidée', () => {
  const workout = { id: 'w', name: 'Test', steps: [
    { durationS: 2, kind: 'warmup' as const, pct: 50 },
    { durationS: 3, kind: 'work' as const, pct: 100 },
  ] };
  test("chaque échantillon porte l'étape ; au-delà, roue libre sans étape", () => {
    const r = new Recorder({ ...opts, workout, ftp: 250 });
    ride(r, 7);
    expect(r.samples.map((s) => s.step)).toEqual([0, 0, 1, 1, 1, undefined, undefined]);
  });
  test('la pause ne fait pas avancer les étapes', () => {
    const r = new Recorder({ ...opts, workout, ftp: 250 });
    ride(r, 1);
    r.pause();
    ride(r, 5, 1);
    r.resume();
    ride(r, 1, 6);
    expect(r.samples.map((s) => s.step)).toEqual([0, 0]);
  });
  test('brouillon et séance finale gardent la séance guidée et les résultats', () => {
    const r = new Recorder({ ...opts, workout, ftp: 250 });
    ride(r, 3);
    const back = Recorder.restore(JSON.parse(JSON.stringify(r.toDraft())));
    expect(back.workout?.name).toBe('Test');
    ride(back, 1, 3);
    expect(back.samples[3].step).toBe(1);
    const s = back.finish();
    expect(s.workout).toMatchObject({ name: 'Test', ftp: 250, steps: workout.steps });
    expect(s.workout!.results).toEqual([
      { durationS: 2, avgPower: 213, avgHr: 140 },
      { durationS: 2, avgPower: 213, avgHr: 140 },
    ]);
  });
  test('sans séance guidée : pas de champ workout', () => {
    const r = new Recorder(opts);
    ride(r, 1);
    expect(r.finish().workout).toBeUndefined();
    expect(r.samples[0].step).toBeUndefined();
  });
});
