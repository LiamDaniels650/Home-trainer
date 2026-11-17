import { navigate } from '../app';
import { weeklyTotals } from '../core/stats';
import { isBluetoothAvailable, isSimulation } from '../io/ble';
import * as db from '../io/db';
import { fmtDate, fmtDuration, fmtKm } from './format';
import { useAsync } from './hooks';
import { activeRide, finishDraft } from './ride';
import { ConfirmButton } from './ConfirmButton';
import { useState } from 'preact/hooks';

export function Home() {
  const [error, setError] = useState('');
  const [data, reload] = useAsync(async () => ({ draft: await db.getDraft(), sessions: await db.listSessions() }));
  if (!data) return null;
  const { draft, sessions } = data;
  const last = sessions[0];
  const { week } = weeklyTotals(sessions, new Date());
  const riding = activeRide();

  return (
    <div>
      <h1>Home Trainer</h1>
      {!isBluetoothAvailable() && !isSimulation() && (
        <div class="banner">
          <b>Bluetooth indisponible ici.</b>
          <div class="small">Ouvre cette page dans l'app <b>Bluefy</b> sur ton iPhone pour connecter tes capteurs.</div>
        </div>
      )}
      {riding ? (
        <button class="primary block" onClick={() => navigate('/seance')}>Revenir à la séance en cours</button>
      ) : draft ? (
        <div class="banner">
          <b>Une séance n'a pas été terminée</b>
          <div class="small muted">{fmtDate(draft.startedAt)} · {fmtDuration(draft.samples.length)}</div>
          <button class="primary block" onClick={() => navigate('/connexion')}>Reprendre</button>
          <div class="grid2">
            <button class="block" onClick={async () => {
              try {
                const s = await finishDraft(draft);
                if (s) navigate('/historique/' + s.id); else reload();
              } catch (e) {
                setError("Échec de l'enregistrement : " + (e as Error).message);
              }
            }}>Terminer et enregistrer</button>
            <ConfirmButton class="block" confirmLabel="Confirmer" onConfirm={async () => { await db.clearDraft(); reload(); }}>Supprimer</ConfirmButton>
          </div>
          {error && <p class="small" style="color:var(--bad)">{error}</p>}
        </div>
      ) : (
        <button class="primary block" style="padding:20px;font-size:20px" onClick={() => navigate('/connexion')}>Démarrer une séance</button>
      )}

      <h2>Cette semaine</h2>
      <div class="card grid2" style="grid-template-columns:1fr 1fr 1fr">
        <div class="stat"><div class="v">{week.count}</div><div class="l">Séances</div></div>
        <div class="stat"><div class="v">{fmtDuration(week.durationS)}</div><div class="l">Durée</div></div>
        <div class="stat"><div class="v">{fmtKm(week.distanceM, 1)}</div><div class="l">km</div></div>
      </div>

      {last && (
        <>
          <h2>Dernière séance</h2>
          <a class="card" style="display:block;color:inherit;text-decoration:none" href={'#/historique/' + last.id}>
            <div class="muted small">{fmtDate(last.startedAt)}</div>
            <div class="row" style="margin-top:6px">
              <span><b>{fmtDuration(last.summary.durationS)}</b></span>
              <span><b>{fmtKm(last.summary.distanceM)}</b> km</span>
              <span><b>{last.summary.avgPower}</b> W</span>
            </div>
          </a>
        </>
      )}
    </div>
  );
}
