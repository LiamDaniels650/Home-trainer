import { openDB, type IDBPDatabase } from 'idb';
import type { Draft, Session } from '../core/types';

export interface StravaSettings {
  clientId: string;
  clientSecret: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  athleteName?: string;
}

export interface Settings {
  circumferenceMm: number;
  defaultLevel: number;
  hrMax: number;
  calib: number;
  autoPause: boolean;
  strava?: StravaSettings;
  lastSpeedDeviceId?: string;
  lastHrDeviceId?: string;
}

export const DEFAULT_SETTINGS: Settings = { circumferenceMm: 2105, defaultLevel: 3, hrMax: 190, calib: 1, autoPause: true };

let dbp: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  if (!dbp) {
    dbp = openDB('home-trainer', 1, {
      upgrade(d) {
        d.createObjectStore('sessions', { keyPath: 'id' });
        d.createObjectStore('kv');
      },
    });
  }
  return dbp;
}

export async function _closeForTests(): Promise<void> {
  if (dbp) (await dbp).close();
  dbp = null;
}

export async function getSettings(): Promise<Settings> {
  const s = (await (await db()).get('kv', 'settings')) as Partial<Settings> | undefined;
  return { ...DEFAULT_SETTINGS, ...s };
}

export async function saveSettings(s: Settings): Promise<void> {
  await (await db()).put('kv', s, 'settings');
}

export async function saveSession(s: Session): Promise<void> {
  await (await db()).put('sessions', s);
}

export async function listSessions(): Promise<Session[]> {
  const all = (await (await db()).getAll('sessions')) as Session[];
  return all.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export async function getSession(id: string): Promise<Session | undefined> {
  return (await (await db()).get('sessions', id)) as Session | undefined;
}

export async function deleteSession(id: string): Promise<void> {
  await (await db()).delete('sessions', id);
}

export async function saveDraft(d: Draft): Promise<void> {
  await (await db()).put('kv', d, 'draft');
}

export async function getDraft(): Promise<Draft | null> {
  return ((await (await db()).get('kv', 'draft')) as Draft | undefined) ?? null;
}

export async function clearDraft(): Promise<void> {
  await (await db()).delete('kv', 'draft');
}

/** Sauvegarde complète en JSON. Les identifiants et jetons Strava n'y figurent jamais. */
export async function exportAll(): Promise<string> {
  const { strava: _omit, lastHrDeviceId: _h, lastSpeedDeviceId: _s, ...settings } = await getSettings();
  return JSON.stringify({ app: 'home-trainer', version: 1, exportedAt: new Date().toISOString(), settings, sessions: await listSessions() });
}

const BAD_FILE = "Ce fichier n'est pas une sauvegarde valide de l'app Home Trainer.";

function isSession(x: unknown): x is Session {
  const s = x as Session;
  return !!s && typeof s.id === 'string' && typeof s.startedAt === 'string' && Array.isArray(s.samples) && typeof s.summary === 'object' && s.summary !== null;
}

/** Importe une sauvegarde. Les séances déjà présentes (même id) sont ignorées. */
export async function importAll(json: string): Promise<{ added: number; skipped: number }> {
  let data: { app?: string; version?: number; sessions?: unknown[] };
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error(BAD_FILE);
  }
  if (!data || data.app !== 'home-trainer' || !Array.isArray(data.sessions) || !data.sessions.every(isSession)) {
    throw new Error(BAD_FILE);
  }
  const d = await db();
  const tx = d.transaction('sessions', 'readwrite');
  let added = 0, skipped = 0;
  for (const s of data.sessions as Session[]) {
    if (await tx.store.get(s.id)) skipped++;
    else { await tx.store.put(s); added++; }
  }
  await tx.done;
  return { added, skipped };
}
