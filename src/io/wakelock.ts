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
  return () => noSleep?.disable();
}
