import type { Session } from './types';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Génère un fichier TCX (Garmin Training Center) accepté par Strava. */
export function toTcx(s: Session): string {
  const start = new Date(s.startedAt).getTime();
  const iso = (t: number) => new Date(start + t * 1000).toISOString();
  const m = s.summary;
  const kcal = Math.round((m.avgPower * m.durationS) / 1000); // ≈ kJ mécaniques
  const points = s.samples.map((p) => [
    '<Trackpoint>',
    `<Time>${iso(p.t)}</Time>`,
    `<DistanceMeters>${p.distM.toFixed(2)}</DistanceMeters>`,
    p.hr != null ? `<HeartRateBpm><Value>${p.hr}</Value></HeartRateBpm>` : '',
    `<Extensions><ns3:TPX><ns3:Speed>${(p.speed / 3.6).toFixed(3)}</ns3:Speed><ns3:Watts>${p.power}</ns3:Watts></ns3:TPX></Extensions>`,
    '</Trackpoint>',
  ].join('')).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2" xmlns:ns3="http://www.garmin.com/xmlschemas/ActivityExtension/v2">
<Activities>
<Activity Sport="Biking">
<Id>${esc(new Date(start).toISOString())}</Id>
<Lap StartTime="${new Date(start).toISOString()}">
<TotalTimeSeconds>${m.durationS}</TotalTimeSeconds>
<DistanceMeters>${m.distanceM.toFixed(2)}</DistanceMeters>
<MaximumSpeed>${(m.maxSpeed / 3.6).toFixed(3)}</MaximumSpeed>
<Calories>${kcal}</Calories>
<Intensity>Active</Intensity>
<TriggerMethod>Manual</TriggerMethod>
<Track>
${points}
</Track>
</Lap>
<Creator xsi:type="Device_t" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><Name>Home Trainer (Elite Novo Force)</Name></Creator>
</Activity>
</Activities>
</TrainingCenterDatabase>
`;
}
