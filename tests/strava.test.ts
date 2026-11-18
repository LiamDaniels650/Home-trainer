import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ensureFreshToken, handleOAuthRedirect, stravaAuthUrl, uploadSession } from '../src/io/strava';
import { DEFAULT_SETTINGS, type Settings } from '../src/io/db';
import { summarize } from '../src/core/recorder';
import type { Session } from '../src/core/types';

const samples = [{ t: 1, distM: 8, speed: 30, hr: 140, power: 213, level: 3 }];
const session: Session = { id: 'sess-1', startedAt: '2026-11-17T18:00:00.000Z', samples, summary: summarize(samples, 190) };
const NOW = 1_800_000_000;
const connected: Settings = { ...DEFAULT_SETTINGS, strava: { clientId: '42', clientSecret: 'sec', accessToken: 'tok', refreshToken: 'ref', expiresAt: NOW + 3600 } };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
  vi.setSystemTime(NOW * 1000);
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

test("URL d'autorisation", () => {
  const u = new URL(stravaAuthUrl('42', 'https://liamdaniels650.github.io/Home-trainer/'));
  expect(u.origin + u.pathname).toBe('https://www.strava.com/oauth/authorize');
  expect(u.searchParams.get('client_id')).toBe('42');
  expect(u.searchParams.get('scope')).toBe('activity:write');
  expect(u.searchParams.get('approval_prompt')).toBe('auto');
  expect(u.searchParams.get('response_type')).toBe('code');
  expect(u.searchParams.get('redirect_uri')).toBe('https://liamdaniels650.github.io/Home-trainer/');
});

test('retour OAuth : échange du code', async () => {
  fetchMock.mockResolvedValueOnce(json({ access_token: 'A', refresh_token: 'R', expires_at: NOW + 21600, athlete: { firstname: 'Liam' } }));
  const base = { ...DEFAULT_SETTINGS, strava: { clientId: '42', clientSecret: 'sec' } };
  const r = await handleOAuthRedirect(base, 'https://x.io/Home-trainer/?state=&code=CODE&scope=read,activity:write#/parametres');
  expect(r!.settings.strava).toMatchObject({ accessToken: 'A', refreshToken: 'R', expiresAt: NOW + 21600, athleteName: 'Liam' });
  expect(r!.cleanUrl).toBe('https://x.io/Home-trainer/#/parametres');
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe('https://www.strava.com/oauth/token');
  const body = init.body as URLSearchParams;
  expect(body.get('code')).toBe('CODE');
  expect(body.get('grant_type')).toBe('authorization_code');
});

test('retour OAuth sans code : rien à faire', async () => {
  expect(await handleOAuthRedirect(connected, 'https://x.io/Home-trainer/#/')).toBeNull();
});

test('retour OAuth sans la permission activity:write', async () => {
  await expect(handleOAuthRedirect(connected, 'https://x.io/?code=C&scope=read')).rejects.toThrow(/autorisation/i);
});

test('jeton encore valide : pas de rafraîchissement', async () => {
  const s = await ensureFreshToken(connected);
  expect(s).toBe(connected);
  expect(fetchMock).not.toHaveBeenCalled();
});

test('jeton expiré : rafraîchissement', async () => {
  fetchMock.mockResolvedValueOnce(json({ access_token: 'B', refresh_token: 'R2', expires_at: NOW + 21600 }));
  const s = await ensureFreshToken({ ...connected, strava: { ...connected.strava!, expiresAt: NOW + 30 } });
  expect(s.strava!.accessToken).toBe('B');
  expect(s.strava!.refreshToken).toBe('R2');
  expect((fetchMock.mock.calls[0][1].body as URLSearchParams).get('grant_type')).toBe('refresh_token');
});

test('envoi puis attente de traitement → id de l\'activité', async () => {
  fetchMock
    .mockResolvedValueOnce(json({ id: 7, status: 'Your activity is still being processed.', activity_id: null, error: null }, 201))
    .mockResolvedValueOnce(json({ id: 7, status: 'Your activity is still being processed.', activity_id: null, error: null }))
    .mockResolvedValueOnce(json({ id: 7, status: 'Your activity is ready.', activity_id: 999, error: null }));
  const p = uploadSession(session, connected);
  await vi.runAllTimersAsync();
  expect(await p).toEqual({ activityId: 999 });
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe('https://www.strava.com/api/v3/uploads');
  expect(init.headers.Authorization).toBe('Bearer tok');
  const fd = init.body as FormData;
  expect(fd.get('data_type')).toBe('tcx');
  expect(fd.get('trainer')).toBe('1');
  expect(fd.get('external_id')).toBe('sess-1.tcx');
  expect(fetchMock.mock.calls[1][0]).toBe('https://www.strava.com/api/v3/uploads/7');
});

