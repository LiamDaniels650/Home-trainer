let ctx: AudioContext | null = null;

/** À appeler lors d'un appui (iOS n'autorise le son qu'après un geste de l'utilisateur). */
export function unlockAudio(): void {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx ??= new AC();
    if (ctx.state === 'suspended') void ctx.resume();
    beep(0, 0.01, 0); // bip silencieux pour « réveiller » le son sur iOS
  } catch {
    ctx = null;
  }
}

/** Bip court ; `long` pour le changement d'étape. */
export function beep(freq = 880, durationS = 0.12, volume = 0.25): void {
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq || 440;
    gain.gain.value = volume;
    osc.connect(gain).connect(ctx.destination);
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(durationS, 0.02));
    osc.start(t);
    osc.stop(t + Math.max(durationS, 0.02));
  } catch {
    /* le son n'est pas indispensable */
  }
}
