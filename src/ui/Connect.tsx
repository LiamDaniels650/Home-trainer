import { useEffect, useState } from 'preact/hooks';
import { navigate } from '../app';
import { getSensors, type SensorKind } from '../io/ble';
import * as db from '../io/db';
import { keepAwake } from '../io/wakelock';
import { useAsync } from './hooks';
import { activeRide, startRide } from './ride';

const LABELS: Record<string, string> = { deconnecte: 'Non connecté', connexion: 'Connexion…', connecte: 'Connecté', reconnexion: 'Reconnexion…' };

function SensorCard({ kind, title, hint }: { kind: SensorKind; title: string; hint: string }) {
  const s = getSensors();
  const state = s.state(kind);
  const [err, setErr] = useState('');
  return (
    <div class="card">
      <div class="row">
        <div>
          <div><b>{title}</b></div>
          <div class="small muted"><span class={'dot ' + state} />{LABELS[state]}{s.deviceName(kind) ? ' · ' + s.deviceName(kind) : ''}</div>
        </div>
        {state === 'deconnecte' ? (
          <button onClick={async () => {
            setErr('');
            try { await s.connect(kind); } catch (e) {
              const msg = (e as Error).message || String(e);
              if (!/cancel/i.test(msg)) setErr(msg);
            }
          }}>Connecter</button>
        ) : (
          <button onClick={() => s.disconnect(kind)}>Déconnecter</button>
        )}
      </div>
      <div class="small muted" style="margin-top:8px">{hint}</div>
      {err && <div class="small" style="color:var(--bad);margin-top:8px">{err}</div>}
    </div>
  );
}

export function Connect() {
  const [, force] = useState(0);
  useEffect(() => getSensors().onState(() => force((n) => n + 1)), []);
  const [draft] = useAsync(() => db.getDraft());
  const speedOk = getSensors().state('speed') !== 'deconnecte';
  const resuming = !!draft && !activeRide();

  return (
    <div>
      <h1>Capteurs</h1>
      <SensorCard kind="speed" title="Capteur de vitesse" hint="Fais tourner la roue arrière pour réveiller le capteur." />
      <SensorCard kind="hr" title="Ceinture cardio" hint="Facultatif. Humidifie les électrodes pour un signal stable." />
      <button class="primary block" disabled={!speedOk} onClick={async () => {
        await keepAwake();
        if (!activeRide()) await startRide(resuming ? draft! : null);
        navigate('/seance');
      }}>{activeRide() ? 'Revenir à la séance' : resuming ? 'Reprendre la séance' : 'Commencer'}</button>
      {!speedOk && <p class="small muted" style="text-align:center">Connecte au moins le capteur de vitesse.</p>}
    </div>
  );
}
