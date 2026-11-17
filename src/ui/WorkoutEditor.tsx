import { useEffect, useState } from 'preact/hooks';
import { navigate } from '../app';
import type { StepKind, Workout, WorkoutStep } from '../core/types';
import { KIND_LABELS, expandRepeat, totalDuration } from '../core/workout';
import * as db from '../io/db';
import { fmtDuration } from './format';
import { findWorkout } from './Workouts';
import { WorkoutProfile } from './WorkoutProfile';

const newId = () => globalThis.crypto?.randomUUID?.() ?? `w-${Date.now()}`;
const DEFAULT_STEPS: WorkoutStep[] = [
  { durationS: 600, kind: 'warmup', pct: 55 },
  { durationS: 300, kind: 'work', pct: 90 },
  { durationS: 300, kind: 'cooldown', pct: 50 },
];

/** Saisie « mm:ss » ou minutes. */
function parseDuration(v: string): number | null {
  const m = /^(\d{1,3})(?::(\d{1,2}))?$/.exec(v.trim());
  if (!m) return null;
  const s = Number(m[1]) * 60 + Number(m[2] ?? 0);
  return s > 0 && s <= 4 * 3600 ? s : null;
}

export function WorkoutEditor({ editId, fromId }: { editId?: string; fromId?: string }) {
  const [w, setW] = useState<Workout | null>(null);
  const [repeat, setRepeat] = useState({ n: 4, work: '4:00', workPct: 105, rest: '3:00', restPct: 55 });
  const [err, setErr] = useState('');
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    (async () => {
      if (editId) {
        const found = await findWorkout(editId);
        if (found && !found.builtin) setW(found); else setMissing(true);
      } else if (fromId) {
        const src = await findWorkout(fromId);
        setW({ id: newId(), name: src ? `${src.name} (copie)` : 'Nouvelle séance', steps: src ? src.steps.map((s) => ({ ...s })) : DEFAULT_STEPS });
      } else {
        setW({ id: newId(), name: 'Nouvelle séance', steps: DEFAULT_STEPS.map((s) => ({ ...s })) });
      }
    })();
  }, [editId, fromId]);

  if (missing) return <div><h1>Séance introuvable</h1><a href="#/seances">‹ Séances</a></div>;
  if (!w) return <div><p class="muted">Chargement…</p></div>;
  const pctInput = (v: string, prev: number) => { const p = Math.round(Number(v)); return p >= 20 && p <= 250 ? p : prev; };
  const setStep = (i: number, patch: Partial<WorkoutStep>) => setW({ ...w, steps: w.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const move = (i: number, d: number) => {
    const steps = [...w.steps];
    const j = i + d;
    if (j < 0 || j >= steps.length) return;
    [steps[i], steps[j]] = [steps[j], steps[i]];
    setW({ ...w, steps });
  };

  return (
    <div>
      <a href="#/seances" class="small muted">‹ Séances</a>
      <h1 style="margin-top:6px">{editId ? 'Modifier la séance' : 'Nouvelle séance'}</h1>
      <label>Nom</label>
      <input value={w.name} onInput={(e) => setW({ ...w, name: e.currentTarget.value })} />

      <div class="card" style="margin-top:12px">
        <div class="row small muted" style="margin-bottom:8px"><span>Profil</span><span>{fmtDuration(totalDuration(w.steps))}</span></div>
        <WorkoutProfile steps={w.steps} />
      </div>

      {w.steps.map((s, i) => (
        <div class="card step-edit">
          <div class="row">
            <select value={s.kind} onChange={(e) => setStep(i, { kind: e.currentTarget.value as StepKind })} style="flex:1">
              {(Object.keys(KIND_LABELS) as StepKind[]).map((k) => <option value={k}>{KIND_LABELS[k]}</option>)}
            </select>
            <button class="mini" aria-label="Monter" onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
            <button class="mini" aria-label="Descendre" onClick={() => move(i, 1)} disabled={i === w.steps.length - 1}>↓</button>
          </div>
          <div class="grid2" style="margin-top:8px">
            <div>
              <label style="margin-top:0">Durée (min:s)</label>
              <input inputMode="numeric" value={fmtDuration(s.durationS)} onChange={(e) => {
                const d = parseDuration(e.currentTarget.value);
                if (d) setStep(i, { durationS: d }); else e.currentTarget.value = fmtDuration(s.durationS);
              }} />
            </div>
            <div>
              <label style="margin-top:0">Cible (% FTP)</label>
              <input inputMode="numeric" value={s.pct} onChange={(e) => {
                const p = Number(e.currentTarget.value);
                if (p >= 20 && p <= 250) setStep(i, { pct: Math.round(p) }); else e.currentTarget.value = String(s.pct);
              }} />
            </div>
          </div>
          <div class="row" style="margin-top:8px">
            <button class="mini" onClick={() => setW({ ...w, steps: [...w.steps.slice(0, i + 1), { ...s }, ...w.steps.slice(i + 1)] })}>Dupliquer</button>
            <button class="mini" style="color:var(--bad)" disabled={w.steps.length <= 1} onClick={() => setW({ ...w, steps: w.steps.filter((_, j) => j !== i) })}>Supprimer</button>
          </div>
        </div>
      ))}

      <button class="block" onClick={() => setW({ ...w, steps: [...w.steps, { durationS: 300, kind: 'work', pct: 75 }] })}>+ Ajouter une étape</button>

      <div class="card" style="margin-top:12px">
        <b>Ajouter un bloc répété</b>
        <div class="grid2" style="grid-template-columns:1fr 1fr 1fr">
          <div><label>Répétitions</label><input inputMode="numeric" value={repeat.n} onChange={(e) => setRepeat({ ...repeat, n: Math.min(30, Math.max(1, Number(e.currentTarget.value) || 1)) })} /></div>
          <div><label>Effort</label><input value={repeat.work} onChange={(e) => setRepeat({ ...repeat, work: e.currentTarget.value })} /></div>
          <div><label>% FTP</label><input inputMode="numeric" value={repeat.workPct} onChange={(e) => { const p = pctInput(e.currentTarget.value, repeat.workPct); e.currentTarget.value = String(p); setRepeat({ ...repeat, workPct: p }); }} /></div>
          <div />
          <div><label>Récup</label><input value={repeat.rest} onChange={(e) => setRepeat({ ...repeat, rest: e.currentTarget.value })} /></div>
          <div><label>% FTP</label><input inputMode="numeric" value={repeat.restPct} onChange={(e) => { const p = pctInput(e.currentTarget.value, repeat.restPct); e.currentTarget.value = String(p); setRepeat({ ...repeat, restPct: p }); }} /></div>
        </div>
        <button class="block" onClick={() => {
          const wd = parseDuration(repeat.work), rd = parseDuration(repeat.rest);
          if (!wd || !rd) { setErr('Durées du bloc invalides (format min:s, ex. 4:00).'); return; }
          setErr('');
          // inséré avant le retour au calme s'il est en dernière position
          const last = w.steps[w.steps.length - 1];
          const at = last?.kind === 'cooldown' ? w.steps.length - 1 : w.steps.length;
          const block = expandRepeat({ durationS: wd, kind: 'work', pct: repeat.workPct }, { durationS: rd, kind: 'rest', pct: repeat.restPct }, repeat.n);
          setW({ ...w, steps: [...w.steps.slice(0, at), ...block, ...w.steps.slice(at)] });
        }}>Ajouter {repeat.n} × ({repeat.work} + {repeat.rest})</button>
      </div>

      {err && <p class="small" style="color:var(--bad)">{err}</p>}
      <button class="primary block" onClick={async () => {
        if (!w.name.trim()) { setErr('Donne un nom à la séance.'); return; }
        await db.saveWorkout({ id: w.id, name: w.name.trim(), steps: w.steps });
        navigate('/seances/' + encodeURIComponent(w.id));
      }}>Enregistrer</button>
    </div>
  );
}
