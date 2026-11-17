import * as db from '../io/db';
import { fmtDate, fmtDuration, fmtKm } from './format';
import { useAsync } from './hooks';

export function History() {
  const [sessions] = useAsync(() => db.listSessions());
  if (!sessions) return null;
  return (
    <div>
      <h1>Historique</h1>
      {!sessions.length && <p class="muted">Aucune séance pour l'instant. Lance ta première sortie depuis l'accueil.</p>}
      {sessions.map((s) => (
        <a class="card" style="display:block;color:inherit;text-decoration:none" href={'#/historique/' + s.id}>
          <div class="row">
            <span class="muted small">{fmtDate(s.startedAt)}</span>
            {s.stravaId && <span class="badge">Strava ✓</span>}
          </div>
          <div class="row" style="margin-top:6px">
            <span><b>{fmtDuration(s.summary.durationS)}</b></span>
            <span><b>{fmtKm(s.summary.distanceM)}</b> km</span>
            <span><b>{s.summary.avgPower}</b> W moy.</span>
          </div>
        </a>
      ))}
    </div>
  );
}
