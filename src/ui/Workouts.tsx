import { navigate } from '../app';
import type { Workout } from '../core/types';
import { KIND_LABELS, PRESETS, targetWatts, totalDuration } from '../core/workout';
import * as db from '../io/db';
import { ConfirmButton } from './ConfirmButton';
import { fmtDuration } from './format';
import { useAsync } from './hooks';
import { activeRide, setPendingWorkout } from './ride';
import { WorkoutProfile } from './WorkoutProfile';

export async function findWorkout(id: string): Promise<Workout | undefined> {
  return PRESETS.find((w) => w.id === id) ?? (await db.listWorkouts()).find((w) => w.id === id);
}

function Card({ w }: { w: Workout }) {
  return (
    <a class="card" style="display:block;color:inherit;text-decoration:none" href={'#/seances/' + encodeURIComponent(w.id)}>
      <div class="row"><b>{w.name}</b><span class="muted small">{fmtDuration(totalDuration(w.steps))}</span></div>
      <div style="margin-top:8px"><WorkoutProfile steps={w.steps} height={36} /></div>
    </a>
  );
}

export function WorkoutList() {
  const [mine] = useAsync(() => db.listWorkouts());
  return (
    <div>
      <h1>Séances guidées</h1>
      <p class="small muted" style="margin-top:-8px">L'app te donne la puissance cible et la vitesse à tenir à ton niveau de résistance.</p>
      <button class="primary block" onClick={() => navigate('/seances/nouvelle')}>Créer une séance</button>
      {!!mine?.length && <h2>Mes séances</h2>}
      {mine?.map((w) => <Card w={w} />)}
      <h2>Séances prêtes à l'emploi</h2>
      {PRESETS.map((w) => <Card w={w} />)}
    </div>
  );
}

export function WorkoutDetail({ id }: { id: string }) {
  const [data] = useAsync(async () => ({ w: await findWorkout(id), st: await db.getSettings() }), [id]);
  if (!data) return null;
  const { w, st } = data;
  if (!w) return <div><h1>Séance introuvable</h1><a href="#/seances">Retour</a></div>;
  return (
    <div>
      <a href="#/seances" class="small muted">‹ Séances</a>
      <h1 style="margin-top:6px">{w.name}</h1>
      <div class="card">
        <div class="row small muted" style="margin-bottom:8px"><span>{fmtDuration(totalDuration(w.steps))}</span><span>FTP {st.ftp} W</span></div>
        <WorkoutProfile steps={w.steps} height={70} />
      </div>
      <button class="primary block" disabled={!!activeRide()} onClick={() => { setPendingWorkout(w); navigate('/connexion'); }}>
        {activeRide() ? 'Une séance est déjà en cours' : 'Lancer cette séance'}
      </button>
      <div class="card" style="margin-top:12px">
        {w.steps.map((s, i) => (
          <div class="row small" style="padding:6px 0;border-bottom:1px solid var(--line)">
            <span style="width:22px" class="muted">{i + 1}</span>
            <span style="flex:1">{KIND_LABELS[s.kind]}</span>
            <span style="width:60px;text-align:right">{fmtDuration(s.durationS)}</span>
            <span style="width:90px;text-align:right"><b>{targetWatts(s.pct, st.ftp)} W</b> <span class="muted">{s.pct}%</span></span>
          </div>
        ))}
      </div>
      <div class="grid2">
        <button class="block" onClick={() => navigate('/seances/nouvelle?from=' + encodeURIComponent(w.id))}>{w.builtin ? 'Copier et modifier' : 'Dupliquer'}</button>
        {!w.builtin && <button class="block" onClick={() => navigate('/seances/modifier/' + encodeURIComponent(w.id))}>Modifier</button>}
      </div>
      {!w.builtin && (
        <ConfirmButton class="block" style="background:transparent;color:var(--bad)" confirmLabel="Appuie encore pour supprimer" onConfirm={async () => {
          await db.deleteWorkout(w.id);
          navigate('/seances');
        }}>Supprimer cette séance</ConfirmButton>
      )}
    </div>
  );
}
