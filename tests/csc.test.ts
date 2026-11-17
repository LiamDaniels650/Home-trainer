import { describe, expect, test } from 'vitest';
import { parseCsc, WheelTracker } from '../src/core/csc';

const dv = (bytes: number[]) => new DataView(new Uint8Array(bytes).buffer);

describe('parseCsc', () => {
  test('décode les données de roue', () => {
    expect(parseCsc(dv([0x01, 0x0a, 0, 0, 0, 0x00, 0x04]))).toEqual({ wheelRevs: 10, wheelTime: 1024 });
  });
  test('décode roue + pédalier', () => {
    expect(parseCsc(dv([0x03, 1, 0, 0, 0, 2, 0, 3, 0, 4, 0]))).toEqual({ wheelRevs: 1, wheelTime: 2, crankRevs: 3, crankTime: 4 });
  });
  test('pédalier seul', () => {
    expect(parseCsc(dv([0x02, 5, 0, 6, 0]))).toEqual({ crankRevs: 5, crankTime: 6 });
  });
});

describe('WheelTracker', () => {
  test('distance et vitesse à partir des tours', () => {
    const t = new WheelTracker(2105);
    t.update(0, 0, 0);
    t.update(4, 1024, 1000);
    expect(t.distanceM()).toBeCloseTo(8.42, 5);
    expect(t.speedKmh(1000)).toBeCloseTo(30.312, 2);
  });
  test('rebouclage du temps uint16', () => {
    const t = new WheelTracker(2105);
    t.update(0, 65024, 0);
    t.update(4, 512, 1000);
    expect(t.speedKmh(1000)).toBeCloseTo(30.312, 2);
  });
  test('rebouclage des tours uint32', () => {
    const t = new WheelTracker(2105);
    t.update(4294967294, 0, 0);
    t.update(2, 1024, 1000);
    expect(t.distanceM()).toBeCloseTo(8.42, 5);
  });
  test('paquet répété : vitesse conservée puis 0 après 3 s', () => {
    const t = new WheelTracker(2105);
    t.update(0, 0, 0);
    t.update(4, 1024, 1000);
    t.update(4, 1024, 2500);
    expect(t.speedKmh(2500)).toBeCloseTo(30.312, 2);
    t.update(4, 1024, 4001);
    expect(t.speedKmh(4001)).toBe(0);
    expect(t.distanceM()).toBeCloseTo(8.42, 5);
  });
  test('reset : le premier paquet suivant sert de référence', () => {
    const t = new WheelTracker(2105);
    t.update(0, 0, 0);
    t.update(4, 1024, 1000);
    t.reset();
    t.update(1000, 5000, 5000);
    expect(t.distanceM()).toBeCloseTo(8.42, 5);
    t.update(1001, 6024, 6000);
    expect(t.distanceM()).toBeCloseTo(8.42 + 2.105, 5);
  });
  test('saut aberrant > 100 tours ignoré', () => {
    const t = new WheelTracker(2105);
    t.update(0, 0, 0);
    t.update(500, 1024, 1000);
    expect(t.distanceM()).toBe(0);
  });
  test('aucune donnée : vitesse 0', () => {
    expect(new WheelTracker(2105).speedKmh(0)).toBe(0);
  });
});
