import { toTcx } from '../core/tcx';
import type { Session } from '../core/types';
import type { Settings } from './db';

const AUTH = 'https://www.strava.com/oauth/authorize';
const TOKEN = 'https://www.strava.com/oauth/token';
const API = 'https://www.strava.com/api/v3';
const POLL_MS = 2000;
const POLL_MAX = 30;

export const NETWORK_ERROR = "Impossible de joindre Strava. Vérifie ta connexion, ou utilise « Exporter .tcx » puis importe le fichier sur strava.com.";

export function stravaAuthUrl(clientId: string, redirectUri: string): string {
  const u = new URL(AUTH);
  u.searchParams.set('client_id', clientId);
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('approval_prompt', 'auto');
  u.searchParams.set('scope', 'activity:write');
  return u.toString();
}

async function call(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    throw new Error(NETWORK_ERROR);
  }
}

async function tokenRequest(params: Record<string, string>) {
  const res = await call(TOKEN, { method: 'POST', body: new URLSearchParams(params) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Strava a refusé la connexion (${res.status}). Vérifie le Client ID et le Client Secret, ou reconnecte Strava si tu as retiré l'accès.`);
  return data as { access_token: string; refresh_token: string; expires_at: number; athlete?: { firstname?: string } };
}

/** Traite le retour de Strava après autorisation (?code=…). Renvoie null s'il n'y a rien à traiter. */
export async function handleOAuthRedirect(settings: Settings, url: string): Promise<{ settings: Settings; cleanUrl: string } | null> {
  const u = new URL(url);
  const code = u.searchParams.get('code');
  const error = u.searchParams.get('error');
  if (!code && !error) return null;
  if (error || !(u.searchParams.get('scope') ?? '').split(',').includes('activity:write')) {
    throw new Error("Autorisation Strava incomplète : coche bien « Importer des activités » (activity:write) lors de la connexion.");
  }
  if (!settings.strava?.clientId || !settings.strava.clientSecret) throw new Error('Renseigne le Client ID et le Client Secret dans les Réglages.');
  const t = await tokenRequest({ client_id: settings.strava.clientId, client_secret: settings.strava.clientSecret, code: code!, grant_type: 'authorization_code' });
  for (const k of ['code', 'scope', 'state', 'error']) u.searchParams.delete(k);
  return {
    settings: { ...settings, strava: { ...settings.strava, accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: t.expires_at, athleteName: t.athlete?.firstname } },
    cleanUrl: u.toString(),
  };
}

export function isStravaConnected(s: Settings): boolean {
  return !!s.strava?.refreshToken;
}

/** Rafraîchit le jeton d'accès s'il expire dans moins de 60 s. Renvoie les réglages (à sauvegarder s'ils changent). */
export async function ensureFreshToken(settings: Settings): Promise<Settings> {
  const st = settings.strava;
  if (!st?.refreshToken) throw new Error('Strava n\'est pas connecté. Va dans Réglages → Strava.');
  if (st.accessToken && st.expiresAt && st.expiresAt > Date.now() / 1000 + 60) return settings;
  const t = await tokenRequest({ client_id: st.clientId, client_secret: st.clientSecret, refresh_token: st.refreshToken, grant_type: 'refresh_token' });
  return { ...settings, strava: { ...st, accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: t.expires_at } };
}

interface UploadStatus { id: number; status: string; activity_id: number | null; error: string | null }

export interface UploadResult { activityId: number; duplicate?: boolean }

/** Erreur d'envoi ; un doublon avec numéro d'activité est un succès (la séance est déjà sur Strava). */
function settle(u: UploadStatus): UploadResult | Error {
  if (/duplicate/i.test(u.error ?? '')) {
    const m = /activit(?:y|ies)\/?\s*(\d+)/i.exec(u.error ?? '');
    return m ? { activityId: Number(m[1]), duplicate: true } : new Error('Déjà présente sur Strava');
  }
  return new Error(`Strava n'a pas accepté la séance : ${u.error}`);
}

async function readStatus(res: Response): Promise<UploadStatus> {
  if (res.status === 401) throw new Error('Session Strava expirée : reconnecte Strava dans les Réglages.');
  if (!res.ok) throw new Error(`Strava a répondu par une erreur (${res.status}). Réessaie plus tard ou utilise « Exporter .tcx ».`);
  try {
    return (await res.json()) as UploadStatus;
  } catch {
    throw new Error(`Réponse inattendue de Strava (${res.status}).`);
  }
}

/** Envoie la séance (TCX) puis attend que Strava l'ait traitée. Les réglages doivent avoir un jeton valide. */
export async function uploadSession(s: Session, settings: Settings): Promise<UploadResult> {
  const token = settings.strava?.accessToken;
  if (!token) throw new Error('Strava n\'est pas connecté. Va dans Réglages → Strava.');
  const headers = { Authorization: `Bearer ${token}` };
  const fd = new FormData();
  fd.append('file', new Blob([toTcx(s)], { type: 'application/vnd.garmin.tcx+xml' }), `${s.id}.tcx`);
  fd.append('data_type', 'tcx');
  fd.append('trainer', '1');
  const label = s.route?.name ?? s.workout?.name;
  fd.append('name', label ? `Home trainer · ${label}` : 'Home trainer');
  fd.append('external_id', `${s.id}.tcx`);
  let u = await readStatus(await call(`${API}/uploads`, { method: 'POST', headers, body: fd }));
  for (let i = 0; ; i++) {
    if (u.error) {
      const r = settle(u);
      if (r instanceof Error) throw r;
      return r;
    }
    if (u.activity_id) return { activityId: u.activity_id };
    if (i >= POLL_MAX) break;
    await new Promise((r) => setTimeout(r, POLL_MS));
    u = await readStatus(await call(`${API}/uploads/${u.id}`, { headers }));
  }
  throw new Error('Strava met du temps à traiter la séance. Vérifie sur Strava dans quelques minutes.');
}

/** Séance sur route : l'activité est marquée « Vélo virtuel » (pas de segments réels faussés). */
export async function setVirtualRide(activityId: number, settings: Settings): Promise<void> {
  const token = settings.strava?.accessToken;
  if (!token) throw new Error('Strava n\'est pas connecté.');
  const res = await call(`${API}/activities/${activityId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sport_type: 'VirtualRide' }),
  });
  if (!res.ok) throw new Error(`Séance envoyée, mais Strava a refusé de la passer en « Vélo virtuel » (${res.status}) : change le type sur Strava.`);
}
