import type { SensorState } from './ble';

/** Ce dont la liaison a besoin d'un appareil Bluetooth (réel ou simulé). */
export interface LinkDevice {
  /** Connecte et active les notifications. */
  open(onData: (dv: DataView) => void): Promise<void>;
  /** Coupe la connexion (sans erreur si déjà coupée). */
  close(): void;
  /** Appelé par l'appareil quand la connexion est perdue. */
  onDisconnected(cb: () => void): void;
}

export interface LinkOptions {
  /** délai maximal d'une tentative de connexion */
  timeoutMs: number;
  /** au-delà de ce délai sans données alors que « connecté », on relance la connexion */
  watchdogMs: number;
  /** attentes successives entre les tentatives ; la dernière sert ensuite de plafond */
  delaysMs: number[];
}

export interface LinkEvents {
  onData(dv: DataView): void;
  onState(s: SensorState): void;
}

/**
 * Gère une liaison avec un capteur : connexion avec délai maximal, reconnexion sans fin avec attente croissante,
 * une seule chaîne de tentatives à la fois, et chien de garde contre les capteurs « muets ».
 */
export class SensorLink {
  dropouts = 0;
  private state: SensorState = 'deconnecte';
  private wanted = false;
  private attempt = 0;
  private generation = 0;
  private lastDataAt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private watchdog: ReturnType<typeof setInterval> | undefined;

  constructor(private dev: LinkDevice, private opts: LinkOptions, private ev: LinkEvents) {
    dev.onDisconnected(() => this.lost());
  }

  /** Première connexion (après le choix de l'appareil). Rejette si elle échoue : pas de nouvelle tentative. */
  async start(): Promise<void> {
    this.wanted = true;
    this.dropouts = 0;
    this.set('connexion');
    try {
      await this.open();
      // « Déconnecter » touché pendant la connexion : on referme ce qui vient d'aboutir.
      if (!this.wanted) throw new Error('Connexion annulée.');
    } catch (e) {
      this.wanted = false;
      this.dev.close();
      this.set('deconnecte');
      throw e;
    }
    this.connected();
  }

  stop(): void {
    this.wanted = false;
    this.generation++;
    clearTimeout(this.retryTimer);
    clearInterval(this.watchdog);
    this.dev.close();
    this.set('deconnecte');
  }

  get currentState(): SensorState { return this.state; }

  private set(s: SensorState) {
    if (s === this.state) return;
    this.state = s;
    this.ev.onState(s);
  }

  private open(): Promise<void> {
    const gen = ++this.generation;
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Le capteur ne répond pas (délai dépassé).')), this.opts.timeoutMs);
      this.dev.open((dv) => {
        if (gen !== this.generation) return; // ancienne connexion
        this.lastDataAt = Date.now();
        this.ev.onData(dv);
      }).then(
        () => { clearTimeout(timer); resolve(); },
        (e) => { clearTimeout(timer); reject(e); },
      );
    });
  }

  private connected() {
    this.attempt = 0;
    this.lastDataAt = Date.now();
    this.set('connecte');
    clearInterval(this.watchdog);
    let lastTick = Date.now();
    this.watchdog = setInterval(() => {
      const now = Date.now();
      const asleep = now - lastTick > 3000; // l'app était en arrière-plan : minuteries suspendues
      lastTick = now;
      if (asleep) { this.lastDataAt = now; return; }
      if (this.state === 'connecte' && now - this.lastDataAt > this.opts.watchdogMs) {
        this.dev.close();
        this.lost();
      }
    }, 1000);
  }

  /** Connexion perdue (événement de l'appareil ou chien de garde). */
  private lost() {
    if (!this.wanted || this.state !== 'connecte') return;
    this.dropouts++;
    clearInterval(this.watchdog);
    this.set('reconnexion');
    this.schedule();
  }

  private schedule() {
    clearTimeout(this.retryTimer);
    const d = this.opts.delaysMs;
    const delay = d[Math.min(this.attempt, d.length - 1)];
    this.attempt++;
    this.retryTimer = setTimeout(() => void this.retry(), delay);
  }

  private async retry() {
    if (!this.wanted) return;
    try {
      await this.open();
    } catch {
      if (!this.wanted) return;
      this.dev.close();
      this.schedule();
      return;
    }
    if (!this.wanted) {
      this.dev.close(); // arrêté pendant la tentative : ne pas laisser le capteur connecté
      return;
    }
    this.connected();
  }
}
