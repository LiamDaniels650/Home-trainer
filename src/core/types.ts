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
}

export interface Totals {
  count: number;
  durationS: number;
  distanceM: number;
}
