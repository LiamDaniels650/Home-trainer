import { expect, test } from 'vitest';
import { personalRecords, weeklyTotals } from '../src/core/stats';
import type { Session } from '../src/core/types';

function sess(id: string, startedAt: string, durationS: number, distanceM: number, best5: number | null): Session {
  return {
    id, startedAt, samples: [],
    summary: { durationS, distanceM, avgSpeed: 0, maxSpeed: 0, avgHr: null, maxHr: null, avgPower: 0, maxPower: 0,
      best: { '5': best5, '60': null, '300': null, '1200': null }, hrZonesS: [0, 0, 0, 0, 0] },
  };
}

test('totaux semaine (depuis lundi) et mois', () => {
  // mardi 17 novembre 2026, heure locale
  const now = new Date(2026, 10, 17, 20, 0);
  const list = [
    sess('a', new Date(2026, 10, 16, 8, 0).toISOString(), 3600, 30000, null), // lundi
    sess('b', new Date(2026, 10, 15, 8, 0).toISOString(), 1800, 15000, null), // dimanche (semaine passée)
    sess('c', new Date(2026, 9, 30, 8, 0).toISOString(), 1000, 5000, null), // octobre
  ];
  const t = weeklyTotals(list, now);
  expect(t.week).toEqual({ count: 1, durationS: 3600, distanceM: 30000 });
  expect(t.month).toEqual({ count: 2, durationS: 5400, distanceM: 45000 });
});

test('records : meilleure valeur toutes séances', () => {
  const r = personalRecords([sess('a', '2026-11-01T00:00:00Z', 1, 1, 300), sess('b', '2026-11-02T00:00:00Z', 1, 1, 450), sess('c', '2026-11-03T00:00:00Z', 1, 1, null)]);
  expect(r['5']).toEqual({ watts: 450, sessionId: 'b' });
  expect(r['60']).toBeNull();
});
