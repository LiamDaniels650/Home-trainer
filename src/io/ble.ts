import { parseCsc } from '../core/csc';
import { parseHr } from '../core/hr';
import { SensorLink, type LinkDevice, type LinkOptions } from './link';

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
  /** nombre de coupures depuis la connexion */
  dropouts(kind: SensorKind): number;
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
  dropouts(_k: SensorKind): number { return 0; }
  state(k: SensorKind) { return this.states[k]; }
  deviceName(k: SensorKind) { return this.names[k]; }
  onCsc(cb: (r: WheelData) => void) { return this.csc.on(cb); }
  onHr(cb: (bpm: number) => void) { return this.hr.on(cb); }
  onState(cb: (k: SensorKind, s: SensorState) => void) { return this.st.on(cb); }
  protected set(k: SensorKind, s: SensorState) { if (this.states[k] === s) return; this.states[k] = s; this.st.emit(k, s); }
}

/** Adapte un appareil Web Bluetooth à SensorLink (une seule écoute par appareil). */
class WebDevice implements LinkDevice {
  private sink: (dv: DataView) => void = () => {};
  private readonly handler = (e: Event) => {
    const v = (e.target as BtChar).value;
    if (v) this.sink(v);
  };
  constructor(private device: BtDevice, private kind: SensorKind) {}
  async open(onData: (dv: DataView) => void) {
    this.sink = onData;
    const server = await this.device.gatt!.connect();
    const service = await server.getPrimaryService(UUIDS[this.kind].service);
    const ch = await service.getCharacteristic(UUIDS[this.kind].char);
    ch.removeEventListener('characteristicvaluechanged', this.handler);
    ch.addEventListener('characteristicvaluechanged', this.handler);
    await ch.startNotifications();
  }
  close() {
    // Sans condition : disconnect() annule aussi une connexion encore en cours.
    try { this.device.gatt?.disconnect(); } catch { /* déjà coupé */ }
  }
  onDisconnected(cb: () => void) {
    this.device.addEventListener('gattserverdisconnected', cb);
  }
}

// La ceinture envoie ~1 message/s en continu : 8 s de silence = liaison morte.
// Le capteur de vitesse peut se taire quand la roue est arrêtée : pas de chien de garde.
const LINK_OPTS: Record<SensorKind, LinkOptions> = {
  hr: { timeoutMs: 10000, watchdogMs: 8000, delaysMs: [2000, 4000, 8000, 10000] },
  speed: { timeoutMs: 10000, watchdogMs: Number.POSITIVE_INFINITY, delaysMs: [2000, 4000, 8000, 10000] },
};

class WebBluetoothSensors extends BaseSensors {
  private links: Partial<Record<SensorKind, SensorLink>> = {};

  async connect(kind: SensorKind): Promise<void> {
    const b = bt();
    if (!b) throw new Error("Le Bluetooth n'est pas disponible dans ce navigateur. Ouvre l'app dans Bluefy.");
    // requestDevice doit être appelé directement depuis un appui de l'utilisateur.
    const device = await b.requestDevice({ filters: [{ services: [UUIDS[kind].service] }] });
    this.links[kind]?.stop();
    this.names[kind] = device.name;
    const link = new SensorLink(new WebDevice(device, kind), LINK_OPTS[kind], {
      onData: (dv) => {
        if (kind === 'hr') this.hr.emit(parseHr(dv));
        else {
          const r = parseCsc(dv);
          if (r.wheelRevs != null && r.wheelTime != null) this.csc.emit({ wheelRevs: r.wheelRevs, wheelTime: r.wheelTime });
        }
      },
      // une ancienne liaison (remplacée ou arrêtée) ne doit plus changer l'état affiché
      onState: (st) => { if (this.links[kind] === link) this.set(kind, st); },
    });
    this.links[kind] = link;
    await link.start();
  }

  disconnect(kind: SensorKind): void {
    this.links[kind]?.stop();
    delete this.links[kind];
    this.set(kind, 'deconnecte');
  }

  dropouts(kind: SensorKind): number {
    return this.links[kind]?.dropouts ?? 0;
  }
}

/** Faux capteurs pour tester sans matériel (?sim=1). */
class SimulatedSensors extends BaseSensors {
  private timers: Partial<Record<SensorKind, ReturnType<typeof setInterval>>> = {};
  private revs = 0;
  private time = 0;
  private frac = 0;
  private clock = 0;

  async connect(kind: SensorKind): Promise<void> {
    this.set(kind, 'connexion');
    await new Promise((r) => setTimeout(r, 300));
    this.names[kind] = kind === 'speed' ? 'Capteur simulé' : 'Ceinture simulée';
    this.set(kind, 'connecte');
    const start = Date.now();
    if (kind === 'speed') {
      this.timers.speed = setInterval(() => {
        const kmh = 30 + 3 * Math.sin((Date.now() - start) / 20000) + (Math.random() - 0.5);
        const rps = kmh / 3.6 / 2.105;
        this.clock += 1;
        this.frac += rps;
        const whole = Math.floor(this.frac);
        this.frac -= whole;
        this.revs = (this.revs + whole) >>> 0;
        // horodatage du dernier tour complet, comme un vrai capteur
        this.time = Math.round((this.clock - this.frac / rps) * 1024) % 65536;
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
