import { bestAverage, estimatePower } from './power';
import { BEST_KEYS, type Draft, type Route, type RouteState, type Sample, type Session, type Summary, type Workout } from './types';
import { climb, gradeAt, positionAt } from './gpx';
import { advanceSpeed } from './physics';
import { stepAt, stepResults } from './workout';
import { hrZone } from './zones';

export interface RecorderOptions {
  startedAt: Date;
  level: number;
  calib: number;
  hrMax: number;
  autoPause: boolean;
  id?: string;
  workout?: Workout;
  ftp?: number;
  route?: Route;
  /** poids cycliste + vélo, pour la vitesse virtuelle */
  massKg?: number;
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
  private rs: RouteState | undefined;

  constructor(private opts: RecorderOptions) {
    this.id = opts.id ?? newId();
    this.startedAt = opts.startedAt.toISOString();
    this.level = opts.level;
    if (opts.route) this.rs = { distM: 0, v: 0, done: false };
  }

  get samples(): Sample[] { return this._samples; }
  get paused(): boolean { return this.manualPause; }
  get autoPaused(): boolean { return this._autoPaused; }
  get currentLevel(): number { return this.level; }
  get distanceM(): number { return this.dist; }
  get elapsedS(): number { return this._samples.length; }
  get workout(): Workout | undefined { return this.opts.workout; }
  get ftp(): number { return this.opts.ftp ?? 200; }
  get route(): Route | undefined { return this.opts.route; }
  get routeState(): RouteState | undefined { return this.rs; }
  get massKg(): number { return this.opts.massKg ?? 80; }

  setLevel(n: number): void { this.level = Math.min(8, Math.max(1, Math.round(n))); }
  pause(): void { this.manualPause = true; }
  resume(): void { this.manualPause = false; }

  tick(input: TickInput): Sample | null {
    // Le capteur peut repartir de 0 (rechargement) : une distance qui recule devient la nouvelle référence.
    const delta = input.distM >= this.lastInputDist ? input.distM - this.lastInputDist : input.distM;
    this.lastInputDist = input.distM;
    this._autoPaused = this.opts.autoPause && !input.sensorLost && !(input.speed > 0);
    if (this.manualPause || this._autoPaused) {
      if (this.rs) this.rs.v = 0; // à l'arrêt, la vitesse virtuelle retombe
      return null;
    }
    this.dist += delta;
    const s: Sample = {
      t: this._samples.length + 1,
      distM: this.dist,
      speed: input.speed,
      hr: input.hr != null && input.hr > 0 ? input.hr : null,
      power: estimatePower(input.speed, this.level, this.opts.calib),
      level: this.level,
    };
    if (this.opts.workout) {
      const pos = stepAt(this.opts.workout.steps, this._samples.length);
      if (pos) s.step = pos.index;
    }
    const route = this.opts.route;
    if (route && this.rs && !this.rs.done) {
      const v0 = this.rs.v;
      const v1 = advanceSpeed(v0, s.power, gradeAt(route, this.rs.distM), this.massKg);
      this.rs.v = v1;
      this.rs.distM = Math.min(route.distanceM, this.rs.distM + (v0 + v1) / 2);
      const p = positionAt(route, this.rs.distM);
      Object.assign(s, { routeDistM: this.rs.distM, vSpeed: v1 * 3.6, lat: p.lat, lon: p.lon, ele: p.ele });
      if (this.rs.distM >= route.distanceM) this.rs.done = true;
    }
    this._samples.push(s);
    return s;
  }

  toDraft(): Draft {
    return {
      id: this.id, startedAt: this.startedAt, level: this.level, calib: this.opts.calib,
      hrMax: this.opts.hrMax, autoPause: this.opts.autoPause, paused: this.manualPause, samples: this._samples,
      ...(this.opts.workout ? { workout: this.opts.workout, ftp: this.ftp } : {}),
      ...(this.opts.route ? { route: this.opts.route, massKg: this.massKg, routeState: { ...this.rs! } } : {}),
    };
  }

  static restore(d: Draft): Recorder {
    const r = new Recorder({ id: d.id, startedAt: new Date(d.startedAt), level: d.level, calib: d.calib, hrMax: d.hrMax, autoPause: d.autoPause, workout: d.workout, ftp: d.ftp, route: d.route, massKg: d.massKg });
    if (d.route && d.routeState) r.rs = { ...d.routeState };
    r._samples = [...d.samples];
    r.dist = d.samples.length ? d.samples[d.samples.length - 1].distM : 0;
    r.manualPause = d.paused;
    return r;
  }

  finish(): Session {
    const s: Session = { id: this.id, startedAt: this.startedAt, samples: this._samples, summary: summarize(this._samples, this.opts.hrMax) };
    const w = this.opts.workout;
    if (w) s.workout = { name: w.name, ftp: this.ftp, steps: w.steps, results: stepResults(this._samples, w.steps) };
    const route = this.opts.route;
    if (route && this.rs) {
      const gain = climb([route.points[0].ele, ...this._samples.filter((p) => p.ele != null).map((p) => p.ele!)]);
      s.route = { id: route.id, name: route.name, distanceM: route.distanceM, gainM: route.gainM,
        routeDistM: this.rs.distM, gainDoneM: gain, completed: this.rs.done };
    }
    return s;
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
