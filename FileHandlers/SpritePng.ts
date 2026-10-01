import { deflateSync } from 'zlib';
import { Frame } from './Frame';

// PAL layout follows TKViewer's PalFileHandler: an optional count, then palettes
// with a 32-byte header, animation offsets, and 256 four-byte color entries.
export function readPalettes(buffer: Buffer): Buffer[] {
  const hasCount = buffer.toString('ascii', 0, 9) !== 'DLPalette';
  const count = hasCount ? buffer.readUInt32LE(0) : 1;
  if (count < 1 || count > 4096) throw new Error(`Invalid palette count: ${count}`);

  const palettes: Buffer[] = [];
  let offset = hasCount ? 4 : 0;
  for (let index = 0; index < count; index++) {
    if (offset + 32 > buffer.length || buffer.toString('ascii', offset, offset + 9) !== 'DLPalette') {
      throw new Error(`Invalid PAL header at palette ${index}`);
    }
    const animationColorCount = buffer.readUInt8(offset + 24);
    const colorsOffset = offset + 32 + animationColorCount * 2;
    const colorsEnd = colorsOffset + 256 * 4;
    if (colorsEnd > buffer.length) throw new Error(`Truncated PAL at palette ${index}`);
    palettes.push(buffer.subarray(colorsOffset, colorsEnd));
    offset = colorsEnd;
  }
  return palettes;
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const content = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(content));
  return Buffer.concat([length, content, checksum]);
}

export function frameToPng(frame: Frame, palette: Buffer): Buffer {
  if (palette.length !== 256 * 4) throw new Error('Expected a 256-color palette');
  // TKViewer renders empty frames as transparent 48x48 tiles.
  const width = frame.width || 48;
  const height = frame.height || 48;
  const rowSize = width * 4 + 1;
  const rows = Buffer.alloc(rowSize * height);

  if (frame.width && frame.height) {
    if (frame.rawPixelData.length !== width * height || frame.stencil.rows.length !== height) {
      throw new Error('Frame pixels or stencil do not match frame dimensions');
    }
    for (let y = 0; y < height; y++) {
      // Some EPFs encode runs past the visible width; the frame bounds still
      // define the pixels that can be drawn.
      if (frame.stencil.rows[y].length < width) throw new Error('Invalid stencil row width');
      for (let x = 0; x < width; x++) {
        if (!frame.stencil.rows[y][x]) continue;
        const colorOffset = frame.rawPixelData[y * width + x] * 4;
        const pixelOffset = y * rowSize + 1 + x * 4;
        rows[pixelOffset] = palette[colorOffset];
        rows[pixelOffset + 1] = palette[colorOffset + 1];
        rows[pixelOffset + 2] = palette[colorOffset + 2];
        rows[pixelOffset + 3] = 255;
      }
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bits per channel
  header[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
