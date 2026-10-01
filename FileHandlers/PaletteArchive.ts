import { readPalettes } from './SpritePng';

export function paletteRecords(buffer: Buffer): Buffer[] {
  const hasCount = buffer.toString('ascii', 0, 9) !== 'DLPalette';
  const count = hasCount ? buffer.readUInt32LE(0) : 1;
  if (count < 1 || count > 4096) throw new Error(`Invalid palette count: ${count}`);
  const records: Buffer[] = [];
  let offset = hasCount ? 4 : 0;
  for (let index = 0; index < count; index++) {
    if (buffer.toString('ascii', offset, offset + 9) !== 'DLPalette') {
      throw new Error(`Invalid palette record ${index}`);
    }
    const length = 32 + buffer.readUInt8(offset + 24) * 2 + 256 * 4;
    if (offset + length > buffer.length) throw new Error(`Truncated palette record ${index}`);
    records.push(buffer.subarray(offset, offset + length));
    offset += length;
  }
  if (offset !== buffer.length) throw new Error(`Palette archive has ${buffer.length - offset} trailing bytes`);
  return records;
}

export function mergePalettes(source: Buffer, target: Buffer, selected?: number[]): { buffer: Buffer; indices: number[] } {
  const sourceColors = readPalettes(source);
  const targetColors = readPalettes(target);
  const sourceRecords = paletteRecords(source);
  const targetRecords = paletteRecords(target);
  if (sourceColors.length !== sourceRecords.length || targetColors.length !== targetRecords.length) {
    throw new Error('Palette color and record counts differ');
  }
  const indices: number[] = [];
  for (const index of selected ?? sourceColors.map((_, id) => id)) {
    if (!sourceColors[index]) throw new Error(`Missing source palette ${index}`);
    const matches = targetColors.flatMap((palette, candidate) =>
      palette.equals(sourceColors[index]) ? [candidate] : []);
    const chosen = matches.includes(index)
      ? index
      : matches.length
        ? matches.reduce((best, candidate) => Math.abs(candidate - index) < Math.abs(best - index) ? candidate : best)
        : targetRecords.length;
    if (!matches.length) {
      targetColors.push(sourceColors[index]);
      targetRecords.push(sourceRecords[index]);
    }
    indices[index] = chosen;
  }
  const count = Buffer.alloc(4);
  count.writeUInt32LE(targetRecords.length, 0);
  return { buffer: Buffer.concat([count, ...targetRecords]), indices };
}
