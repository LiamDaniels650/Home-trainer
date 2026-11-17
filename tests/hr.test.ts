import { expect, test } from 'vitest';
import { parseHr } from '../src/core/hr';
const dv = (bytes: number[]) => new DataView(new Uint8Array(bytes).buffer);
test('FC sur 8 bits', () => { expect(parseHr(dv([0x00, 150]))).toBe(150); });
test('FC sur 16 bits', () => { expect(parseHr(dv([0x01, 0x2c, 0x01]))).toBe(300); });
