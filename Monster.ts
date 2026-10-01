import fs from 'fs';
import path from 'path';
import { Configuration } from './Configuration';
import { DatFileMetaData, DatHandler } from './FileHandlers/DatHandler';
import { EpfHandler } from './FileHandlers/EpfHandler';
import { Frame } from './FileHandlers/Frame';
import { mergePalettes } from './FileHandlers/PaletteArchive';

interface DnaEntry {
  frameIndex: number;
  paletteIndex: number;
  record: Buffer;
}

function metadata(dat: DatHandler, name: string): DatFileMetaData {
  const result = [...dat.datFileMetaData.values()].find(item => item.fileName.toLowerCase() === name.toLowerCase());
  if (!result) throw new Error(`${name} is missing from ${dat.filePath}`);
  return result;
}

function numberedFiles(directory: string, prefix: string): string[] {
  const expression = new RegExp(`^${prefix}(\\d+)\\.dat$`, 'i');
  return fs.readdirSync(directory).filter(name => expression.test(name))
    .sort((a, b) => Number(expression.exec(a)![1]) - Number(expression.exec(b)![1]));
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
  if (offset !== buffer.length) throw new Error('Monster DNA length mismatch');
  return result;
}

function sourceFrames(): Frame[][] {
  const byId: Frame[][] = [];
  for (const file of numberedFiles(Configuration.baram.dataDirectory, 'cmon')) {
    const dat = new DatHandler(path.join(Configuration.baram.dataDirectory, file), true);
    for (const [name, meta] of dat.datFileMetaData) {
      const match = /^cmon(\d+)\.epf$/i.exec(name);
      if (!match || !meta.fileHandler) continue;
      const id = Number(match[1]);
      if (byId[id]) throw new Error(`Duplicate classic monster ${id}`);
      byId[id] = meta.fileHandler.frames;
    }
  }
  return byId;
}

function* nexusTail(files: string[], firstFrame: number): Generator<Frame> {
  let globalFrame = 0;
  for (const file of files) {
    const dat = new DatHandler(path.join(Configuration.ntk.dataDirectory, file), false);
    const epf = dat.datFileMetaData.get(dat.getOnlyFileName())?.fileHandler;
    if (!epf) throw new Error(`No EPF in ${file}`);
    for (const frame of epf.frames) {
      if (globalFrame >= firstFrame) yield frame;
      globalFrame++;
    }
  }
}

export function handle(): void {
  const sourceMon = new DatHandler(path.join(Configuration.baram.dataDirectory, 'mon.dat'), true);
  const targetMon = new DatHandler(path.join(Configuration.ntk.dataDirectory, 'mon.dat'), false);
  const classicDna = parseDna(metadata(sourceMon, 'ClassicMonster.dna').buffer);
  const nexusDna = parseDna(metadata(targetMon, 'monster.dna').buffer);
  const classicFrames = sourceFrames();
  if (classicFrames.length !== classicDna.length || nexusDna.length <= classicDna.length) {
    throw new Error('Classic and Nexus monster counts are inconsistent');
  }
  const palette = mergePalettes(metadata(sourceMon, 'ClassicMonster.pal').buffer,
    metadata(targetMon, 'monster.pal').buffer);
  if (!palette.buffer.equals(metadata(targetMon, 'monster.pal').buffer)) {
    throw new Error('Classic monsters require new Nexus palette records');
  }
  let classicCount = 0;
  const updatedDna: Buffer[] = [];
  for (let id = 0; id < classicDna.length; id++) {
    const entry = classicDna[id];
    const frames = classicFrames[id];
    if (!frames?.length || entry.frameIndex !== classicCount) {
      throw new Error(`Classic monster ${id} EPF and DNA do not align`);
    }
    const record = Buffer.from(entry.record);
    record.writeUInt32LE(classicCount, 0);
    const mappedPalette = palette.indices[entry.paletteIndex];
    if (mappedPalette === undefined) throw new Error(`No Nexus palette for classic monster ${id}`);
    record.writeUInt16LE(mappedPalette, 6);
    updatedDna.push(record);
    classicCount += frames.length;
  }
  const firstUnchanged = nexusDna[classicDna.length].frameIndex;
  const frameDelta = classicCount - firstUnchanged;
  for (let id = classicDna.length; id < nexusDna.length; id++) {
    const record = Buffer.from(nexusDna[id].record);
    record.writeUInt32LE(nexusDna[id].frameIndex + frameDelta, 0);
    updatedDna.push(record);
  }
  const count = Buffer.alloc(4);
  count.writeUInt32LE(nexusDna.length, 0);
  metadata(targetMon, 'monster.dna').buffer = Buffer.concat([count, ...updatedDna]);
  targetMon.writeToFile(path.join(Configuration.releaseDirectory, 'mon.dat'));

  const files = numberedFiles(Configuration.ntk.dataDirectory, 'mon');
  const tail = nexusTail(files, firstUnchanged);
  const classic = classicFrames.flat();
  let classicIndex = 0;
  let written = 0;
  for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
    const file = files[fileIndex];
    const dat = new DatHandler(path.join(Configuration.ntk.dataDirectory, file), false);
    const epf = dat.datFileMetaData.get(dat.getOnlyFileName())?.fileHandler as EpfHandler;
    if (!epf) throw new Error(`No EPF in ${file}`);
    const count = epf.frameCount + (fileIndex === files.length - 1 ? frameDelta : 0);
    if (count < 1 || count > 2600) throw new Error(`${file} would have ${count} frames`);
    const frames: Frame[] = [];
    while (frames.length < count) {
      if (classicIndex < classic.length) {
        frames.push(classic[classicIndex++]);
      } else {
        const next = tail.next();
        if (next.done) throw new Error(`Not enough Nexus monster frames for ${file}`);
        frames.push(next.value);
      }
    }
    epf.frames = frames;
    epf.frameCount = count;
    dat.writeToFile(path.join(Configuration.releaseDirectory, file));
    written += count;
  }
  if (classicIndex !== classic.length || !tail.next().done) {
    throw new Error('Monster frame stream did not end at the expected index');
  }
  console.log(`Replaced ${classicDna.length} monsters; shifted later frame starts by ${frameDelta}; wrote ${written} monster frames`);
}
