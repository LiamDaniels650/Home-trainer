import { useState } from 'preact/hooks';
import { navigate } from '../app';
import { parseGpx } from '../core/gpx';
import type { Route } from '../core/types';
import * as db from '../io/db';
import { ConfirmButton } from './ConfirmButton';
import { fmtKm } from './format';
import { useAsync } from './hooks';
import { activeRide, setPendingRoute } from './ride';
import { maxGrade, RouteProfile, RouteTrace } from './RouteViews';

/** Section « Routes » de l'onglet Séances. */
export function RouteSection() {
  const [routes, reload] = useAsync(() => db.listRoutes());
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <>
      <h2 id="routes-anchor">Routes</h2>
      <p class="small muted" style="margin-top:-4px">Importe un fichier GPX (Strava, Komoot, Garmin…) et roule dessus : l'app te dit quel niveau mettre selon la pente.</p>
      <label class="btn block" style="margin-top:0;color:var(--text)">
        Importer un fichier GPX
        {/* pas d'attribut accept : iOS grise souvent les .gpx sinon */}
        <input type="file" style="display:none" onChange={async (e) => {
          const f = e.currentTarget.files?.[0];
          e.currentTarget.value = '';
          if (!f) return;
          try {
            const r = parseGpx(await f.text(), f.name.replace(/\.gpx$/i, ''));
            await db.saveRoute(r);
            setMsg({ ok: true, text: `Route « ${r.name} » importée${r.hasElevation ? '' : " (sans altitude : elle sera plate)"}.` });
            reload();
          } catch (err) {
            setMsg({ ok: false, text: (err as Error).message });
          }
        }} />
      </label>
      {msg && <p class="small" style={`color:${msg.ok ? 'var(--ok)' : 'var(--bad)'}`}>{msg.text}</p>}
      {routes?.map((r) => (
        <a class="card" style="display:block;color:inherit;text-decoration:none" href={'#/routes/' + encodeURIComponent(r.id)}>
          <div class="row"><b>{r.name}</b><span class="muted small">{fmtKm(r.distanceM, 1)} km · {Math.round(r.gainM)} m D+</span></div>
          <div style="margin-top:6px"><RouteProfile points={r.points} height={40} /></div>
        </a>
      ))}
    </>
  );
}

export function RouteDetail({ id }: { id: string }) {
  const [route, reload] = useAsync(() => db.getRoute(id), [id]);
  const [name, setName] = useState<string | null>(null);
  if (route === undefined) return <div><p class="muted">Chargement…</p></div>;
  if (!route) return <div><h1>Route introuvable</h1><a href="#/seances">‹ Séances</a></div>;
  const r: Route = route;
  return (
    <div>
      <a href="#/seances" class="small muted">‹ Séances</a>
      <h1 style="margin-top:6px">{r.name}</h1>
      <div class="card grid2" style="grid-template-columns:1fr 1fr 1fr">
        <div class="stat"><div class="v">{fmtKm(r.distanceM, 1)}</div><div class="l">km</div></div>
        <div class="stat"><div class="v">{Math.round(r.gainM)}</div><div class="l">m D+</div></div>
        <div class="stat"><div class="v">{maxGrade(r.points).toFixed(0)} %</div><div class="l">pente max</div></div>
      </div>
      <div class="card"><RouteProfile points={r.points} height={110} /></div>
      <div class="card" style="display:flex;justify-content:center"><RouteTrace points={r.points} size={220} /></div>
      {!r.hasElevation && <p class="small muted">Ce fichier n'a pas d'altitude : la route est considérée comme plate.</p>}
      <button class="primary block" disabled={!!activeRide()} onClick={() => { setPendingRoute(r); navigate('/connexion'); }}>
        {activeRide() ? 'Une séance est déjà en cours' : 'Rouler sur cette route'}
      </button>
      <label>Nom</label>
      <div class="row">
        <input value={name ?? r.name} onInput={(e) => setName(e.currentTarget.value)} />
        <button class="mini" disabled={name == null || !name.trim() || name === r.name} onClick={async () => {
          await db.saveRoute({ ...r, name: name!.trim() });
          setName(null);
          reload();
        }}>Renommer</button>
      </div>
      <ConfirmButton class="block" style="background:transparent;color:var(--bad)" confirmLabel="Appuie encore pour supprimer" onConfirm={async () => {
        await db.deleteRoute(r.id);
        navigate('/seances');
      }}>Supprimer cette route</ConfirmButton>
      <p class="small muted">Supprimer une route ne touche pas aux séances déjà faites dessus.</p>
    </div>
  );
}
