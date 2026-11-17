import { parseCsc } from '../core/csc';
import { parseHr } from '../core/hr';

// Typage minimal de Web Bluetooth (absent de lib.dom).
interface BtChar extends EventTarget { value?: DataView; startNotifications(): Promise<BtChar> }
interface BtService { getCharacteristic(uuid: number): Promise<BtChar> }
interface BtServer { connected: boolean; connect(): Promise<BtServer>; disconnect(): void; getPrimaryService(uuid: number): Promise<BtService> }
interface BtDevice extends EventTarget { id: string; name?: string; gatt?: BtServer }
interface Bt { requestDevice(o: { filters: { services: number[] }[] }): Promise<BtDevice> }

export type SensorKind = 'speed' | 'hr';
export type SensorState = 'deconnecte' | 'connexion' | 'connecte' | 'reconnexion';
export interface WheelData { wheelRevs: number; wheelTime: number }

export interface Sensors {
  connect(kind: SensorKind): Promise<void>;
  disconnect(kind: SensorKind): void;
  state(kind: SensorKind): SensorState;
  deviceName(kind: SensorKind): string | undefined;
  onCsc(cb: (r: WheelData) => void): () => void;
  onHr(cb: (bpm: number) => void): () => void;
  onState(cb: (kind: SensorKind, state: SensorState) => void): () => void;
}

const UUIDS: Record<SensorKind, { service: number; char: number }> = {
  speed: { service: 0x1816, char: 0x2a5b },
  hr: { service: 0x180d, char: 0x2a37 },
};

function bt(): Bt | undefined {
  return (navigator as unknown as { bluetooth?: Bt }).bluetooth;
}

export function isBluetoothAvailable(): boolean {
  return !!bt();
}

export function isSimulation(): boolean {
  return new URLSearchParams(location.search).has('sim');
}

class Emitter<T extends unknown[]> {
  private cbs = new Set<(...a: T) => void>();
  on(cb: (...a: T) => void) { this.cbs.add(cb); return () => { this.cbs.delete(cb); }; }
  emit(...a: T) { this.cbs.forEach((cb) => cb(...a)); }
}

abstract class BaseSensors implements Sensors {
  protected states: Record<SensorKind, SensorState> = { speed: 'deconnecte', hr: 'deconnecte' };
  protected names: Partial<Record<SensorKind, string>> = {};
  protected csc = new Emitter<[WheelData]>();
  protected hr = new Emitter<[number]>();
  protected st = new Emitter<[SensorKind, SensorState]>();
  abstract connect(kind: SensorKind): Promise<void>;
  abstract disconnect(kind: SensorKind): void;
  state(k: SensorKind) { return this.states[k]; }
  deviceName(k: SensorKind) { return this.names[k]; }
  onCsc(cb: (r: WheelData) => void) { return this.csc.on(cb); }
  onHr(cb: (bpm: number) => void) { return this.hr.on(cb); }
  onState(cb: (k: SensorKind, s: SensorState) => void) { return this.st.on(cb); }
  protected set(k: SensorKind, s: SensorState) { this.states[k] = s; this.st.emit(k, s); }
}

class WebBluetoothSensors extends BaseSensors {
  private devices: Partial<Record<SensorKind, BtDevice>> = {};
  private wanted: Record<SensorKind, boolean> = { speed: false, hr: false };
  private timers: Partial<Record<SensorKind, ReturnType<typeof setTimeout>>> = {};

  async connect(kind: SensorKind): Promise<void> {
    const b = bt();
    if (!b) throw new Error("Le Bluetooth n'est pas disponible dans ce navigateur. Ouvre l'app dans Bluefy.");
    // requestDevice doit être appelé directement depuis un appui de l'utilisateur.
    const device = await b.requestDevice({ filters: [{ services: [UUIDS[kind].service] }] });
    this.devices[kind] = device;
    this.names[kind] = device.name;
    this.wanted[kind] = true;
    device.addEventListener('gattserverdisconnected', () => this.onDrop(kind));
    this.set(kind, 'connexion');
    try {
      await this.attach(kind);
    } catch (e) {
      this.wanted[kind] = false;
      this.set(kind, 'deconnecte');
      throw e;
    }
  }

  disconnect(kind: SensorKind): void {
    this.wanted[kind] = false;
    clearTimeout(this.timers[kind]);
    this.devices[kind]?.gatt?.disconnect();
    this.set(kind, 'deconnecte');
  }

  private async attach(kind: SensorKind) {
    const dev = this.devices[kind]!;
    const server = await dev.gatt!.connect();
    const service = await server.getPrimaryService(UUIDS[kind].service);
    const ch = await service.getCharacteristic(UUIDS[kind].char);
    ch.addEventListener('characteristicvaluechanged', () => {
      if (!ch.value) return;
      if (kind === 'hr') this.hr.emit(parseHr(ch.value));
      else {
        const r = parseCsc(ch.value);
        if (r.wheelRevs != null && r.wheelTime != null) this.csc.emit({ wheelRevs: r.wheelRevs, wheelTime: r.wheelTime });
      }
    });
    await ch.startNotifications();
    this.set(kind, 'connecte');
  }

  private onDrop(kind: SensorKind) {
    if (!this.wanted[kind]) return;
    this.set(kind, 'reconnexion');
    const retry = async () => {
      if (!this.wanted[kind]) return;
      try {
        await this.attach(kind);
      } catch {
        this.timers[kind] = setTimeout(retry, 2000);
      }
    };
    this.timers[kind] = setTimeout(retry, 500);
  }
}

/** Faux capteurs pour tester sans matériel (?sim=1). */
class SimulatedSensors extends BaseSensors {
  private timers: Partial<Record<SensorKind, ReturnType<typeof setInterval>>> = {};
  private revs = 0;
  private time = 0;
  private frac = 0;

  async connect(kind: SensorKind): Promise<void> {
    this.set(kind, 'connexion');
    await new Promise((r) => setTimeout(r, 300));
    this.names[kind] = kind === 'speed' ? 'Capteur simulé' : 'Ceinture simulée';
    this.set(kind, 'connecte');
    const start = Date.now();
    if (kind === 'speed') {
      this.timers.speed = setInterval(() => {
        const kmh = 30 + 3 * Math.sin((Date.now() - start) / 20000) + (Math.random() - 0.5);
        this.frac += (kmh / 3.6) / 2.105; // tours par seconde
        const whole = Math.floor(this.frac);
        this.frac -= whole;
        this.revs = (this.revs + whole) >>> 0;
        this.time = (this.time + 1024) % 65536;
        this.csc.emit({ wheelRevs: this.revs, wheelTime: this.time });
      }, 1000);
    } else {
      this.timers.hr = setInterval(() => {
        this.hr.emit(Math.round(140 + 10 * Math.sin((Date.now() - start) / 30000) + (Math.random() - 0.5) * 3));
      }, 1000);
    }
  }

  disconnect(kind: SensorKind): void {
    clearInterval(this.timers[kind]);
    this.set(kind, 'deconnecte');
  }
}

let shared: Sensors | null = null;

/** Instance unique pour toute l'app (les connexions survivent aux changements d'écran). */
export function getSensors(): Sensors {
  if (!shared) shared = isSimulation() ? new SimulatedSensors() : new WebBluetoothSensors();
  return shared;
}
