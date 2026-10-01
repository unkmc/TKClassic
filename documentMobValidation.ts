import fs from 'fs';
import path from 'path';
import { Configuration } from './Configuration';
import { DatHandler } from './FileHandlers/DatHandler';
import { frameToPng, readPalettes } from './FileHandlers/SpritePng';

interface Mob {
  id: number;
  frameIndex: number;
  paletteIndex: number;
}

const checks = [
  { id: 2, title: 'Small green creature with yellow horns', why: 'Its classic version has a full animation where the original Nexus entry had a single frame.', watch: 'Watch it turn, walk, attack, react to a hit, and die.' },
  { id: 14, title: 'Pale robed figure with an orange headdress', why: 'Its classic frame count and animation layout differ from the original.', watch: 'Watch movement and combat from more than one direction.' },
  { id: 500, title: 'Large green armored creature', why: 'Its frame count and animation layout differ slightly from the original.', watch: 'Check for a missing frame, a sudden jump, or an incorrect pose during movement and combat.' },
  { id: 734, title: 'Shaggy pink beast', why: 'This is the final monster replaced by the classic set.', watch: 'Confirm it animates normally; it checks the end of the classic frame range.' },
  { id: 735, title: 'White tiger', why: 'This is the first monster after the classic replacements.', watch: 'Confirm it still appears and animates normally after its frame data was shifted.' },
  { id: 2012, title: 'Red robed figure with a blue crescent blade', why: 'This is the last monster in the Nexus metadata.', watch: 'Confirm it still appears and animates normally; it checks the far end of the shifted frame range.' },
];

function metadata(dat: DatHandler, name: string): Buffer {
  const entry = [...dat.datFileMetaData.values()].find(item => item.fileName.toLowerCase() === name.toLowerCase());
  if (!entry) throw new Error(`${name} is missing from ${dat.filePath}`);
  return entry.buffer;
}

function dnaEntries(buffer: Buffer): Mob[] {
  const count = buffer.readUInt32LE(0);
  const result: Mob[] = [];
  let offset = 4;
  for (let id = 0; id < count; id++) {
    const frameIndex = buffer.readUInt32LE(offset);
    const chunks = buffer.readUInt8(offset + 4);
    const paletteIndex = buffer.readUInt16LE(offset + 6);
    offset += 8;
    for (let chunk = 0; chunk < chunks; chunk++) {
      const blocks = buffer.readUInt16LE(offset);
      offset += 2 + blocks * 9;
    }
    result.push({ id, frameIndex, paletteIndex });
  }
  if (offset !== buffer.length) throw new Error('Monster DNA length mismatch');
  return result;
}

function numberedFiles(directory: string): string[] {
  return fs.readdirSync(directory).filter(name => /^mon\d+\.dat$/i.test(name))
    .sort((a, b) => Number(/\d+/.exec(a)![0]) - Number(/\d+/.exec(b)![0]));
}

function firstFrameCount(file: string): number {
  const descriptor = fs.openSync(file, 'r');
  try {
    const bytes = Buffer.alloc(4);
    fs.readSync(descriptor, bytes, 0, 4, 4);
    const epfStart = bytes.readUInt32LE(0);
    fs.readSync(descriptor, bytes, 0, 2, epfStart);
    return bytes.readInt16LE(0);
  } finally {
    fs.closeSync(descriptor);
  }
}

function main(): void {
  const releaseMon = new DatHandler(path.join(Configuration.releaseDirectory, 'mon.dat'), false);
  const mobs = dnaEntries(metadata(releaseMon, 'monster.dna'));
  const palettes = readPalettes(metadata(releaseMon, 'monster.pal'));
  const archives = numberedFiles(Configuration.releaseDirectory);
  const spans: { file: string; first: number; count: number }[] = [];
  let total = 0;
  for (const file of archives) {
    const count = firstFrameCount(path.join(Configuration.releaseDirectory, file));
    spans.push({ file, first: total, count });
    total += count;
  }
  const output = path.join(__dirname, 'documentation', 'mob-validation.md');
  const images = path.join(__dirname, 'documentation', 'images', 'mob-validation');
  fs.mkdirSync(images, { recursive: true });
  const lines = [
    '# Mobs to check in the client', '',
    'These are frame **06** previews from the current `Release/` files, with the released palette. Use the picture to recognize each mob in game. The IDs are included only as references to the data files.', '',
    'For each one you can encounter, check that its colors look right and that turning, walking, attacking, being hit, and dying use the expected poses. The first four show changed classic animations; the last two check that later Nexus mobs still work.', '',
  ];
  const loaded = new Map<string, DatHandler>();
  for (const item of checks) {
    const mob = mobs[item.id];
    if (!mob || mob.id !== item.id) throw new Error(`No released monster ${item.id}`);
    const nextStart = mobs[item.id + 1]?.frameIndex ?? total;
    if (nextStart - mob.frameIndex <= 6) throw new Error(`Monster ${item.id} has no frame 06`);
    const globalFrame = mob.frameIndex + 6;
    const archive = spans.find(span => span.first <= globalFrame && globalFrame < span.first + span.count);
    if (!archive) throw new Error(`No archive contains monster ${item.id} frame 06`);
    let dat = loaded.get(archive.file);
    if (!dat) {
      dat = new DatHandler(path.join(Configuration.releaseDirectory, archive.file), false);
      loaded.set(archive.file, dat);
    }
    const frames = dat.datFileMetaData.get(dat.getOnlyFileName())?.fileHandler?.frames;
    const frame = frames?.[globalFrame - archive.first];
    const palette = palettes[mob.paletteIndex];
    if (!frame || !palette) throw new Error(`Cannot render monster ${item.id} frame 06`);
    const image = `${String(item.id).padStart(4, '0')}-frame-06.png`;
    fs.writeFileSync(path.join(images, image), frameToPng(frame, palette));
    lines.push(`## ${item.title}`, '',
      `![${item.title}, released frame 06](images/mob-validation/${image})`, '',
      `**Why check it:** ${item.why}`, '',
      `**What to watch:** ${item.watch}`, '',
      `<details><summary>Data reference</summary>Monster ID ${item.id}; released global frame ${globalFrame}; ${archive.file}.</details>`, '');
  }
  lines.push('If a creature never appears in your usual areas, skip it. You can choose another recognizable mob from the [visual comparison pages](tmp/mapping-validation/monsters/README.md) after running `npm run validate-mappings`. The main goal is to see changed classic animations and at least one preserved Nexus monster.', '');
  fs.writeFileSync(output, lines.join('\n'));
  console.log(`Wrote ${checks.length} released monster previews to ${output}`);
}

main();
