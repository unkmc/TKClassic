import fs from 'fs';
import path from 'path';
import { Configuration } from './Configuration';
import { DatFileMetaData, DatHandler } from './FileHandlers/DatHandler';
import { EpfHandler } from './FileHandlers/EpfHandler';
import { mergePalettes } from './FileHandlers/PaletteArchive';

interface ObjectRecord {
  header: Buffer;
  tiles: number[];
}

function metadata(dat: DatHandler, name: string): DatFileMetaData {
  const result = [...dat.datFileMetaData.values()].find(item => item.fileName.toLowerCase() === name.toLowerCase());
  if (!result) throw new Error(`${name} is missing from ${dat.filePath}`);
  return result;
}

function numberedFiles(directory: string, prefix: string): string[] {
  const pattern = new RegExp(`^${prefix}(\\d+)\\.dat$`, 'i');
  return fs.readdirSync(directory).filter(name => pattern.test(name))
    .sort((a, b) => Number(pattern.exec(a)![1]) - Number(pattern.exec(b)![1]));
}

function remapTable(source: Buffer, target: Buffer, paletteIds: number[]): { buffer: Buffer; count: number } {
  const sourceCount = source.readUInt32LE(0);
  const targetCount = target.readUInt32LE(0);
  if (source.length !== 4 + sourceCount * 2 || target.length !== 4 + targetCount * 2
    || sourceCount > targetCount) throw new Error('Unexpected classic tile table layout');
  const output = Buffer.from(target);
  for (let id = 0; id < sourceCount; id++) {
    const sourcePalette = source.readUInt16LE(4 + id * 2) & 0x7fff;
    const mapped = paletteIds[sourcePalette];
    if (mapped === undefined || mapped >= 0x8000) throw new Error(`Tile ${id} has no compatible palette`);
    const targetFlag = target.readUInt16LE(4 + id * 2) & 0x8000;
    output.writeUInt16LE(targetFlag | mapped, 4 + id * 2);
  }
  return { buffer: output, count: sourceCount };
}

function parseObjects(buffer: Buffer, isBaram: boolean): ObjectRecord[] {
  const count = buffer.readUInt32LE(isBaram ? 4 : 0);
  let offset = isBaram ? 10 : 6;
  const result: ObjectRecord[] = [];
  for (let id = 0; id < count; id++) {
    const header = Buffer.from(buffer.subarray(offset, offset + 7));
    const height = header.readInt8(6);
    if (height < 0) throw new Error(`Object ${id} has negative height`);
    offset += 7;
    const tiles: number[] = [];
    for (let row = 0; row < height; row++) {
      tiles.push(isBaram ? buffer.readUInt32LE(offset) : buffer.readUInt16LE(offset));
      offset += isBaram ? 4 : 2;
    }
    result.push({ header, tiles });
  }
  if (offset !== buffer.length) throw new Error('Object table length mismatch');
  return result;
}

function encodeObjects(original: Buffer, records: ObjectRecord[]): Buffer {
  const chunks: Buffer[] = [original.subarray(0, 6)];
  for (const record of records) {
    if (record.tiles.length > 127) throw new Error('Object is too tall for Nexus format');
    const header = Buffer.from(record.header);
    header.writeInt8(record.tiles.length, 6);
    const tiles = Buffer.alloc(record.tiles.length * 2);
    for (let index = 0; index < record.tiles.length; index++) {
      if (record.tiles[index] > 0xffff) throw new Error(`Object tile ${record.tiles[index]} exceeds Nexus index width`);
      tiles.writeUInt16LE(record.tiles[index], index * 2);
    }
    chunks.push(header, tiles);
  }
  return Buffer.concat(chunks);
}

function mergedObjects(source: Buffer, target: Buffer): { buffer: Buffer; changed: number } {
  const classic = parseObjects(source, true);
  const nexus = parseObjects(target, false);
  if (classic.length > nexus.length || !encodeObjects(target, nexus).equals(target)) {
    throw new Error('Unexpected Nexus object table layout');
  }
  let changed = 0;
  for (let id = 0; id < classic.length; id++) {
    if (classic[id].tiles.join(',') !== nexus[id].tiles.join(',')) {
      nexus[id].tiles = classic[id].tiles;
      changed++;
    }
  }
  return { buffer: encodeObjects(target, nexus), changed };
}

function spliceFamily(sourcePrefix: string, targetPrefix: string): number {
  const sourceFiles = numberedFiles(Configuration.baram.dataDirectory, sourcePrefix);
  let replaced = 0;
  for (const sourceFile of sourceFiles) {
    const number = Number(/(\d+)\.dat$/i.exec(sourceFile)![1]);
    const targetFile = `${targetPrefix}${number}.dat`;
    const source = new DatHandler(path.join(Configuration.baram.dataDirectory, sourceFile), true);
    const target = new DatHandler(path.join(Configuration.ntk.dataDirectory, targetFile), false);
    const sourceFrames = (metadata(source, `${sourcePrefix}${number}.epf`).fileHandler as EpfHandler).frames;
    const targetFrames = (metadata(target, `${targetPrefix}${number}.epf`).fileHandler as EpfHandler).frames;
    if (!sourceFrames.length || sourceFrames.length > targetFrames.length) {
      throw new Error(`Invalid frame count in ${sourceFile} or ${targetFile}`);
    }
    for (let index = 0; index < sourceFrames.length; index++) targetFrames[index] = sourceFrames[index];
    target.writeToFile(path.join(Configuration.releaseDirectory, targetFile));
    replaced += sourceFrames.length;
  }
  return replaced;
}

export function handle(): void {
  const source = new DatHandler(path.join(Configuration.baram.dataDirectory, 'tile.dat'), true);
  const target = new DatHandler(path.join(Configuration.ntk.dataDirectory, 'tile.dat'), false);
  const groundPalette = mergePalettes(metadata(source, 'ClassicTile.pal').buffer, metadata(target, 'tile.pal').buffer);
  const objectPalette = mergePalettes(metadata(source, 'ClassicTileC.pal').buffer, metadata(target, 'TileC.pal').buffer);
  const groundTable = remapTable(metadata(source, 'ClassicTile.tbl').buffer, metadata(target, 'tile.tbl').buffer, groundPalette.indices);
  const objectTable = remapTable(metadata(source, 'ClassicTileC.tbl').buffer, metadata(target, 'TILEC.TBL').buffer, objectPalette.indices);
  const objects = mergedObjects(metadata(source, 'ClassicSObj.tbl').buffer, metadata(target, 'SObj.tbl').buffer);
  const groundFrames = spliceFamily('ClassicTile', 'tile');
  const objectFrames = spliceFamily('ClassicTileC', 'tilec');
  if (groundFrames !== groundTable.count || objectFrames !== objectTable.count) {
    throw new Error('Classic tile frames and palette table counts differ');
  }
  metadata(target, 'tile.pal').buffer = groundPalette.buffer;
  metadata(target, 'TileC.pal').buffer = objectPalette.buffer;
  metadata(target, 'tile.tbl').buffer = groundTable.buffer;
  metadata(target, 'TILEC.TBL').buffer = objectTable.buffer;
  metadata(target, 'SObj.tbl').buffer = objects.buffer;
  target.writeToFile(path.join(Configuration.releaseDirectory, 'tile.dat'));
  console.log(`Replaced ${groundFrames} ground tiles, ${objectFrames} object tiles, and ${objects.changed} object definitions`);
}
