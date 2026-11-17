import { useEffect, useState } from 'preact/hooks';
import { navigate } from '../app';
import { hrZone, ZONE_NAMES } from '../core/zones';
import * as db from '../io/db';
import { fmtDuration, fmtKm, fmtNum } from './format';
import { useAsync } from './hooks';
import { activeRide, finishRide } from './ride';
import { ConfirmButton } from './ConfirmButton';

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
            <button aria-label="Niveau moins" onClick={() => ride.setLevel(v.level - 1)} disabled={v.level <= 1}>−</button>
            <div class="v">{v.level}</div>
            <button aria-label="Niveau plus" onClick={() => ride.setLevel(v.level + 1)} disabled={v.level >= 8}>+</button>
          </div>
        </div>
      </div>
      <div class="grid2" style="margin-top:8px">
        <button class="block" onClick={() => ride.togglePause()}>{v.paused ? 'Reprendre' : 'Pause'}</button>
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
