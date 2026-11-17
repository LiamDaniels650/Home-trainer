import { WheelTracker } from '../core/csc';
import { Recorder } from '../core/recorder';
import type { Draft, Sample, Session } from '../core/types';
import { getSensors, type SensorKind, type SensorState } from '../io/ble';
import * as db from '../io/db';

const HR_STALE_MS = 5000;
const DRAFT_EVERY_S = 5;

export interface RideView {
  elapsedS: number;
  distanceM: number;
  speed: number;
  hr: number | null;
  power: number;
  level: number;
  paused: boolean;
  autoPaused: boolean;
  speedState: SensorState;
  hrState: SensorState;
}

/** Orchestration d'une séance : capteurs → tracker → enregistreur, 1 tick/s, brouillon toutes les 5 s. */
export class RideController {
  private tracker: WheelTracker;
  private hr: number | null = null;
  private hrAt = 0;
  private timer: ReturnType<typeof setInterval>;
  private offs: (() => void)[] = [];
  private listeners = new Set<() => void>();
  private last: Sample | null = null;

  constructor(readonly recorder: Recorder, circumferenceMm: number) {
    this.tracker = new WheelTracker(circumferenceMm);
    const s = getSensors();
    this.offs.push(
      s.onCsc((r) => this.tracker.update(r.wheelRevs, r.wheelTime, Date.now())),
      s.onHr((bpm) => { this.hr = bpm; this.hrAt = Date.now(); }),
      s.onState((k: SensorKind, st) => {
        if (k === 'speed' && st === 'connecte') this.tracker.reset();
        this.emit();
      }),
    );
    this.timer = setInterval(() => this.tick(), 1000);
    // Sauvegarde immédiate si Bluefy passe en arrière-plan ou ferme la page.
    const save = () => { if (document.visibilityState === 'hidden') void db.saveDraft(this.recorder.toDraft()); };
    document.addEventListener('visibilitychange', save);
    addEventListener('pagehide', save);
    this.offs.push(() => { document.removeEventListener('visibilitychange', save); removeEventListener('pagehide', save); });
  }

  private tick() {
    const now = Date.now();
    const hr = this.hr != null && now - this.hrAt < HR_STALE_MS ? this.hr : null;
    const sample = this.recorder.tick({ distM: this.tracker.distanceM(), speed: this.tracker.speedKmh(now), hr });
    if (sample) {
      this.last = sample;
      if (sample.t % DRAFT_EVERY_S === 0) void db.saveDraft(this.recorder.toDraft());
    } else {
      this.last = this.last && { ...this.last, speed: this.tracker.speedKmh(now), hr, power: 0 };
    }
    this.emit();
  }

  view(): RideView {
    const s = getSensors();
    const now = Date.now();
    return {
      elapsedS: this.recorder.elapsedS,
      distanceM: this.recorder.distanceM,
      speed: this.tracker.speedKmh(now),
      hr: this.last?.hr ?? null,
      power: this.recorder.paused || this.recorder.autoPaused ? 0 : this.last?.power ?? 0,
      level: this.recorder.currentLevel,
      paused: this.recorder.paused,
      autoPaused: this.recorder.autoPaused,
      speedState: s.state('speed'),
      hrState: s.state('hr'),
    };
  }

  setLevel(n: number) { this.recorder.setLevel(n); void db.saveDraft(this.recorder.toDraft()); this.emit(); }
  togglePause() {
    if (this.recorder.paused) this.recorder.resume(); else this.recorder.pause();
    void db.saveDraft(this.recorder.toDraft());
    this.emit();
  }

  subscribe(cb: () => void) { this.listeners.add(cb); return () => { this.listeners.delete(cb); }; }
  private emit() { this.listeners.forEach((cb) => cb()); }

  stop() {
    clearInterval(this.timer);
    this.offs.forEach((off) => off());
    this.listeners.clear();
  }
}

let active: RideController | null = null;

export const activeRide = () => active;

export async function startRide(draft: Draft | null): Promise<RideController> {
  active?.stop();
  const st = await db.getSettings();
  const rec = draft
    ? Recorder.restore(draft)
    : new Recorder({ startedAt: new Date(), level: st.defaultLevel, calib: st.calib, hrMax: st.hrMax, autoPause: st.autoPause });
  active = new RideController(rec, st.circumferenceMm);
  await db.saveDraft(rec.toDraft());
  return active;
}

/** Termine et enregistre. Renvoie null si la séance est vide (rien n'est enregistré). */
export async function finishRide(): Promise<Session | null> {
  if (!active) return null;
  active.stop();
  const session = active.recorder.finish();
  active = null;
  await db.clearDraft();
  if (!session.samples.length) return null;
  await db.saveSession(session);
  return session;
}

export async function finishDraft(d: Draft): Promise<Session | null> {
  const session = Recorder.restore(d).finish();
  await db.clearDraft();
  if (!session.samples.length) return null;
  await db.saveSession(session);
  return session;
}
