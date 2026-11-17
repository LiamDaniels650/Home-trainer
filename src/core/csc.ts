import type { CscReading } from './types';

/** Décode la caractéristique CSC Measurement (0x2A5B). */
export function parseCsc(dv: DataView): CscReading {
  const flags = dv.getUint8(0);
  let o = 1;
  const r: CscReading = {};
  if (flags & 0x01) {
    r.wheelRevs = dv.getUint32(o, true);
    r.wheelTime = dv.getUint16(o + 4, true);
    o += 6;
  }
  if (flags & 0x02) {
    r.crankRevs = dv.getUint16(o, true);
    r.crankTime = dv.getUint16(o + 2, true);
  }
  return r;
}

const STOP_AFTER_MS = 3000;
const MAX_REVS_PER_PACKET = 100;

/** Calcule distance et vitesse à partir des compteurs cumulés du capteur de roue. */
export class WheelTracker {
  private prevRevs: number | null = null;
  private prevTime = 0;
  private lastRevChangeMs = 0;
  private speed = 0;
  private totalRevs = 0;

  constructor(private circumferenceMm: number) {}

  update(revs: number, time1024: number, nowMs: number): void {
    if (this.prevRevs === null) {
      this.setRef(revs, time1024, nowMs);
      return;
    }
    const dRevs = (revs - this.prevRevs) >>> 0;
    const dTime = (time1024 - this.prevTime + 65536) % 65536;
    if (dRevs === 0 || dTime === 0) return;
    if (dRevs > MAX_REVS_PER_PACKET) {
      this.setRef(revs, time1024, nowMs);
      return;
    }
    this.totalRevs += dRevs;
    if (nowMs - this.lastRevChangeMs > STOP_AFTER_MS) {
      // Reprise après un arrêt : le temps 16 bits a pu reboucler (toutes les 64 s),
      // la vitesse de ce paquet n'est pas fiable. On compte la distance et on attend le paquet suivant.
      this.prevRevs = revs;
      this.prevTime = time1024;
      this.lastRevChangeMs = nowMs;
      this.speed = 0;
      return;
    }
    const metersPerSec = (dRevs * this.circumferenceMm) / 1000 / (dTime / 1024);
    this.speed = metersPerSec * 3.6;
    this.prevRevs = revs;
    this.prevTime = time1024;
    this.lastRevChangeMs = nowMs;
  }

  speedKmh(nowMs: number): number {
    if (this.prevRevs === null || nowMs - this.lastRevChangeMs > STOP_AFTER_MS) return 0;
    return this.speed;
  }

  distanceM(): number {
    return (this.totalRevs * this.circumferenceMm) / 1000;
  }

  /** À appeler après une reconnexion : le prochain paquet sert de nouvelle référence. */
  reset(): void {
    this.prevRevs = null;
    this.speed = 0;
  }

  private setRef(revs: number, time1024: number, nowMs: number) {
    this.prevRevs = revs;
    this.prevTime = time1024;
    this.lastRevChangeMs = nowMs;
    this.speed = 0;
  }
}
