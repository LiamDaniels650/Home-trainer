import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { SensorLink, type LinkDevice } from '../src/io/link';

class FakeDevice implements LinkDevice {
  opens = 0;
  closes = 0;
  mode: 'ok' | 'fail' | 'hang' | 'slow' = 'ok';
  private dropCb: (() => void) | null = null;
  private dataCb: ((dv: DataView) => void) | null = null;
  async open(onData: (dv: DataView) => void) {
    this.opens++;
    if (this.mode === 'fail') throw new Error('échec');
    if (this.mode === 'hang') return new Promise<void>(() => {});
    if (this.mode === 'slow') { this.dataCb = onData; return new Promise<void>((r) => setTimeout(r, 3000)); }
    this.dataCb = onData;
  }
  close() { this.closes++; }
  onDisconnected(cb: () => void) { this.dropCb = cb; }
  drop() { this.dropCb?.(); }
  send() { this.dataCb?.(new DataView(new ArrayBuffer(2))); }
}

let dev: FakeDevice;
let states: string[];
let data: number;
let link: SensorLink;
const opts = { timeoutMs: 10000, watchdogMs: 8000, delaysMs: [2000, 4000, 8000, 10000] };

beforeEach(() => {
  vi.useFakeTimers();
  dev = new FakeDevice();
  states = [];
  data = 0;
  link = new SensorLink(dev, opts, { onData: () => data++, onState: (s) => states.push(s) });
});
afterEach(() => { link.stop(); vi.useRealTimers(); });

test('première connexion réussie', async () => {
  await link.start();
  expect(states).toEqual(['connexion', 'connecte']);
  dev.send();
  expect(data).toBe(1);
});

test('première connexion en échec : erreur, pas de nouvelle tentative', async () => {
  dev.mode = 'fail';
  await expect(link.start()).rejects.toThrow('échec');
  expect(states.at(-1)).toBe('deconnecte');
  await vi.advanceTimersByTimeAsync(60000);
  expect(dev.opens).toBe(1);
});

test('première connexion bloquée : abandon après le délai maximal', async () => {
  dev.mode = 'hang';
  const p = link.start();
  const check = expect(p).rejects.toThrow(/délai/i);
  await vi.advanceTimersByTimeAsync(10000);
  await check;
});

test('coupure : reconnexion avec attente croissante, sans fin', async () => {
  await link.start();
  dev.mode = 'fail';
  dev.drop();
  expect(states.at(-1)).toBe('reconnexion');
  expect(link.dropouts).toBe(1);
  await vi.advanceTimersByTimeAsync(2000); // tentative 1
  expect(dev.opens).toBe(2);
  await vi.advanceTimersByTimeAsync(4000); // tentative 2
  expect(dev.opens).toBe(3);
  await vi.advanceTimersByTimeAsync(8000); // tentative 3
  await vi.advanceTimersByTimeAsync(10000); // tentative 4
  await vi.advanceTimersByTimeAsync(10000); // tentative 5 (plafond)
  expect(dev.opens).toBe(6);
  dev.mode = 'ok';
  await vi.advanceTimersByTimeAsync(10000);
  expect(states.at(-1)).toBe('connecte');
  expect(dev.opens).toBe(7);
});

test('une tentative bloquée ne stoppe pas les suivantes', async () => {
  await link.start();
  dev.mode = 'hang';
  dev.drop();
  await vi.advanceTimersByTimeAsync(2000); // tentative qui bloque
  expect(dev.opens).toBe(2);
  dev.mode = 'ok';
  await vi.advanceTimersByTimeAsync(10000 + 4000); // délai max puis nouvelle tentative
  expect(dev.opens).toBe(3);
  expect(states.at(-1)).toBe('connecte');
});

test('plusieurs événements de coupure : une seule chaîne de reconnexion', async () => {
  await link.start();
  dev.mode = 'fail';
  dev.drop();
  dev.drop();
  dev.drop();
  await vi.advanceTimersByTimeAsync(2000);
  expect(dev.opens).toBe(2);
  expect(link.dropouts).toBe(1);
});

test('capteur muet : le chien de garde relance la connexion', async () => {
  await link.start();
  dev.send();
  await vi.advanceTimersByTimeAsync(7000);
  expect(states.at(-1)).toBe('connecte');
  await vi.advanceTimersByTimeAsync(2000); // > 8 s sans données
  expect(states.at(-1)).toBe('reconnexion');
  expect(dev.closes).toBe(1);
  expect(link.dropouts).toBe(1);
  await vi.advanceTimersByTimeAsync(2000);
  expect(states.at(-1)).toBe('connecte');
});

test('des données régulières évitent le chien de garde', async () => {
  await link.start();
  for (let i = 0; i < 30; i++) { dev.send(); await vi.advanceTimersByTimeAsync(1000); }
  expect(states.at(-1)).toBe('connecte');
  expect(link.dropouts).toBe(0);
});

test('stop : plus aucune tentative', async () => {
  await link.start();
  dev.mode = 'fail';
  dev.drop();
  link.stop();
  expect(states.at(-1)).toBe('deconnecte');
  await vi.advanceTimersByTimeAsync(60000);
  expect(dev.opens).toBe(1);
});

test('Déconnecter pendant la première connexion : pas de faux « connecté »', async () => {
  dev.mode = 'slow';
  const p = link.start();
  const check = expect(p).rejects.toThrow(/annul/i);
  link.stop();
  await vi.advanceTimersByTimeAsync(3000);
  await check;
  expect(states.at(-1)).toBe('deconnecte');
  expect(dev.closes).toBeGreaterThanOrEqual(2); // stop() + fermeture de la connexion arrivée trop tard
  await vi.advanceTimersByTimeAsync(60000);
  expect(states.at(-1)).toBe('deconnecte'); // pas de chien de garde orphelin
  expect(link.dropouts).toBe(0);
});

test('Déconnecter pendant une reconnexion : la connexion tardive est refermée', async () => {
  await link.start();
  dev.mode = 'slow';
  dev.drop();
  await vi.advanceTimersByTimeAsync(2000); // tentative lente lancée
  link.stop();
  const closes = dev.closes;
  await vi.advanceTimersByTimeAsync(3000);
  expect(dev.closes).toBe(closes + 1);
  expect(states.at(-1)).toBe('deconnecte');
});

test('retour de veille : pas de fausse coupure', async () => {
  await link.start();
  dev.send();
  // l'app était en arrière-plan : les minuteries n'ont pas tourné pendant 60 s
  vi.setSystemTime(Date.now() + 60000);
  await vi.advanceTimersByTimeAsync(1000);
  expect(states.at(-1)).toBe('connecte');
  expect(link.dropouts).toBe(0);
  // mais un vrai silence est toujours détecté ensuite
  await vi.advanceTimersByTimeAsync(9000);
  expect(states.at(-1)).toBe('reconnexion');
});
