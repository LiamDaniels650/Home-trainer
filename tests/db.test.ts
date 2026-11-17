import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, expect, test } from 'vitest';
import * as db from '../src/io/db';
import type { Draft, Session } from '../src/core/types';

beforeEach(async () => {
  await db._closeForTests();
  globalThis.indexedDB = new IDBFactory();
});

const summary = { durationS: 1, distanceM: 8, avgSpeed: 30, maxSpeed: 30, avgHr: null, maxHr: null, avgPower: 213, maxPower: 213,
  best: { '5': null, '60': null, '300': null, '1200': null }, hrZonesS: [0, 0, 0, 0, 0] };
const sess = (id: string, startedAt: string): Session => ({ id, startedAt, samples: [{ t: 1, distM: 8, speed: 30, hr: null, power: 213, level: 3 }], summary });

test('réglages par défaut', async () => {
  expect(await db.getSettings()).toEqual({ circumferenceMm: 2105, defaultLevel: 3, hrMax: 190, calib: 1, autoPause: true, ftp: 200 });
});

test('réglages : sauvegarde', async () => {
  const s = await db.getSettings();
  await db.saveSettings({ ...s, hrMax: 185 });
  expect((await db.getSettings()).hrMax).toBe(185);
});

test('séances : aller-retour, tri récentes d\'abord, suppression', async () => {
  await db.saveSession(sess('a', '2026-11-01T10:00:00Z'));
  await db.saveSession(sess('b', '2026-11-02T10:00:00Z'));
  expect((await db.listSessions()).map((s) => s.id)).toEqual(['b', 'a']);
  expect(await db.getSession('a')).toEqual(sess('a', '2026-11-01T10:00:00Z'));
  await db.deleteSession('a');
  expect(await db.getSession('a')).toBeUndefined();
});

test('brouillon', async () => {
  const d: Draft = { id: 'x', startedAt: '2026-11-17T10:00:00Z', level: 3, calib: 1, hrMax: 190, autoPause: false, paused: false, samples: [] };
  expect(await db.getDraft()).toBeNull();
  await db.saveDraft(d);
  expect(await db.getDraft()).toEqual(d);
  await db.clearDraft();
  expect(await db.getDraft()).toBeNull();
});

test('export / import sans doublon, sans secrets Strava', async () => {
  const s = await db.getSettings();
  await db.saveSettings({ ...s, strava: { clientId: '123', clientSecret: 'SECRET', accessToken: 'TOK', refreshToken: 'REF', expiresAt: 1 } });
  await db.saveSession(sess('a', '2026-11-01T10:00:00Z'));
  await db.saveSession(sess('b', '2026-11-02T10:00:00Z'));
  const json = await db.exportAll();
  expect(json).not.toContain('SECRET');
  expect(json).not.toContain('TOK');
  expect(json).not.toContain('REF');

  await db._closeForTests();
  globalThis.indexedDB = new IDBFactory();
  expect(await db.importAll(json)).toEqual({ added: 2, skipped: 0 });
  expect(await db.importAll(json)).toEqual({ added: 0, skipped: 2 });
  expect(await db.listSessions()).toHaveLength(2);
});

test('import invalide refusé sans rien modifier', async () => {
  await db.saveSession(sess('a', '2026-11-01T10:00:00Z'));
  await expect(db.importAll('pas du json')).rejects.toThrow(/fichier/i);
  await expect(db.importAll(JSON.stringify({ app: 'autre' }))).rejects.toThrow(/fichier/i);
  await expect(db.importAll(JSON.stringify({ app: 'home-trainer', version: 1, sessions: [{ id: 1 }] }))).rejects.toThrow(/fichier/i);
  expect(await db.listSessions()).toHaveLength(1);
});

test('séances guidées perso : enregistrer, lister, supprimer', async () => {
  const w = { id: 'w1', name: 'Mon fractionné', steps: [{ durationS: 60, kind: 'work' as const, pct: 100 }] };
  await db.saveWorkout(w);
  expect(await db.listWorkouts()).toEqual([w]);
  await db.deleteWorkout('w1');
  expect(await db.listWorkouts()).toEqual([]);
});

test('les séances guidées perso sont dans la sauvegarde', async () => {
  await db.saveWorkout({ id: 'w1', name: 'A', steps: [{ durationS: 60, kind: 'work', pct: 100 }] });
  const json = await db.exportAll();
  await db._closeForTests();
  globalThis.indexedDB = new IDBFactory();
  await db.importAll(json);
  expect((await db.listWorkouts()).map((w) => w.id)).toEqual(['w1']);
});

test('import : le résumé est recalculé à partir des échantillons', async () => {
  const bad = { ...sess('z', '2026-11-03T10:00:00Z'), summary: {} };
  await db.importAll(JSON.stringify({ app: 'home-trainer', version: 1, sessions: [bad] }));
  const s = await db.getSession('z');
  expect(s!.summary.distanceM).toBe(8);
  expect(s!.summary.best).toEqual({ '5': null, '60': null, '300': null, '1200': null });
  expect(s!.summary.hrZonesS).toHaveLength(5);
});

test('import : échantillons invalides refusés', async () => {
  const bad = { ...sess('z', '2026-11-03T10:00:00Z'), samples: [{ t: 'x' }] };
  await expect(db.importAll(JSON.stringify({ app: 'home-trainer', version: 1, sessions: [bad] }))).rejects.toThrow(/fichier/i);
});

test('migration : une base v1 existante garde ses séances', async () => {
  const { openDB } = await import('idb');
  await db._closeForTests();
  globalThis.indexedDB = new IDBFactory();
  const v1 = await openDB('home-trainer', 1, { upgrade(d) { d.createObjectStore('sessions', { keyPath: 'id' }); d.createObjectStore('kv'); } });
  await v1.put('sessions', sess('old', '2026-10-01T10:00:00Z'));
  v1.close();
  expect((await db.listSessions()).map((s) => s.id)).toEqual(['old']);
  expect(await db.listWorkouts()).toEqual([]);
});

test('import : résultats de séance guidée recalculés', async () => {
  const g = { ...sess('g', '2026-11-03T10:00:00Z'), samples: [{ t: 1, distM: 8, speed: 30, hr: 150, power: 220, level: 3, step: 0 }],
    workout: { name: 'W', ftp: 250, steps: [{ durationS: 60, kind: 'work', pct: 90 }], results: 'abîmé' } };
  await db.importAll(JSON.stringify({ app: 'home-trainer', version: 1, sessions: [g] }));
  expect((await db.getSession('g'))!.workout!.results).toEqual([{ durationS: 1, avgPower: 220, avgHr: 150 }]);
});
