// @vitest-environment jsdom
import { expect, test } from 'vitest';
import { summarize } from '../src/core/recorder';
import { toTcx } from '../src/core/tcx';
import type { Sample, Session } from '../src/core/types';

const samples: Sample[] = [
  { t: 1, distM: 8.3, speed: 30, hr: null, power: 213, level: 3 },
  { t: 2, distM: 16.6, speed: 30, hr: 141, power: 213, level: 3 },
  { t: 3, distM: 25.1, speed: 30.5, hr: 142, power: 218, level: 3 },
];
const session: Session = { id: 'abc', startedAt: '2026-11-17T18:00:00.000Z', samples, summary: summarize(samples, 190) };

function parse(xml: string) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
  return doc;
}

test('TCX bien formé avec un Trackpoint par échantillon', () => {
  const doc = parse(toTcx(session));
  expect(doc.getElementsByTagName('Activity')[0].getAttribute('Sport')).toBe('Biking');
  expect(doc.getElementsByTagName('Id')[0].textContent).toBe('2026-11-17T18:00:00.000Z');
  const tps = doc.getElementsByTagName('Trackpoint');
  expect(tps).toHaveLength(3);
  expect(tps[0].getElementsByTagName('Time')[0].textContent).toBe('2026-11-17T18:00:01.000Z');
});

test('distance finale = distance du résumé', () => {
  const doc = parse(toTcx(session));
  const lap = doc.getElementsByTagName('Lap')[0];
  const lapDist = [...lap.children].find((c) => c.tagName === 'DistanceMeters')!.textContent;
  expect(Number(lapDist)).toBeCloseTo(25.1, 2);
  const tps = doc.getElementsByTagName('Trackpoint');
  expect(Number(tps[2].getElementsByTagName('DistanceMeters')[0].textContent)).toBeCloseTo(25.1, 2);
  expect(Number(lap.getElementsByTagName('TotalTimeSeconds')[0].textContent)).toBe(3);
});

test('pas de FC quand elle manque, puissance et vitesse en extension', () => {
  const doc = parse(toTcx(session));
  const tps = doc.getElementsByTagName('Trackpoint');
  expect(tps[0].getElementsByTagName('HeartRateBpm')).toHaveLength(0);
  expect(tps[1].getElementsByTagName('HeartRateBpm')[0].textContent!.trim()).toBe('141');
  expect(tps[0].getElementsByTagName('ns3:Watts')[0].textContent).toBe('213');
  expect(Number(tps[0].getElementsByTagName('ns3:Speed')[0].textContent)).toBeCloseTo(30 / 3.6, 3);
});
