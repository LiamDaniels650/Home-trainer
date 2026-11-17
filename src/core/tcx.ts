import type { Sample, Session } from './types';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Découpe en tours : un par étape de séance guidée (échantillons consécutifs de même étape), sinon un seul. */
function splitLaps(samples: Sample[]): Sample[][] {
  const laps: Sample[][] = [];
  for (const s of samples) {
    const cur = laps[laps.length - 1];
    if (cur && cur[0].step === s.step) cur.push(s);
    else laps.push([s]);
  }
  return laps.length ? laps : [[]];
}

/** Génère un fichier TCX (Garmin Training Center) accepté par Strava. */
export function toTcx(s: Session): string {
  const start = new Date(s.startedAt).getTime();
  const iso = (t: number) => new Date(start + t * 1000).toISOString();
  const point = (p: Sample) => [
    '<Trackpoint>',
    `<Time>${iso(p.t)}</Time>`,
    `<DistanceMeters>${p.distM.toFixed(2)}</DistanceMeters>`,
    p.hr != null ? `<HeartRateBpm><Value>${p.hr}</Value></HeartRateBpm>` : '',
    `<Extensions><ns3:TPX><ns3:Speed>${(p.speed / 3.6).toFixed(3)}</ns3:Speed><ns3:Watts>${p.power}</ns3:Watts></ns3:TPX></Extensions>`,
    '</Trackpoint>',
  ].join('');

  let prevDist = 0;
  const laps = splitLaps(s.samples).map((pts, i) => {
    const endDist = pts.length ? pts[pts.length - 1].distM : 0;
    const dist = endDist - prevDist;
    prevDist = endDist;
    const avgPower = pts.length ? pts.reduce((a, p) => a + p.power, 0) / pts.length : 0;
    const maxSpeed = pts.length ? Math.max(...pts.map((p) => p.speed)) : 0;
    const startTime = i === 0 || !pts.length ? new Date(start).toISOString() : iso(pts[0].t);
    return `<Lap StartTime="${startTime}">
<TotalTimeSeconds>${pts.length}</TotalTimeSeconds>
<DistanceMeters>${dist.toFixed(2)}</DistanceMeters>
<MaximumSpeed>${(maxSpeed / 3.6).toFixed(3)}</MaximumSpeed>
<Calories>${Math.round((avgPower * pts.length) / 1000)}</Calories>
<Intensity>Active</Intensity>
<TriggerMethod>Manual</TriggerMethod>
<Track>
${pts.map(point).join('\n')}
</Track>
</Lap>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2" xmlns:ns3="http://www.garmin.com/xmlschemas/ActivityExtension/v2">
<Activities>
<Activity Sport="Biking">
<Id>${esc(new Date(start).toISOString())}</Id>
${laps.join('\n')}
<Creator xsi:type="Device_t" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><Name>Home Trainer (Elite Novo Force)</Name></Creator>
</Activity>
</Activities>
</TrainingCenterDatabase>
`;
}
