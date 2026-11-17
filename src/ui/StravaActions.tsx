import { useState } from 'preact/hooks';
import { toTcx } from '../core/tcx';
import type { Session } from '../core/types';
import * as db from '../io/db';
import { shareFile } from '../io/files';
import { ensureFreshToken, isStravaConnected, uploadSession } from '../io/strava';

export function tcxName(s: Session): string {
  return `home-trainer-${s.startedAt.slice(0, 16).replace(/[:T]/g, '-')}.tcx`;
}

export function StravaActions({ session, reload }: { session: Session; reload: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function send() {
    setBusy(true);
    setMsg(null);
    try {
      let st = await db.getSettings();
      if (!isStravaConnected(st)) throw new Error('Strava n\'est pas encore connecté : va dans Réglages → Strava.');
      const fresh = await ensureFreshToken(st);
      if (fresh !== st) await db.saveSettings((st = fresh));
      const { activityId } = await uploadSession(session, st);
      await db.saveSession({ ...session, stravaId: activityId });
      setMsg({ ok: true, text: 'Séance envoyée sur Strava ✓' });
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
      <button class="block" onClick={() => shareFile(tcxName(session), toTcx(session), 'application/vnd.garmin.tcx+xml')}>Exporter .tcx</button>
      {msg && <p class="small" style={`color:${msg.ok ? 'var(--ok)' : 'var(--bad)'};margin:10px 0 0`}>{msg.text}</p>}
    </div>
  );
}
