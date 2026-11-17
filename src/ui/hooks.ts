import { useEffect, useState } from 'preact/hooks';

/** Charge une valeur asynchrone ; `reload()` relance le chargement. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []): [T | undefined, () => void] {
  const [v, setV] = useState<T>();
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    fn().then((x) => { if (alive) setV(x); });
    return () => { alive = false; };
  }, [...deps, n]);
  return [v, () => setN((x) => x + 1)];
}
