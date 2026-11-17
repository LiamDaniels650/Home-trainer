import { personalRecords, weeklyTotals } from '../core/stats';
import type { Session, Totals } from '../core/types';
import * as db from '../io/db';
import { fmtDuration, fmtKm } from './format';
import { useAsync } from './hooks';

const LABELS = { '5': '5 secondes', '60': '1 minute', '300': '5 minutes', '1200': '20 minutes' } as const;

function TotalsCard({ title, t }: { title: string; t: Totals }) {
  return (
    <>
      <h2>{title}</h2>
      <div class="card grid2" style="grid-template-columns:1fr 1fr 1fr">
        <div class="stat"><div class="v">{t.count}</div><div class="l">Séances</div></div>
        <div class="stat"><div class="v">{fmtDuration(t.durationS)}</div><div class="l">Durée</div></div>
        <div class="stat"><div class="v">{fmtKm(t.distanceM, 1)}</div><div class="l">km</div></div>
      </div>
    </>
  );
}

/** Durée par semaine sur les 8 dernières semaines (barres). */
function WeeksChart({ sessions }: { sessions: Session[] }) {
  const now = new Date();
  const weeks = Array.from({ length: 8 }, (_, i) => {
    // dimanche de la semaine visée : la semaine entière (lundi → dimanche) est comptée
    const sunday = new Date(now); sunday.setDate(now.getDate() - 7 * (7 - i) + (6 - ((now.getDay() + 6) % 7)));
    return weeklyTotals(sessions.filter((s) => new Date(s.startedAt) <= endOfDay(sunday)), sunday).week;
  });
  const max = Math.max(3600, ...weeks.map((w) => w.durationS));
  return (
    <div class="card">
      <div class="small muted" style="margin-bottom:8px">Durée par semaine (8 semaines)</div>
      <div style="display:flex;align-items:flex-end;gap:6px;height:110px">
        {weeks.map((w, i) => (
          <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%">
            <div class="small muted" style="font-size:10px">{w.durationS ? Math.round(w.durationS / 60) + '′' : ''}</div>
            <div style={`width:100%;border-radius:4px 4px 0 0;background:${i === 7 ? 'var(--accent)' : 'var(--z2)'};height:${(85 * w.durationS) / max}%`} />
          </div>
        ))}
      </div>
    </div>
  );
}

function endOfDay(d: Date) { const e = new Date(d); e.setHours(23, 59, 59, 999); return e; }

export function Progress() {
  const [sessions] = useAsync(() => db.listSessions());
  if (!sessions) return null;
  const { week, month } = weeklyTotals(sessions, new Date());
  const rec = personalRecords(sessions);
  return (
    <div>
      <h1>Progression</h1>
      <TotalsCard title="Cette semaine" t={week} />
      <TotalsCard title="Ce mois-ci" t={month} />
      <WeeksChart sessions={sessions} />
      <h2>Records de puissance (estimée)</h2>
      <div class="card">
        {(Object.keys(LABELS) as (keyof typeof LABELS)[]).map((k) => (
          <div class="row" style="padding:8px 0;border-bottom:1px solid var(--line)">
            <span>{LABELS[k]}</span>
            {rec[k] ? <a href={'#/historique/' + rec[k]!.sessionId} style="color:var(--accent);font-weight:700;text-decoration:none">{rec[k]!.watts} W ›</a> : <span class="muted">–</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
