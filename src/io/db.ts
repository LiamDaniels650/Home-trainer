import { openDB, type IDBPDatabase } from 'idb';
import { summarize } from '../core/recorder';
import { stepResults } from '../core/workout';
import type { Draft, Sample, Session, Workout } from '../core/types';

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
  /** puissance au seuil (W), pour les cibles des séances guidées */
  ftp: number;
  strava?: StravaSettings;
  lastSpeedDeviceId?: string;
  lastHrDeviceId?: string;
}

export const DEFAULT_SETTINGS: Settings = { circumferenceMm: 2105, defaultLevel: 3, hrMax: 190, calib: 1, autoPause: true, ftp: 200 };

let dbp: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  if (!dbp) {
    dbp = openDB('home-trainer', 2, {
      upgrade(d, oldVersion) {
        if (oldVersion < 1) {
          d.createObjectStore('sessions', { keyPath: 'id' });
          d.createObjectStore('kv');
        }
        if (oldVersion < 2) d.createObjectStore('workouts', { keyPath: 'id' });
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

export async function saveWorkout(w: Workout): Promise<void> {
  await (await db()).put('workouts', w);
}

export async function listWorkouts(): Promise<Workout[]> {
  const all = (await (await db()).getAll('workouts')) as Workout[];
  return all.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

export async function deleteWorkout(id: string): Promise<void> {
  await (await db()).delete('workouts', id);
}

/** Sauvegarde complète en JSON. Les identifiants et jetons Strava n'y figurent jamais. */
export async function exportAll(): Promise<string> {
  const { strava: _omit, lastHrDeviceId: _h, lastSpeedDeviceId: _s, ...settings } = await getSettings();
  return JSON.stringify({ app: 'home-trainer', version: 1, exportedAt: new Date().toISOString(), settings, sessions: await listSessions(), workouts: await listWorkouts() });
}

const BAD_FILE = "Ce fichier n'est pas une sauvegarde valide de l'app Home Trainer.";

const isNum = (v: unknown) => typeof v === 'number' && Number.isFinite(v);

function isSample(x: unknown): x is Sample {
  const p = x as Sample;
  return !!p && isNum(p.t) && isNum(p.distM) && isNum(p.speed) && isNum(p.power) && isNum(p.level) && (p.hr === null || isNum(p.hr));
}

function isSession(x: unknown): x is Session {
  const s = x as Session;
  return !!s && typeof s.id === 'string' && typeof s.startedAt === 'string' && !Number.isNaN(Date.parse(s.startedAt))
    && Array.isArray(s.samples) && s.samples.every(isSample);
}

function isWorkout(x: unknown): x is Workout {
  const w = x as Workout;
  return !!w && typeof w.id === 'string' && typeof w.name === 'string' && Array.isArray(w.steps)
    && w.steps.every((st) => isNum(st.durationS) && isNum(st.pct) && typeof st.kind === 'string');
}

/** Importe une sauvegarde. Les séances déjà présentes (même id) sont ignorées. */
export async function importAll(json: string): Promise<{ added: number; skipped: number }> {
  let data: { app?: string; version?: number; sessions?: unknown[]; workouts?: unknown[]; settings?: { hrMax?: number } };
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error(BAD_FILE);
  }
  if (!data || data.app !== 'home-trainer' || !Array.isArray(data.sessions) || !data.sessions.every(isSession)
    || (data.workouts !== undefined && !(Array.isArray(data.workouts) && data.workouts.every(isWorkout)))) {
    throw new Error(BAD_FILE);
  }
  const hrMax = isNum(data.settings?.hrMax) ? data.settings!.hrMax! : (await getSettings()).hrMax;
  const d = await db();
  const tx = d.transaction(['sessions', 'workouts'], 'readwrite');
  const sessions = tx.objectStore('sessions');
  let added = 0, skipped = 0;
  for (const s of data.sessions as Session[]) {
    if (await sessions.get(s.id)) { skipped++; continue; }
    // Le résumé est toujours recalculé : un résumé abîmé ne peut pas casser les écrans.
    const summary = summarize(s.samples, hrMax);
    const clean: Session = { id: s.id, startedAt: s.startedAt, samples: s.samples, summary };
    if (isNum(s.stravaId)) clean.stravaId = s.stravaId;
    if (s.workout && isWorkout({ id: 'x', ...s.workout }) && isNum(s.workout.ftp)) {
      clean.workout = { name: s.workout.name, ftp: s.workout.ftp, steps: s.workout.steps, results: stepResults(s.samples, s.workout.steps) };
    }
    await sessions.put(clean);
    added++;
  }
  const workouts = tx.objectStore('workouts');
  for (const w of (data.workouts ?? []) as Workout[]) {
    if (!(await workouts.get(w.id))) await workouts.put(w);
  }
  await tx.done;
  return { added, skipped };
}
