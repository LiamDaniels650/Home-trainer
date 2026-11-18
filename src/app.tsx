import { useEffect, useState } from 'preact/hooks';
import { Connect } from './ui/Connect';
import { History } from './ui/History';
import { Home } from './ui/Home';
import { Progress } from './ui/Progress';
import { SessionDetail } from './ui/SessionDetail';
import { SettingsScreen } from './ui/Settings';
import { WorkoutDetail, WorkoutList } from './ui/Workouts';
import { WorkoutEditor } from './ui/WorkoutEditor';
import { RouteDetail } from './ui/Routes';
import { StravaActions } from './ui/StravaActions';
import * as db from './io/db';
import { handleOAuthRedirect } from './io/strava';
import { Ride } from './ui/Ride';

export function navigate(path: string): void {
  location.hash = '#' + path;
}

function currentPath(): string {
  return location.hash.replace(/^#/, '') || '/';
}

export function useRoute(): string {
  const [path, setPath] = useState(currentPath());
  useEffect(() => {
    const on = () => setPath(currentPath());
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return path;
}

const TABS: [string, string][] = [
  ['/', 'Accueil'],
  ['/seances', 'Séances'],
  ['/historique', 'Historique'],
  ['/progression', 'Progression'],
  ['/parametres', 'Réglages'],
];

function Screen({ path, notice }: { path: string; notice: string }) {
  if (path === '/connexion') return <Connect />;
  if (path === '/seance') return <Ride />;
  if (path === '/') return <Home />;
  if (path === '/historique') return <History />;
  if (path.startsWith('/historique/')) return <SessionDetail id={decodeURIComponent(path.slice(12))} actions={(s, reload) => <StravaActions session={s} reload={reload} />} />;
  if (path === '/progression') return <Progress />;
  if (path === '/seances') return <WorkoutList />;
  if (path.startsWith('/seances/nouvelle')) {
    const from = new URLSearchParams(path.split('?')[1] ?? '').get('from') ?? undefined;
    return <WorkoutEditor key={path} fromId={from} />;
  }
  if (path.startsWith('/seances/modifier/')) return <WorkoutEditor key={path} editId={decodeURIComponent(path.slice(18))} />;
  if (path.startsWith('/routes/')) return <RouteDetail id={decodeURIComponent(path.slice(8))} />;
  if (path.startsWith('/seances/')) return <WorkoutDetail id={decodeURIComponent(path.slice(9))} />;
  if (path === '/parametres') return <SettingsScreen notice={notice} />;
  return <div><h1>Page introuvable</h1><a href="#/">Accueil</a></div>;
}

/** Retour de Strava après autorisation (?code=…). */
function useStravaRedirect(): [boolean, string] {
  const [state, setState] = useState<[boolean, string]>([!location.search.includes('code=') && !location.search.includes('error='), '']);
  useEffect(() => {
    if (state[0]) return;
    (async () => {
      let notice = '';
      try {
        const r = await handleOAuthRedirect(await db.getSettings(), location.href);
        if (r) {
          await db.saveSettings(r.settings);
          history.replaceState(null, '', r.cleanUrl.split('#')[0] + '#/parametres');
          notice = 'Strava est connecté ✓';
        }
      } catch (e) {
        history.replaceState(null, '', location.pathname + '#/parametres');
        notice = (e as Error).message;
      }
      setState([true, notice]);
      dispatchEvent(new HashChangeEvent('hashchange'));
    })();
  }, []);
  return state;
}

export function App() {
  const [ready, notice] = useStravaRedirect();
  const path = useRoute();
  if (!ready) return <main><p class="muted">Connexion à Strava…</p></main>;
  const inRide = path === '/seance';
  return (
    <div class="app">
      <main><Screen path={path} notice={notice} /></main>
      {!inRide && (
        <nav class="tabs">
          {TABS.map(([p, label]) => (
            <a href={'#' + p} class={(p === '/' ? path === '/' : path.startsWith(p)) ? 'on' : ''}>{label}</a>
          ))}
        </nav>
      )}
    </div>
  );
}
