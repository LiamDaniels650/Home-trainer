import { A, C, levelMultiplier } from './power';
import type { Sample, StepKind, StepResult, Workout, WorkoutStep } from './types';

export const KIND_LABELS: Record<StepKind, string> = {
  warmup: 'Échauffement', work: 'Effort', rest: 'Récupération', cooldown: 'Retour au calme',
};

export function totalDuration(steps: WorkoutStep[]): number {
  return steps.reduce((a, s) => a + s.durationS, 0);
}

export interface StepPosition {
  index: number;
  step: WorkoutStep;
  remainingS: number;
  next: WorkoutStep | null;
}

/** Étape en cours après `elapsedS` secondes actives ; null quand la séance est finie. */
export function stepAt(steps: WorkoutStep[], elapsedS: number): StepPosition | null {
  let start = 0;
  for (let i = 0; i < steps.length; i++) {
    const end = start + steps[i].durationS;
    if (elapsedS < end) return { index: i, step: steps[i], remainingS: end - elapsedS, next: steps[i + 1] ?? null };
    start = end;
  }
  return null;
}

export function targetWatts(pct: number, ftp: number): number {
  return Math.round((pct / 100) * ftp);
}

/** Vitesse (km/h) à tenir pour produire `watts` au niveau donné (inverse de estimatePower). */
export function speedForPower(watts: number, level: number, calib: number): number {
  if (!(watts > 0)) return 0;
  const k = watts / (calib * levelMultiplier(level));
  return (-A + Math.sqrt(A * A + 4 * C * k)) / (2 * C);
}

export type PowerStatus = 'ok' | 'low' | 'high';

/** Écart à la cible : ±5 % = ok. */
export function powerStatus(actual: number, target: number): PowerStatus {
  const r = actual / target;
  if (r < 0.95 - 1e-9) return 'low';
  if (r > 1.05 + 1e-9) return 'high';
  return 'ok';
}

export function suggestFtp(best20min: number | null): number | null {
  return best20min == null ? null : Math.round(0.95 * best20min);
}

export function expandRepeat(work: WorkoutStep, rest: WorkoutStep, n: number): WorkoutStep[] {
  return Array.from({ length: n }, () => [{ ...work }, { ...rest }]).flat();
}

export function stepResults(samples: Sample[], steps: WorkoutStep[]): StepResult[] {
  return steps.map((_, i) => {
    const ss = samples.filter((s) => s.step === i);
    const hrs = ss.map((s) => s.hr).filter((h): h is number => h != null);
    const avg = (a: number[]) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null);
    return { durationS: ss.length, avgPower: avg(ss.map((s) => s.power)), avgHr: avg(hrs) };
  });
}

const m = (min: number) => min * 60;
const st = (min: number, kind: StepKind, pct: number): WorkoutStep => ({ durationS: m(min), kind, pct });

export const PRESETS: Workout[] = [
  { id: 'preset-decouverte', builtin: true, name: 'Découverte 30 min', steps: [
    st(5, 'warmup', 50), ...expandRepeat(st(1, 'work', 100), st(2, 'rest', 55), 6), st(7, 'cooldown', 50)] },
  { id: 'preset-endurance', builtin: true, name: 'Endurance 45 min', steps: [
    st(10, 'warmup', 55), st(30, 'work', 65), st(5, 'cooldown', 50)] },
  { id: 'preset-tempo', builtin: true, name: 'Tempo 3 × 12 min', steps: [
    st(10, 'warmup', 55), ...expandRepeat(st(12, 'work', 82), st(4, 'rest', 55), 3), st(6, 'cooldown', 50)] },
  { id: 'preset-sweetspot', builtin: true, name: 'Sweet spot 3 × 10 min', steps: [
    st(10, 'warmup', 55), ...expandRepeat(st(10, 'work', 90), st(5, 'rest', 55), 3), st(5, 'cooldown', 50)] },
  { id: 'preset-seuil', builtin: true, name: 'Seuil 2 × 20 min', steps: [
    st(10, 'warmup', 55), ...expandRepeat(st(20, 'work', 97), st(5, 'rest', 55), 2), st(5, 'cooldown', 50)] },
  { id: 'preset-vo2', builtin: true, name: 'VO2 max 5 × 3 min', steps: [
    st(10, 'warmup', 55), ...expandRepeat(st(3, 'work', 115), st(3, 'rest', 50), 5), st(7, 'cooldown', 50)] },
  { id: 'preset-pyramide', builtin: true, name: 'Pyramide', steps: [
    st(10, 'warmup', 55),
    st(1, 'work', 90), st(1, 'rest', 50), st(2, 'work', 100), st(2, 'rest', 50), st(3, 'work', 110), st(3, 'rest', 50),
    st(2, 'work', 100), st(2, 'rest', 50), st(1, 'work', 90), st(1, 'rest', 50),
    st(5, 'cooldown', 50)] },
];
