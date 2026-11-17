import { useEffect, useState } from 'preact/hooks';

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
  ['/historique', 'Historique'],
  ['/progression', 'Progression'],
  ['/parametres', 'Réglages'],
];

function Screen({ path }: { path: string }) {
  return <div class="screen"><h1>{path}</h1></div>;
}

export function App() {
  const path = useRoute();
  const inRide = path === '/seance';
  return (
    <div class="app">
      <main><Screen path={path} /></main>
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
