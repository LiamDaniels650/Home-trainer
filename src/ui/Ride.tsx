import { useEffect, useState } from 'preact/hooks';
import { navigate } from '../app';
import { hrZone, ZONE_NAMES } from '../core/zones';
import * as db from '../io/db';
import { fmtDuration, fmtKm, fmtNum } from './format';
import { useAsync } from './hooks';
import { activeRide, finishRide } from './ride';
import { ConfirmButton } from './ConfirmButton';
import { KIND_LABELS, powerStatus, speedForPower, targetWatts } from '../core/workout';
import { WorkoutProfile } from './WorkoutProfile';
import type { RideView } from './ride';
import { unlockAudio } from '../io/audio';

function WorkoutPanel({ v, steps, name }: { v: RideView; steps: import('../core/types').WorkoutStep[]; name: string }) {
  if (v.workoutDone) {
    return <div class="card wk"><b>{name} terminée ✓</b><div class="small muted">L'enregistrement continue en roue libre. Touche « Terminer » quand tu veux.</div></div>;
  }
  const pos = v.step;
  if (!pos) return null;
  const target = targetWatts(pos.step.pct, v.ftp);
  const speed = speedForPower(target, v.level, v.calib);
  const status = v.power > 0 ? powerStatus(v.power, target) : 'low';
  const hint = v.paused || v.autoPaused ? 'En pause' : status === 'ok' ? 'Dans la cible' : status === 'low' ? 'Accélère' : 'Ralentis';
  return (
    <div class="card wk">
      <div class="wk-top">
        <span class="wk-name">{KIND_LABELS[pos.step.kind]} <span class="muted small">{pos.index + 1}/{steps.length}</span></span>
        <span class="wk-count">{fmtDuration(pos.remainingS)}</span>
      </div>
      <div class="wk-target">
        <span>Cible <b>{target} W</b> <span class="muted small">{pos.step.pct}% FTP</span></span>
        <span>Vise <b>{fmtNum(speed)}</b> km/h</span>
      </div>
      <div class={'small ' + (v.paused || v.autoPaused ? 'muted' : 'st-' + status)} style="margin-top:4px;font-weight:600">{hint}{!(v.paused || v.autoPaused) && ` (${v.power} W)`}</div>
      <div style="margin-top:8px"><WorkoutProfile steps={steps} current={pos.index} height={30} /></div>
      {pos.next && <div class="small muted" style="margin-top:6px">Ensuite : {KIND_LABELS[pos.next.kind]} {fmtDuration(pos.next.durationS)} à {targetWatts(pos.next.pct, v.ftp)} W</div>}
    </div>
  );
}

export function Ride() {
  const ride = activeRide();
  const [, force] = useState(0);
  const [error, setError] = useState('');
  const [settings] = useAsync(() => db.getSettings());
  useEffect(() => {
    if (!ride) { navigate('/'); return; }
    return ride.subscribe(() => force((n) => n + 1));
  }, [ride]);
  if (!ride) return null;
  const v = ride.view();
  const zone = v.hr != null && settings ? hrZone(v.hr, settings.hrMax) : null;
  const status = v.paused ? 'En pause' : v.autoPaused ? 'Pause auto (roue arrêtée)' : null;

  return (
    <div class="ride">
      {(v.speedState === 'reconnexion' || v.hrState === 'reconnexion') && (
        <div class="banner small">Reconnexion {v.speedState === 'reconnexion' ? 'du capteur de vitesse' : 'de la ceinture'}… l'enregistrement continue.</div>
      )}
      {ride.recorder.workout && <WorkoutPanel v={v} steps={ride.recorder.workout.steps} name={ride.recorder.workout.name} />}
      <div class="ride-time">{fmtDuration(v.elapsedS)}{status && <span class="ride-status">{status}</span>}</div>
      <div class="ride-big">
        <div class="v">{fmtNum(v.speed)}</div><div class="l">km/h</div>
      </div>
      <div class="grid2">
        <div class="card stat big"><div class="v">{fmtKm(v.distanceM)}</div><div class="l">Distance (km)</div></div>
        <div class="card stat big"><div class="v">{v.power}</div><div class="l">Watts (estimés)</div></div>
        <div class="card stat big" style={zone != null ? `border-color:var(--z${zone + 1})` : ''}>
          <div class="v" style={zone != null ? `color:var(--z${zone + 1})` : ''}>{v.hr ?? '–'}</div>
          <div class="l">{zone != null ? ZONE_NAMES[zone] : v.hrState === 'deconnecte' ? 'FC (non connectée)' : 'FC (bpm)'}</div>
        </div>
        <div class="card stat big level">
          <div class="l">Niveau résistance</div>
          <div class="row">
            <button aria-label="Niveau moins" onClick={() => { unlockAudio(); ride.setLevel(v.level - 1); }} disabled={v.level <= 1}>−</button>
            <div class="v">{v.level}</div>
            <button aria-label="Niveau plus" onClick={() => { unlockAudio(); ride.setLevel(v.level + 1); }} disabled={v.level >= 8}>+</button>
          </div>
        </div>
      </div>
      <div class="grid2" style="margin-top:8px">
        <button class="block" onClick={() => { unlockAudio(); ride.togglePause(); }}>{v.paused ? 'Reprendre' : 'Pause'}</button>
        <ConfirmButton class="danger block" confirmLabel="Confirmer la fin" onConfirm={async () => {
          try {
            const s = await finishRide();
            navigate(s ? '/historique/' + s.id : '/');
          } catch (e) {
            setError("La séance n'a pas pu être enregistrée (" + (e as Error).message + '). Elle continue : réessaie « Terminer ».');
          }
        }}>Terminer</ConfirmButton>
      </div>
      {error && <p class="small" style="color:var(--bad)">{error}</p>}
      <a class="small muted" style="display:block;text-align:center;margin-top:14px" href="#/connexion">Capteurs</a>
    </div>
  );
}
