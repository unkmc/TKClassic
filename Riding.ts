import path from 'path';
import fs from 'fs';
import { Configuration } from './Configuration';
import { DatHandler } from './FileHandlers/DatHandler';
import { DscHandler } from './FileHandlers/DscHandler';
import { EpfHandler } from './FileHandlers/EpfHandler';
import { mergePalettes } from './FileHandlers/PaletteArchive';

function metadata(dat: DatHandler, name: string) {
  const result = [...dat.datFileMetaData.values()].find(item => item.fileName.toLowerCase() === name.toLowerCase());
  if (!result) throw new Error(`${name} is missing from ${dat.filePath}`);
  return result;
}

export function handle(): void {
  const releaseMon = path.join(Configuration.releaseDirectory, 'mon.dat');
  const nexus = new DatHandler(fs.existsSync(releaseMon)
    ? releaseMon : path.join(Configuration.ntk.dataDirectory, 'mon.dat'), false);
  const baramChar = new DatHandler(path.join(Configuration.baram.dataDirectory, 'char.dat'), true);
  const source = new DatHandler(path.join(Configuration.baram.dataDirectory, 'C_Riding0.dat'), true);
  const part = new DscHandler(metadata(baramChar, 'C_Riding.dsc').buffer, true).parts[0];
  if (!part || part.id !== 0 || part.frameIndex !== 0 || part.frameCount !== 12) {
    throw new Error('Unexpected classic riding sprite layout');
  }
  const sourceFrames = (metadata(source, 'C_Riding0.epf').fileHandler as EpfHandler).frames;
  const targetFrames = (metadata(nexus, 'RIDINGS.EPF').fileHandler as EpfHandler).frames;
  const dna = Buffer.from(metadata(nexus, 'RIDINGS.DNA').buffer);
  if (sourceFrames.length !== 12 || targetFrames.length < 12 || dna.readUInt32LE(0) < 2
    || dna.readUInt32LE(4) !== 0) {
    throw new Error('Unexpected Nexus riding layout');
  }
  // RIDINGS.DNA ID 1 follows ID 0's variable-length animation blocks. Its
  // frame start is checked by parsing those blocks rather than assuming size.
  let next = 4 + 8;
  const chunks = dna.readUInt8(4 + 4);
  for (let chunk = 0; chunk < chunks; chunk++) {
    const blocks = dna.readUInt16LE(next);
    next += 2 + blocks * 9;
  }
  if (dna.readUInt32LE(next) !== 12) throw new Error('Nexus riding ID 0 is not 12 frames');

  for (let index = 0; index < 12; index++) targetFrames[index] = sourceFrames[index];
  const palettes = mergePalettes(metadata(baramChar, 'C_Riding.pal').buffer,
    metadata(nexus, 'RIDINGS.PAL').buffer, [part.paletteIndex]);
  const paletteIndex = palettes.indices[part.paletteIndex];
  if (paletteIndex === undefined) throw new Error(`No palette for classic riding ${part.paletteIndex}`);
  dna.writeUInt16LE(paletteIndex, 10);
  metadata(nexus, 'RIDINGS.DNA').buffer = dna;
  metadata(nexus, 'RIDINGS.PAL').buffer = palettes.buffer;
  nexus.writeToFile(path.join(Configuration.releaseDirectory, 'mon.dat'));
}
