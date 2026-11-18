export interface CscReading {
  wheelRevs?: number;
  wheelTime?: number;
  crankRevs?: number;
  crankTime?: number;
}

export interface Sample {
  /** secondes de temps actif depuis le début */
  t: number;
  distM: number;
  speed: number;
  hr: number | null;
  power: number;
  level: number;
  /** index de l'étape de la séance guidée */
  step?: number;
}

export type BestKey = '5' | '60' | '300' | '1200';
export const BEST_KEYS: BestKey[] = ['5', '60', '300', '1200'];

export interface Summary {
  durationS: number;
  distanceM: number;
  avgSpeed: number;
  maxSpeed: number;
  avgHr: number | null;
  maxHr: number | null;
  avgPower: number;
  maxPower: number;
  best: Record<BestKey, number | null>;
  /** secondes passées dans chacune des 5 zones FC */
  hrZonesS: number[];
}

export interface Session {
  id: string;
  startedAt: string;
  samples: Sample[];
  summary: Summary;
  stravaId?: number;
  workout?: SessionWorkout;
}

export interface SessionWorkout {
  name: string;
  ftp: number;
  steps: WorkoutStep[];
  results: StepResult[];
}

export interface Draft {
  id: string;
  startedAt: string;
  level: number;
  calib: number;
  hrMax: number;
  autoPause: boolean;
  paused: boolean;
  samples: Sample[];
  workout?: Workout;
  ftp?: number;
}

export interface Totals {
  count: number;
  durationS: number;
  distanceM: number;
}

export type StepKind = 'warmup' | 'work' | 'rest' | 'cooldown';

export interface WorkoutStep {
  durationS: number;
  kind: StepKind;
  /** cible en % de la FTP */
  pct: number;
}

export interface Workout {
  id: string;
  name: string;
  steps: WorkoutStep[];
  builtin?: boolean;
}

export interface StepResult {
  durationS: number;
  avgPower: number | null;
  avgHr: number | null;
}

export interface RoutePoint {
  lat: number;
  lon: number;
  ele: number;
  /** distance cumulée depuis le départ (m) */
  d: number;
}

export interface Route {
  id: string;
  name: string;
  points: RoutePoint[];
  distanceM: number;
  gainM: number;
  hasElevation: boolean;
}
