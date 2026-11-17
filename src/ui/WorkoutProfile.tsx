import type { WorkoutStep } from '../core/types';
import { totalDuration } from '../core/workout';

export function pctColor(pct: number): string {
  if (pct < 60) return 'var(--z1)';
  if (pct < 76) return 'var(--z2)';
  if (pct < 90) return 'var(--z3)';
  if (pct < 105) return 'var(--z4)';
  return 'var(--z5)';
}

/** Profil de la séance : une barre par étape (largeur = durée, hauteur = intensité). */
export function WorkoutProfile({ steps, current, height = 56 }: { steps: WorkoutStep[]; current?: number; height?: number }) {
  const total = totalDuration(steps) || 1;
  const max = Math.max(120, ...steps.map((s) => s.pct));
  return (
    <div style={`display:flex;align-items:flex-end;gap:1px;height:${height}px`}>
      {steps.map((s, i) => (
        <div style={`flex:${s.durationS / total};height:${(100 * s.pct) / max}%;background:${pctColor(s.pct)};border-radius:2px 2px 0 0;opacity:${current == null || current === i ? 1 : 0.35}`} />
      ))}
    </div>
  );
}
