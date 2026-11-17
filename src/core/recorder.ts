import { bestAverage, estimatePower } from './power';
import { BEST_KEYS, type Draft, type Sample, type Session, type Summary } from './types';
import { hrZone } from './zones';

export interface RecorderOptions {
  startedAt: Date;
  level: number;
  calib: number;
  hrMax: number;
  autoPause: boolean;
  id?: string;
}

export interface TickInput {
  /** distance cumulée renvoyée par le WheelTracker (peut repartir de 0 après rechargement) */
  distM: number;
  speed: number;
  hr: number | null;
  /** capteur de vitesse en reconnexion : on continue d'enregistrer (pas de pause auto) */
  sensorLost?: boolean;
}

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Enregistre la séance à raison d'un échantillon par seconde (tick). */
export class Recorder {
  readonly id: string;
  readonly startedAt: string;
  private level: number;
  private _samples: Sample[] = [];
  private manualPause = false;
  private _autoPaused = false;
  private lastInputDist = 0;
  private dist = 0;

  constructor(private opts: RecorderOptions) {
    this.id = opts.id ?? newId();
    this.startedAt = opts.startedAt.toISOString();
    this.level = opts.level;
  }

  get samples(): Sample[] { return this._samples; }
  get paused(): boolean { return this.manualPause; }
  get autoPaused(): boolean { return this._autoPaused; }
  get currentLevel(): number { return this.level; }
  get distanceM(): number { return this.dist; }
  get elapsedS(): number { return this._samples.length; }

  setLevel(n: number): void { this.level = Math.min(8, Math.max(1, Math.round(n))); }
  pause(): void { this.manualPause = true; }
  resume(): void { this.manualPause = false; }

  tick(input: TickInput): Sample | null {
    // Le capteur peut repartir de 0 (rechargement) : une distance qui recule devient la nouvelle référence.
    const delta = input.distM >= this.lastInputDist ? input.distM - this.lastInputDist : input.distM;
    this.lastInputDist = input.distM;
    this._autoPaused = this.opts.autoPause && !input.sensorLost && !(input.speed > 0);
    if (this.manualPause || this._autoPaused) return null;
    this.dist += delta;
    const s: Sample = {
      t: this._samples.length + 1,
      distM: this.dist,
      speed: input.speed,
      hr: input.hr != null && input.hr > 0 ? input.hr : null,
      power: estimatePower(input.speed, this.level, this.opts.calib),
      level: this.level,
    };
    this._samples.push(s);
    return s;
  }

  toDraft(): Draft {
    return {
      id: this.id, startedAt: this.startedAt, level: this.level, calib: this.opts.calib,
      hrMax: this.opts.hrMax, autoPause: this.opts.autoPause, paused: this.manualPause, samples: this._samples,
    };
  }

  static restore(d: Draft): Recorder {
    const r = new Recorder({ id: d.id, startedAt: new Date(d.startedAt), level: d.level, calib: d.calib, hrMax: d.hrMax, autoPause: d.autoPause });
    r._samples = [...d.samples];
    r.dist = d.samples.length ? d.samples[d.samples.length - 1].distM : 0;
    r.manualPause = d.paused;
    return r;
  }

  finish(): Session {
    return { id: this.id, startedAt: this.startedAt, samples: this._samples, summary: summarize(this._samples, this.opts.hrMax) };
  }
}

export function summarize(samples: Sample[], hrMax: number): Summary {
  const n = samples.length;
  const distanceM = n ? samples[n - 1].distM : 0;
  const hrs = samples.map((s) => s.hr).filter((h): h is number => h != null);
  const powers = samples.map((s) => s.power);
  const zones = [0, 0, 0, 0, 0];
  for (const h of hrs) zones[hrZone(h, hrMax)]++;
  const best = {} as Summary['best'];
  for (const k of BEST_KEYS) {
    const b = bestAverage(powers, Number(k));
    best[k] = b == null ? null : Math.round(b);
  }
  return {
    durationS: n,
    distanceM,
    avgSpeed: n ? (distanceM / n) * 3.6 : 0,
    maxSpeed: n ? Math.max(...samples.map((s) => s.speed)) : 0,
    avgHr: hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : null,
    maxHr: hrs.length ? Math.max(...hrs) : null,
    avgPower: n ? Math.round(powers.reduce((a, b) => a + b, 0) / n) : 0,
    maxPower: n ? Math.max(...powers) : 0,
    best,
    hrZonesS: zones,
  };
}
