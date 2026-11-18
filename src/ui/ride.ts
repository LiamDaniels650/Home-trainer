import { WheelTracker } from '../core/csc';
import { Recorder } from '../core/recorder';
import type { Draft, Route, Sample, Session, Workout } from '../core/types';
import { stepAt, type StepPosition } from '../core/workout';
import { beep } from '../io/audio';
import { getSensors, type SensorKind, type SensorState } from '../io/ble';
import * as db from '../io/db';
import { releaseAwake } from '../io/wakelock';

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
  /** étape en cours de la séance guidée (null : séance libre ou guidage terminé) */
  step: StepPosition | null;
  workoutDone: boolean;
  ftp: number;
  calib: number;
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

  constructor(readonly recorder: Recorder, circumferenceMm: number, private calib = 1) {
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
    const sensorLost = getSensors().state('speed') === 'reconnexion';
    const sample = this.recorder.tick({ distM: this.tracker.distanceM(), speed: this.tracker.speedKmh(now), hr, sensorLost });
    if (sample) {
      this.last = sample;
      this.cue();
      if (sample.t % DRAFT_EVERY_S === 0) void db.saveDraft(this.recorder.toDraft());
    } else {
      this.last = this.last && { ...this.last, speed: this.tracker.speedKmh(now), hr, power: 0 };
    }
    this.emit();
  }

  /** Bips : 3, 2, 1 avant chaque changement d'étape, puis un bip long au changement. */
  private cue() {
    const w = this.recorder.workout;
    if (!w) return;
    const pos = stepAt(w.steps, this.recorder.elapsedS);
    const prev = stepAt(w.steps, this.recorder.elapsedS - 1);
    if (pos && prev && pos.index !== prev.index) beep(1320, 0.45);
    else if (!pos && prev) beep(1320, 0.8);
    else if (pos && pos.remainingS <= 3) beep(880, 0.12);
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
      step: this.recorder.workout ? stepAt(this.recorder.workout.steps, this.recorder.elapsedS) : null,
      workoutDone: !!this.recorder.workout && !stepAt(this.recorder.workout.steps, this.recorder.elapsedS),
      ftp: this.recorder.ftp,
      calib: this.calib,
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

let pending: Workout | null = null;
let pendingRouteV: Route | null = null;

/** Séance guidée choisie, utilisée au prochain « Commencer » (remplace une route choisie). */
export function setPendingWorkout(w: Workout | null): void { pending = w; if (w) pendingRouteV = null; }
export function pendingWorkout(): Workout | null { return pending; }
/** Route choisie, utilisée au prochain « Commencer » (remplace une séance guidée choisie). */
export function setPendingRoute(r: Route | null): void { pendingRouteV = r; if (r) pending = null; }
export function pendingRoute(): Route | null { return pendingRouteV; }

export async function startRide(draft: Draft | null): Promise<RideController> {
  active?.stop();
  const st = await db.getSettings();
  const workout = draft ? undefined : pending ?? undefined;
  const route = draft ? undefined : pendingRouteV ?? undefined;
  if (!draft) { pending = null; pendingRouteV = null; } // en cas de reprise, le choix reste en attente
  const rec = draft
    ? Recorder.restore(draft)
    : new Recorder({ startedAt: new Date(), level: st.defaultLevel, calib: st.calib, hrMax: st.hrMax, autoPause: st.autoPause, workout, ftp: st.ftp, route, massKg: st.massKg });
  active = new RideController(rec, st.circumferenceMm, draft?.calib ?? st.calib);
  await db.saveDraft(rec.toDraft());
  return active;
}

/** Termine et enregistre. Renvoie null si la séance est vide (rien n'est enregistré). */
export async function finishRide(): Promise<Session | null> {
  if (!active) return null;
  const session = active.recorder.finish();
  // Enregistrer d'abord : en cas d'échec, la séance continue et le brouillon reste.
  if (session.samples.length) await db.saveSession(session);
  active.stop();
  active = null;
  releaseAwake();
  await db.clearDraft();
  return session.samples.length ? session : null;
}

export async function finishDraft(d: Draft): Promise<Session | null> {
  const session = Recorder.restore(d).finish();
  if (session.samples.length) await db.saveSession(session);
  await db.clearDraft();
  return session.samples.length ? session : null;
}
