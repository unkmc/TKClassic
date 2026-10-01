import path from 'path';
import fs from 'fs';
import { Configuration } from './Configuration';
import { DatHandler } from './FileHandlers/DatHandler';
import { Frame } from './FileHandlers/Frame';
import { readPalettes } from './FileHandlers/SpritePng';

function dat(directory: string, name: string, isBaram: boolean): DatHandler {
  return new DatHandler(path.join(directory, name), isBaram);
}

function meta(handler: DatHandler, name: string) {
  const result = [...handler.datFileMetaData.values()].find(item => item.fileName.toLowerCase() === name.toLowerCase());
  if (!result) throw new Error(`${name} missing from ${handler.filePath}`);
  return result;
}

function frames(handler: DatHandler): Frame[] {
  const name = handler.getOnlyFileName();
  const result = handler.datFileMetaData.get(name)?.fileHandler?.frames;
  if (!result) throw new Error(`No EPF in ${handler.filePath}`);
  return result;
}

function sameFrame(a: Frame, b: Frame): boolean {
  return a.top === b.top && a.left === b.left && a.bottom === b.bottom && a.right === b.right
    && a.rawPixelData.equals(b.rawPixelData) && a.rawStencilData.equals(b.rawStencilData);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function numberedFiles(directory: string, prefix: string): string[] {
  const pattern = new RegExp(`^${prefix}(\\d+)\\.dat$`, 'i');
  return fs.readdirSync(directory).filter(name => pattern.test(name))
    .sort((a, b) => Number(pattern.exec(a)![1]) - Number(pattern.exec(b)![1]));
}

interface DnaEntry {
  frameIndex: number;
  paletteIndex: number;
  record: Buffer;
}

function parseDna(buffer: Buffer): DnaEntry[] {
  const count = buffer.readUInt32LE(0);
  let offset = 4;
  const result: DnaEntry[] = [];
  for (let id = 0; id < count; id++) {
    const start = offset;
    const frameIndex = buffer.readUInt32LE(offset);
    const chunks = buffer.readUInt8(offset + 4);
    const paletteIndex = buffer.readUInt16LE(offset + 6);
    offset += 8;
    for (let chunk = 0; chunk < chunks; chunk++) {
      const blocks = buffer.readUInt16LE(offset);
      offset += 2 + blocks * 9;
    }
    result.push({ frameIndex, paletteIndex, record: buffer.subarray(start, offset) });
  }
  assert(offset === buffer.length, 'Monster DNA length mismatch');
  return result;
}

function* nexusMonsterTail(files: string[], firstFrame: number): Generator<Frame> {
  let globalFrame = 0;
  for (const file of files) {
    const original = frames(dat(Configuration.ntk.dataDirectory, file, false));
    for (const frame of original) {
      if (globalFrame >= firstFrame) yield frame;
      globalFrame++;
    }
  }
}

function verifyMonsters(): void {
  const sourceMon = dat(Configuration.baram.dataDirectory, 'mon.dat', true);
  const targetMon = dat(Configuration.ntk.dataDirectory, 'mon.dat', false);
  const releasedMon = dat(Configuration.releaseDirectory, 'mon.dat', false);
  const sourceDna = parseDna(meta(sourceMon, 'ClassicMonster.dna').buffer);
  const targetDna = parseDna(meta(targetMon, 'monster.dna').buffer);
  const releasedDna = parseDna(meta(releasedMon, 'monster.dna').buffer);
  const sourcePalettes = readPalettes(meta(sourceMon, 'ClassicMonster.pal').buffer);
  const targetPalettes = readPalettes(meta(targetMon, 'monster.pal').buffer);
  assert(meta(releasedMon, 'monster.pal').buffer.equals(meta(targetMon, 'monster.pal').buffer),
    'Release monster.pal changed');
  assert(sourceDna.length === 735 && targetDna.length === releasedDna.length,
    'Monster DNA sprite count changed');
  const sourceFrames: Frame[][] = [];
  for (const file of numberedFiles(Configuration.baram.dataDirectory, 'cmon')) {
    const source = dat(Configuration.baram.dataDirectory, file, true);
    for (const [name, item] of source.datFileMetaData) {
      const match = /^cmon(\d+)\.epf$/i.exec(name);
      if (match && item.fileHandler) sourceFrames[Number(match[1])] = item.fileHandler.frames;
    }
  }
  let sourceTotal = 0;
  for (let id = 0; id < sourceDna.length; id++) {
    const source = sourceDna[id];
    const released = releasedDna[id];
    assert(sourceFrames[id]?.length && source.frameIndex === sourceTotal,
      `Classic monster ${id} frame span is invalid`);
    const expected = Buffer.from(source.record);
    expected.writeUInt32LE(sourceTotal, 0);
    assert(sourcePalettes[source.paletteIndex]?.equals(targetPalettes[released.paletteIndex]),
      `Classic monster ${id} palette differs`);
    expected.writeUInt16LE(released.paletteIndex, 6);
    assert(expected.equals(released.record), `Classic monster ${id} DNA differs`);
    sourceTotal += sourceFrames[id].length;
  }
  const firstUnchanged = targetDna[sourceDna.length].frameIndex;
  const delta = sourceTotal - firstUnchanged;
  for (let id = sourceDna.length; id < targetDna.length; id++) {
    const expected = Buffer.from(targetDna[id].record);
    expected.writeUInt32LE(targetDna[id].frameIndex + delta, 0);
    assert(expected.equals(releasedDna[id].record), `Later Nexus monster ${id} DNA differs`);
  }
  const classic = sourceFrames.flat();
  const files = numberedFiles(Configuration.ntk.dataDirectory, 'mon');
  const tail = nexusMonsterTail(files, firstUnchanged);
  let global = 0;
  let originalTotal = 0;
  for (let archive = 0; archive < files.length; archive++) {
    const file = files[archive];
    const released = frames(dat(Configuration.releaseDirectory, file, false));
    const originalCount = frames(dat(Configuration.ntk.dataDirectory, file, false)).length;
    originalTotal += originalCount;
    assert(released.length === originalCount + (archive === files.length - 1 ? delta : 0),
      `${file} frame count differs`);
    for (const frame of released) {
      const expected = global < classic.length ? classic[global] : tail.next().value;
      assert(expected && sameFrame(frame, expected), `Released monster frame ${global} differs`);
      global++;
    }
  }
  assert(global === sourceTotal + originalTotal - firstUnchanged && tail.next().done,
    'Monster frame stream length differs');
  console.log(`Monsters: verified ${sourceDna.length} classic sprites, ${global} frames, DNA, and palettes`);
}

function verifyTileFrames(sourcePrefix: string, targetPrefix: string): number {
  let checked = 0;
  for (let archive = 0; archive < 15; archive++) {
    const source = frames(dat(Configuration.baram.dataDirectory, `${sourcePrefix}${archive}.dat`, true));
    const targetName = `${targetPrefix}${archive}.dat`;
    const released = frames(dat(Configuration.releaseDirectory, targetName, false));
    const original = frames(dat(Configuration.ntk.dataDirectory, targetName, false));
    assert(released.length === original.length && source.length <= released.length,
      `${targetName} frame count changed`);
    for (let index = 0; index < released.length; index++) {
      assert(sameFrame(released[index], index < source.length ? source[index] : original[index]),
        `${targetName} frame ${index} differs from its selected source`);
    }
    checked += source.length;
  }
  return checked;
}

function verifyTable(source: Buffer, original: Buffer, released: Buffer,
  sourcePalettes: Buffer[], originalPalettes: Buffer[], releasedPalettes: Buffer[], name: string): number {
  const count = source.readUInt32LE(0);
  const total = original.readUInt32LE(0);
  assert(source.length === 4 + count * 2 && original.length === 4 + total * 2
    && released.length === original.length && count <= total, `${name} table lengths differ`);
  for (let index = 0; index < originalPalettes.length; index++) {
    assert(originalPalettes[index].equals(releasedPalettes[index]), `${name} original palette ${index} changed`);
  }
  for (let id = 0; id < count; id++) {
    const sourceIndex = source.readUInt16LE(4 + id * 2) & 0x7fff;
    const releasedIndex = released.readUInt16LE(4 + id * 2) & 0x7fff;
    assert(sourcePalettes[sourceIndex]?.equals(releasedPalettes[releasedIndex]),
      `${name} tile ${id} has incorrect colors`);
    assert((original.readUInt16LE(4 + id * 2) & 0x8000) === (released.readUInt16LE(4 + id * 2) & 0x8000),
      `${name} tile ${id} flag changed`);
  }
  assert(original.subarray(4 + count * 2).equals(released.subarray(4 + count * 2)),
    `${name} table tail changed`);
  return count;
}

interface ObjectRecord {
  header: Buffer;
  tiles: number[];
}

function objects(buffer: Buffer, isBaram: boolean): ObjectRecord[] {
  const count = buffer.readUInt32LE(isBaram ? 4 : 0);
  let offset = isBaram ? 10 : 6;
  const result: ObjectRecord[] = [];
  for (let id = 0; id < count; id++) {
    const header = buffer.subarray(offset, offset + 7);
    const height = header.readInt8(6);
    assert(height >= 0, `Object ${id} has invalid height`);
    offset += 7;
    const tiles: number[] = [];
    for (let row = 0; row < height; row++) {
      tiles.push(isBaram ? buffer.readUInt32LE(offset) : buffer.readUInt16LE(offset));
      offset += isBaram ? 4 : 2;
    }
    result.push({ header, tiles });
  }
  assert(offset === buffer.length, 'Object table length mismatch');
  return result;
}

function verifyTileMetadata(): void {
  const source = dat(Configuration.baram.dataDirectory, 'tile.dat', true);
  const original = dat(Configuration.ntk.dataDirectory, 'tile.dat', false);
  const released = dat(Configuration.releaseDirectory, 'tile.dat', false);
  for (const [sourcePrefix, targetPalette, targetTable] of [
    ['ClassicTile', 'tile.pal', 'tile.tbl'],
    ['ClassicTileC', 'TileC.pal', 'TILEC.TBL'],
  ]) {
    const sourcePalettes = readPalettes(meta(source, `${sourcePrefix}.pal`).buffer);
    const originalPalettes = readPalettes(meta(original, targetPalette).buffer);
    const releasedPalettes = readPalettes(meta(released, targetPalette).buffer);
    const count = verifyTable(meta(source, `${sourcePrefix}.tbl`).buffer,
      meta(original, targetTable).buffer, meta(released, targetTable).buffer,
      sourcePalettes, originalPalettes, releasedPalettes, sourcePrefix);
    console.log(`${sourcePrefix}: verified ${count} palette assignments`);
  }
  const classic = objects(meta(source, 'ClassicSObj.tbl').buffer, true);
  const nexus = objects(meta(original, 'SObj.tbl').buffer, false);
  const output = objects(meta(released, 'SObj.tbl').buffer, false);
  assert(nexus.length === output.length && classic.length <= output.length,
    'SObj count changed');
  for (let id = 0; id < output.length; id++) {
    const expected = id < classic.length ? classic[id] : nexus[id];
    assert(output[id].tiles.join(',') === expected.tiles.join(','), `SObj ${id} tile list differs`);
    assert(output[id].header.subarray(0, 6).equals(nexus[id].header.subarray(0, 6)),
      `SObj ${id} behavior metadata changed`);
  }
  console.log(`SObj: verified ${classic.length} classic tile lists; later Nexus definitions preserved`);
}

function verifyRiding(): void {
  const source = dat(Configuration.baram.dataDirectory, 'C_Riding0.dat', true);
  const original = dat(Configuration.ntk.dataDirectory, 'mon.dat', false);
  const released = dat(Configuration.releaseDirectory, 'mon.dat', false);
  const baramChar = dat(Configuration.baram.dataDirectory, 'char.dat', true);
  const sourceFrames = frames(source);
  const originalFrames = meta(original, 'RIDINGS.EPF').fileHandler!.frames;
  const releasedFrames = meta(released, 'RIDINGS.EPF').fileHandler!.frames;
  assert(sourceFrames.length === 12 && originalFrames.length === releasedFrames.length,
    'Riding frame count changed');
  for (let index = 0; index < releasedFrames.length; index++) {
    assert(sameFrame(releasedFrames[index], index < 12 ? sourceFrames[index] : originalFrames[index]),
      `Riding frame ${index} differs`);
  }
  const sourcePalette = readPalettes(meta(baramChar, 'C_Riding.pal').buffer)[167];
  const originalPalettes = readPalettes(meta(original, 'RIDINGS.PAL').buffer);
  const releasedPalettes = readPalettes(meta(released, 'RIDINGS.PAL').buffer);
  const originalDna = Buffer.from(meta(original, 'RIDINGS.DNA').buffer);
  const releasedDna = meta(released, 'RIDINGS.DNA').buffer;
  const index = releasedDna.readUInt16LE(10);
  assert(releasedPalettes.length === originalPalettes.length + 1
    && releasedPalettes[index].equals(sourcePalette), 'Riding palette is incorrect');
  for (let palette = 0; palette < originalPalettes.length; palette++) {
    assert(releasedPalettes[palette].equals(originalPalettes[palette]),
      `Original riding palette ${palette} changed`);
  }
  originalDna.writeUInt16LE(index, 10);
  assert(originalDna.equals(releasedDna), 'Riding DNA differs beyond palette index');
  console.log(`Riding: verified 12 swapped frames, ${releasedFrames.length - 12} preserved frames, palette ${index}`);
}

function main(): void {
  verifyMonsters();
  const ground = verifyTileFrames('ClassicTile', 'tile');
  const object = verifyTileFrames('ClassicTileC', 'tilec');
  verifyTileMetadata();
  verifyRiding();
  console.log(`Verified ${ground + object} released classic tile frames`);
}

main();
