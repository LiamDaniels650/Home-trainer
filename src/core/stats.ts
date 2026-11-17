import { BEST_KEYS, type BestKey, type Session, type Totals } from './types';

function startOfWeek(d: Date): Date {
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (s.getDay() + 6) % 7; // lundi = 0
  s.setDate(s.getDate() - dow);
  return s;
}

function total(list: Session[]): Totals {
  return list.reduce((t, s) => ({ count: t.count + 1, durationS: t.durationS + s.summary.durationS, distanceM: t.distanceM + s.summary.distanceM }),
    { count: 0, durationS: 0, distanceM: 0 });
}

export function weeklyTotals(sessions: Session[], now: Date): { week: Totals; month: Totals } {
  const w = startOfWeek(now).getTime();
  const m = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const at = (s: Session) => new Date(s.startedAt).getTime();
  return { week: total(sessions.filter((s) => at(s) >= w)), month: total(sessions.filter((s) => at(s) >= m)) };
}

export type Records = Record<BestKey, { watts: number; sessionId: string } | null>;

export function personalRecords(sessions: Session[]): Records {
  const r = {} as Records;
  for (const k of BEST_KEYS) {
    r[k] = null;
    for (const s of sessions) {
      const w = s.summary.best[k];
      if (w != null && (r[k] == null || w > r[k]!.watts)) r[k] = { watts: w, sessionId: s.id };
    }
  }
  return r;
}
