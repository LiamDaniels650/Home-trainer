import { beforeEach, expect, test, vi } from 'vitest';

const store = vi.hoisted(() => ({ draft: null as unknown, sessions: [] as unknown[], failSave: false, released: 0 }));

vi.mock('../src/io/db', () => ({
  getSettings: async () => ({ circumferenceMm: 2105, defaultLevel: 3, hrMax: 190, calib: 1, autoPause: false }),
  saveDraft: async (d: unknown) => { store.draft = d; },
  clearDraft: async () => { store.draft = null; },
  saveSession: async (s: unknown) => { if (store.failSave) throw new Error('quota'); store.sessions.push(s); },
}));
vi.mock('../src/io/ble', () => ({
  getSensors: () => ({ onCsc: () => () => {}, onHr: () => () => {}, onState: () => () => {}, state: () => 'connecte' }),
}));
vi.mock('../src/io/wakelock', () => ({ releaseAwake: () => { store.released++; } }));

import { activeRide, finishDraft, finishRide, startRide } from '../src/ui/ride';
import type { Draft } from '../src/core/types';

const sample = { t: 1, distM: 8, speed: 30, hr: 140, power: 213, level: 3 };
const draft: Draft = { id: 'd1', startedAt: '2026-11-17T18:00:00.000Z', level: 3, calib: 1, hrMax: 190, autoPause: false, paused: false, samples: [sample] };

beforeEach(() => {
  Object.assign(store, { draft: null, sessions: [], failSave: false, released: 0 });
  vi.stubGlobal('document', { addEventListener() {}, removeEventListener() {}, visibilityState: 'visible' });
  vi.stubGlobal('addEventListener', () => {});
  vi.stubGlobal('removeEventListener', () => {});
});

test("finishDraft : si l'enregistrement échoue, le brouillon est conservé", async () => {
  store.draft = draft;
  store.failSave = true;
  await expect(finishDraft(draft)).rejects.toThrow('quota');
  expect(store.draft).toEqual(draft);
});

test("finishRide : si l'enregistrement échoue, la séance reste active et le brouillon est conservé", async () => {
  await startRide(draft);
  store.failSave = true;
  await expect(finishRide()).rejects.toThrow('quota');
  expect(activeRide()).not.toBeNull();
  expect(store.draft).not.toBeNull();
  store.failSave = false;
  const s = await finishRide();
  expect(s!.id).toBe('d1');
  expect(store.draft).toBeNull();
  expect(activeRide()).toBeNull();
});

test("finishRide libère l'écran (veille autorisée)", async () => {
  await startRide(draft);
  await finishRide();
  expect(store.released).toBe(1);
});
