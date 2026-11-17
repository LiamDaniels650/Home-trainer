import { useMemo } from 'preact/hooks';
import { navigate } from '../app';
import { ZONE_NAMES } from '../core/zones';
import * as db from '../io/db';
import { Chart } from './Chart';
import { fmtDate, fmtDuration, fmtKm, fmtNum } from './format';
import { useAsync } from './hooks';
import type { ComponentChildren } from 'preact';
import { ConfirmButton } from './ConfirmButton';
import { KIND_LABELS, targetWatts } from '../core/workout';
import { pctColor } from './WorkoutProfile';

const BEST_LABELS = { '5': '5 s', '60': '1 min', '300': '5 min', '1200': '20 min' } as const;

export function SessionDetail({ id, actions }: { id: string; actions?: (s: import('../core/types').Session, reload: () => void) => ComponentChildren }) {
  const [session, reload] = useAsync(() => db.getSession(id), [id]);
  const series = useMemo(() => session && {
    x: session.samples.map((s) => s.t),
    speed: session.samples.map((s) => s.speed),
    hr: session.samples.map((s) => s.hr),
    power: session.samples.map((s) => s.power),
  }, [session]);
  if (session === undefined) return null;
  if (!session || !series) return <div><h1>Séance introuvable</h1><a href="#/historique">Retour</a></div>;
  const m = session.summary;
  const zoneTotal = m.hrZonesS.reduce((a, b) => a + b, 0);

  return (
    <div>
      <a href="#/historique" class="small muted">‹ Historique</a>
      <h1 style="margin-top:6px">{fmtDate(session.startedAt)}</h1>
      <div class="card grid2" style="grid-template-columns:1fr 1fr 1fr;row-gap:14px">
        <div class="stat"><div class="v">{fmtDuration(m.durationS)}</div><div class="l">Durée</div></div>
        <div class="stat"><div class="v">{fmtKm(m.distanceM)}</div><div class="l">km</div></div>
        <div class="stat"><div class="v">{fmtNum(m.avgSpeed)}</div><div class="l">km/h moy.</div></div>
        <div class="stat"><div class="v">{m.avgPower}</div><div class="l">W moy. (est.)</div></div>
        <div class="stat"><div class="v">{m.maxPower}</div><div class="l">W max</div></div>
        <div class="stat"><div class="v">{m.avgHr ?? '–'}</div><div class="l">FC moy.</div></div>
        <div class="stat"><div class="v">{fmtNum(m.maxSpeed)}</div><div class="l">km/h max</div></div>
        <div class="stat"><div class="v">{m.maxHr ?? '–'}</div><div class="l">FC max</div></div>
      </div>

      {actions?.(session, reload)}

      {session.workout && (
        <div class="card">
          <div class="small muted" style="margin-bottom:8px">Séance guidée : <b style="color:var(--text)">{session.workout.name}</b> · FTP {session.workout.ftp} W</div>
          <div class="row small muted" style="padding:4px 0"><span style="flex:1">Étape</span><span style="width:52px;text-align:right">Durée</span><span style="width:58px;text-align:right">Cible</span><span style="width:58px;text-align:right">Réalisé</span><span style="width:40px;text-align:right">FC</span></div>
          {session.workout.steps.map((st, i) => {
            const r = session.workout!.results[i];
            const target = targetWatts(st.pct, session.workout!.ftp);
            const ratio = r?.avgPower != null ? r.avgPower / target : null;
            const cls = ratio == null ? 'muted' : ratio < 0.95 ? 'st-low' : ratio > 1.05 ? 'st-high' : 'st-ok';
            return (
              <div class="row small" style={`padding:5px 0;border-top:1px solid var(--line);opacity:${r?.durationS ? 1 : 0.4}`}>
                <span style="flex:1"><span class="dot" style={`background:${pctColor(st.pct)}`} />{KIND_LABELS[st.kind]}</span>
                <span style="width:52px;text-align:right">{fmtDuration(r?.durationS ?? 0)}</span>
                <span style="width:58px;text-align:right">{target} W</span>
                <span class={cls} style="width:58px;text-align:right;font-weight:600">{r?.avgPower ?? '–'}{r?.avgPower != null && ' W'}</span>
                <span style="width:40px;text-align:right">{r?.avgHr ?? '–'}</span>
              </div>
            );
          })}
        </div>
      )}

      <Chart title="Vitesse" unit="km/h" x={series.x} y={series.speed} color="#3c9cff" />
      {m.avgHr != null && <Chart title="Fréquence cardiaque" unit="bpm" x={series.x} y={series.hr} color="#ff4d5e" />}
      <Chart title="Puissance estimée" unit="W" x={series.x} y={series.power} color="#ff6b2c" />

      {zoneTotal > 0 && (
        <div class="card">
          <div class="small muted" style="margin-bottom:8px">Temps par zone cardio</div>
          {m.hrZonesS.map((s, i) => (
            <div class="row small" style="margin:4px 0">
              <span style="width:110px">{ZONE_NAMES[i]}</span>
              <span style="flex:1;background:var(--line);border-radius:4px;height:10px;overflow:hidden">
                <span style={`display:block;height:100%;width:${(100 * s) / zoneTotal}%;background:var(--z${i + 1})`} />
              </span>
              <span style="width:52px;text-align:right">{fmtDuration(s)}</span>
            </div>
          ))}
        </div>
      )}

      <div class="card">
        <div class="small muted" style="margin-bottom:8px">Meilleures puissances</div>
        <div class="grid2" style="grid-template-columns:repeat(4,1fr)">
          {(Object.keys(BEST_LABELS) as (keyof typeof BEST_LABELS)[]).map((k) => (
            <div class="stat"><div class="v">{m.best[k] ?? '–'}</div><div class="l">{BEST_LABELS[k]}</div></div>
          ))}
        </div>
      </div>

      <ConfirmButton class="block" style="background:transparent;color:var(--bad)" confirmLabel="Appuie encore pour supprimer définitivement" onConfirm={async () => {
        await db.deleteSession(session.id);
        navigate('/historique');
      }}>Supprimer la séance</ConfirmButton>
    </div>
  );
}
