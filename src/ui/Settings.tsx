import { useState } from 'preact/hooks';
import * as db from '../io/db';
import { shareFile } from '../io/files';
import { isStravaConnected, stravaAuthUrl } from '../io/strava';
import { estimatePower } from '../core/power';
import { useAsync } from './hooks';
import { personalRecords } from '../core/stats';
import { suggestFtp } from '../core/workout';
import { ConfirmButton } from './ConfirmButton';

export function redirectUri(): string {
  return location.origin + location.pathname;
}

export function SettingsScreen({ notice }: { notice?: string }) {
  const [loaded, reload] = useAsync(() => db.getSettings());
  const [sessions] = useAsync(() => db.listSessions());
  const [msg, setMsg] = useState(notice ?? '');
  if (!loaded) return null;
  const s = loaded;
  const save = async (patch: Partial<db.Settings>) => { await db.saveSettings({ ...s, ...patch }); reload(); };
  /** Valeur saisie si elle est dans les limites ; sinon l'ancienne valeur est remise à l'écran. */
  const num = (el: HTMLInputElement, min: number, max: number, fallback: number) => {
    const n = Number(el.value.replace(',', '.'));
    if (Number.isFinite(n) && n >= min && n <= max) return n;
    el.value = String(fallback).replace('.', ',');
    setMsg(`Valeur refusée : elle doit être comprise entre ${min} et ${max}.`);
    return fallback;
  };
  const ftpHint = suggestFtp(personalRecords(sessions ?? [])['1200']?.watts ?? null);
  const connected = isStravaConnected(s);

  return (
    <div>
      <h1>Réglages</h1>
      {msg && <div class="banner small" onClick={() => setMsg('')}>{msg}</div>}

      <h2>Vélo et home trainer</h2>
      <div class="card">
        <label>Circonférence de la roue arrière (mm)</label>
        <input inputMode="numeric" value={s.circumferenceMm} onChange={(e) => save({ circumferenceMm: num(e.currentTarget, 1000, 3000, s.circumferenceMm) })} />
        <div class="small muted" style="margin-top:6px">700×23c = 2096 · 700×25c = 2105 · 700×28c = 2136 · 700×32c = 2155. Le plus précis : marque le pneu, fais un tour de roue au sol et mesure.</div>

        <label>Niveau de résistance par défaut (manette)</label>
        <select value={s.defaultLevel} onChange={(e) => save({ defaultLevel: Number(e.currentTarget.value) })}>
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option value={n}>Niveau {n}</option>)}
        </select>

        <label>Calibration de la puissance (×)</label>
        <input inputMode="decimal" value={String(s.calib).replace('.', ',')} onChange={(e) => save({ calib: num(e.currentTarget, 0.5, 1.5, s.calib) })} />
        <div class="small muted" style="margin-top:6px">Exemple au niveau {s.defaultLevel} à 30 km/h : {estimatePower(30, s.defaultLevel, s.calib)} W estimés. Laisse 1 si tu n'as pas de référence ; ce qui compte, c'est d'être cohérent d'une séance à l'autre.</div>

        <label style="display:flex;align-items:center;gap:10px;color:var(--text)">
          <input type="checkbox" style="width:22px;height:22px" checked={s.autoPause} onChange={(e) => save({ autoPause: e.currentTarget.checked })} />
          Pause automatique quand la roue s'arrête
        </label>
      </div>

      <h2>Routes</h2>
      <div class="card">
        <label>Poids total : toi + vélo (kg)</label>
        <input inputMode="decimal" value={String(s.massKg).replace('.', ',')} onChange={(e) => save({ massKg: num(e.currentTarget, 30, 200, s.massKg) })} />
        <div class="small muted" style="margin-top:6px">Sert à calculer ta vitesse sur une route : plus tu es lourd, plus les montées sont lentes.</div>
      </div>

      <h2>Cardio</h2>
      <div class="card">
        <label>Fréquence cardiaque max (bpm)</label>
        <input inputMode="numeric" value={s.hrMax} onChange={(e) => save({ hrMax: num(e.currentTarget, 120, 230, s.hrMax) })} />
        <div class="small muted" style="margin-top:6px">Sert à calculer les zones (60 / 70 / 80 / 90 % de la FC max).</div>
      </div>

      <h2>Séances guidées</h2>
      <div class="card">
        <label>FTP : puissance au seuil (W)</label>
        <input inputMode="numeric" value={s.ftp} onChange={(e) => save({ ftp: Math.round(num(e.currentTarget, 50, 600, s.ftp)) })} />
        <div class="small muted" style="margin-top:6px">
          Les cibles des séances sont en % de cette valeur (puissance estimée).
          {ftpHint ? <> Suggestion : <b>{ftpHint} W</b> (95 % de ton record sur 20 min). {ftpHint !== s.ftp && <a href="#/parametres" onClick={(e) => { e.preventDefault(); save({ ftp: ftpHint }); }}>Utiliser</a>}</>
            : ' Fais un effort de 20 min à fond : l\'app te proposera une valeur.'}
        </div>
      </div>

      <h2>Strava</h2>
      <div class="card">
        {connected ? (
          <>
            <p style="margin-top:0">Connecté{s.strava?.athleteName ? ` en tant que ${s.strava.athleteName}` : ''} ✓</p>
            <ConfirmButton class="block" confirmLabel="Confirmer la déconnexion" onConfirm={() => save({ strava: { clientId: s.strava!.clientId, clientSecret: s.strava!.clientSecret } })}>Déconnecter</ConfirmButton>
          </>
        ) : (
          <>
            <ol class="small" style="padding-left:18px;line-height:1.5;margin-top:0">
              <li>Sur strava.com (connecté), ouvre <b>strava.com/settings/api</b>.</li>
              <li>Crée une application : nom « Home Trainer », catégorie « Training », site web <code>{location.origin}</code> et <b>Authorization Callback Domain</b> : <code>{location.hostname}</code>.</li>
              <li>Copie le <b>Client ID</b> et le <b>Client Secret</b> ci-dessous.</li>
              <li>Touche « Connecter à Strava » et autorise l'importation d'activités.</li>
            </ol>
            <label>Client ID</label>
            <input inputMode="numeric" value={s.strava?.clientId ?? ''} onChange={(e) => save({ strava: { clientId: e.currentTarget.value.trim(), clientSecret: s.strava?.clientSecret ?? '' } })} />
            <label>Client Secret</label>
            <input type="password" value={s.strava?.clientSecret ?? ''} onChange={(e) => save({ strava: { clientId: s.strava?.clientId ?? '', clientSecret: e.currentTarget.value.trim() } })} />
            <button class="block" style="background:#fc4c02;color:#fff" disabled={!s.strava?.clientId || !s.strava?.clientSecret}
              onClick={() => { location.href = stravaAuthUrl(s.strava!.clientId, redirectUri()); }}>Connecter à Strava</button>
            <div class="small muted" style="margin-top:8px">Ces codes restent uniquement sur ton iPhone.</div>
          </>
        )}
      </div>

      <h2>Sauvegarde</h2>
      <div class="card">
        <div class="small muted">Exporte régulièrement ton historique (dans Fichiers ou iCloud Drive) : si Bluefy est supprimé, les données le sont aussi.</div>
        <button class="block" onClick={async () => shareFile(`home-trainer-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`, await db.exportAll(), 'application/json')}>Exporter la sauvegarde</button>
        <label class="btn block" style="margin-top:10px;color:var(--text)">
          Importer une sauvegarde
          <input type="file" accept="application/json,.json" style="display:none" onChange={async (e) => {
            const f = e.currentTarget.files?.[0];
            e.currentTarget.value = '';
            if (!f) return;
            try {
              const r = await db.importAll(await f.text());
              setMsg(`${r.added} séance(s) importée(s)${r.skipped ? `, ${r.skipped} déjà présente(s)` : ''}.`);
            } catch (err) {
              setMsg((err as Error).message);
            }
          }} />
        </label>
      </div>
      <p class="small muted" style="text-align:center">Puissance estimée à partir de la vitesse et du niveau (Elite Novo Force).</p>
    </div>
  );
}
