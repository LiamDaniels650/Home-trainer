/** Décode la caractéristique Heart Rate Measurement (0x2A37). */
export function parseHr(dv: DataView): number {
  const flags = dv.getUint8(0);
  return flags & 0x01 ? dv.getUint16(1, true) : dv.getUint8(1);
}