test('doublon signalé par Strava : la séance est considérée comme envoyée', async () => {
  fetchMock
    .mockResolvedValueOnce(json({ id: 8, status: 'processing', activity_id: null, error: null }, 201))
    .mockResolvedValueOnce(json({ id: 8, status: 'There was an error processing your activity.', activity_id: null, error: 'sess-1.tcx duplicate of activity 123' }));
  const p = uploadSession(session, connected);
  await vi.runAllTimersAsync();
  expect(await p).toEqual({ activityId: 123, duplicate: true });
});

test('doublon au format lien HTML', async () => {
  fetchMock.mockResolvedValueOnce(json({ id: 9, status: 'x', activity_id: null, error: "a.tcx duplicate of <a href='/activities/4567'>Sortie</a>" }, 201));
  expect(await uploadSession(session, connected)).toEqual({ activityId: 4567, duplicate: true });
});

test('doublon sans numéro : message clair', async () => {
  fetchMock.mockResolvedValueOnce(json({ id: 9, status: 'x', activity_id: null, error: 'duplicate' }, 201));
  await expect(uploadSession(session, connected)).rejects.toThrow('Déjà présente sur Strava');
});

test("nom de l'activité : nom de la séance guidée", async () => {
  fetchMock.mockResolvedValueOnce(json({ id: 1, status: 'ok', activity_id: 5, error: null }, 201));
  const guided = { ...session, workout: { name: 'Sweet spot 3 × 10 min', ftp: 250, steps: [], results: [] } };
  await uploadSession(guided, connected);
  expect((fetchMock.mock.calls[0][1].body as FormData).get('name')).toBe('Home trainer · Sweet spot 3 × 10 min');
});

test('réponse non JSON : message français', async () => {
  fetchMock.mockResolvedValueOnce(new Response('<html>502</html>', { status: 502 }));
  await expect(uploadSession(session, connected)).rejects.toThrow(/Strava.*502/);
});

test("erreur pendant l'attente de traitement : message français", async () => {
  fetchMock
    .mockResolvedValueOnce(json({ id: 7, status: 'processing', activity_id: null, error: null }, 201))
    .mockResolvedValueOnce(json({ message: 'Rate Limit Exceeded' }, 429));
  const p = uploadSession(session, connected);
  const check = expect(p).rejects.toThrow(/Strava.*429/);
  await vi.runAllTimersAsync();
  await check;
});

test('erreur réseau : message français proposant l\'export', async () => {
  fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
  await expect(uploadSession(session, connected)).rejects.toThrow(/\.tcx/);
});

test('non connecté', async () => {
  await expect(uploadSession(session, DEFAULT_SETTINGS)).rejects.toThrow(/Réglages/);
});

test('séance sur route : passage en Vélo virtuel', async () => {
  const { setVirtualRide } = await import('../src/io/strava');
  fetchMock.mockResolvedValueOnce(json({ id: 55, sport_type: 'VirtualRide' }));
  await setVirtualRide(55, connected);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe('https://www.strava.com/api/v3/activities/55');
  expect(init.method).toBe('PUT');
  expect(init.headers.Authorization).toBe('Bearer tok');
  expect(JSON.parse(init.body)).toEqual({ sport_type: 'VirtualRide' });
});

test('Vélo virtuel refusé : message clair', async () => {
  const { setVirtualRide } = await import('../src/io/strava');
  fetchMock.mockResolvedValueOnce(json({ message: 'Forbidden' }, 403));
  await expect(setVirtualRide(55, connected)).rejects.toThrow(/Vélo virtuel/);
});

test("nom de l'activité : nom de la route", async () => {
  fetchMock.mockResolvedValueOnce(json({ id: 1, status: 'ok', activity_id: 5, error: null }, 201));
  const onRoute = { ...session, route: { id: 'x', name: 'Alpe test', distanceM: 1, gainM: 0, routeDistM: 1, gainDoneM: 0, completed: true } };
  await uploadSession(onRoute, connected);
  expect((fetchMock.mock.calls[0][1].body as FormData).get('name')).toBe('Home trainer · Alpe test');
});
