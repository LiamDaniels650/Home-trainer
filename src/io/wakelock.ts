import NoSleep from 'nosleep.js';

let noSleep: NoSleep | null = null;

/** Garde l'écran allumé (Wake Lock si dispo, sinon vidéo muette). À appeler depuis un appui. */
export async function keepAwake(): Promise<() => void> {
  noSleep ??= new NoSleep();
  try {
    await noSleep.enable();
  } catch {
    /* pas bloquant */
  }
  return releaseAwake;
}

/** Laisse l'écran se mettre en veille (fin de séance). */
export function releaseAwake(): void {
  noSleep?.disable();
}
