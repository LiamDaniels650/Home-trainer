import { useState } from 'preact/hooks';
import { toTcx } from '../core/tcx';
import type { Session } from '../core/types';
import * as db from '../io/db';
import { shareFile } from '../io/files';
import { ensureFreshToken, isStravaConnected, setVirtualRide, uploadSession } from '../io/strava';

export function tcxName(s: Session): string {
  return `home-trainer-${s.startedAt.slice(0, 16).replace(/[:T]/g, '-')}.tcx`;
}

export function StravaActions({ session, reload }: { session: Session; reload: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  /** Séance sur route : passage en « Vélo virtuel » (aussi après un doublon, l'opération est sans risque à répéter). */
  async function makeVirtual(st: db.Settings, activityId: number, base: Session): Promise<boolean> {
    try {
      await setVirtualRide(activityId, st);
      await db.saveSession({ ...base, stravaId: activityId, stravaVirtual: true });
      return true;
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
      return false;
    }
  }

  async function fresh(): Promise<db.Settings> {
    let st = await db.getSettings();
    if (!isStravaConnected(st)) throw new Error('Strava n\'est pas encore connecté : va dans Réglages → Strava.');
    const f = await ensureFreshToken(st);
    if (f !== st) await db.saveSettings((st = f));
    return st;
  }

  async function send() {
    setBusy(true);
    setMsg(null);
    try {
      const st = await fresh();
      const { activityId, duplicate } = await uploadSession(session, st);
      const saved = { ...session, stravaId: activityId };
      await db.saveSession(saved);
      let text = duplicate ? 'Cette séance était déjà sur Strava ✓' : 'Séance envoyée sur Strava ✓';
      if (session.route) {
        if (!(await makeVirtual(st, activityId, saved))) { reload(); return; }
        text += ' (Vélo virtuel)';
      }
      setMsg({ ok: true, text });
      reload();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function retryVirtual() {
    setBusy(true);
    setMsg(null);
    try {
      const st = await fresh();
      if (await makeVirtual(st, session.stravaId!, session)) setMsg({ ok: true, text: 'Séance passée en Vélo virtuel ✓' });
      reload();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="card">
      {session.stravaId ? (
        <a class="btn block" style="background:#fc4c02;color:#fff;margin-top:0" href={`https://www.strava.com/activities/${session.stravaId}`} target="_blank" rel="noopener">Voir sur Strava ›</a>
      ) : (
        <button class="block" style="background:#fc4c02;color:#fff;margin-top:0" disabled={busy} onClick={send}>{busy ? 'Envoi en cours…' : 'Envoyer sur Strava'}</button>
      )}
      {session.route && session.stravaId && !session.stravaVirtual && (
        <button class="block" disabled={busy} onClick={retryVirtual}>Passer en Vélo virtuel sur Strava</button>
      )}
      <button class="block" onClick={() => shareFile(tcxName(session), toTcx(session), 'application/vnd.garmin.tcx+xml')}>Exporter .tcx</button>
      {msg && <p class="small" style={`color:${msg.ok ? 'var(--ok)' : 'var(--bad)'};margin:10px 0 0`}>{msg.text}</p>}
    </div>
  );
}
