import fs from 'fs';
import path from 'path';
import { Configuration } from './Configuration';
import { DatHandler } from './FileHandlers/DatHandler';
import { EpfHandler } from './FileHandlers/EpfHandler';
import { frameToPng, readPalettes } from './FileHandlers/SpritePng';

const tmp = path.join(__dirname, 'documentation', 'tmp');
const candidates = path.join(tmp, 'candidates');
const mappings = path.join(__dirname, 'documentation', 'mappings');
const output = path.join(tmp, 'mapping-validation');

function entry(dat: DatHandler, name: string): Buffer {
  const meta = [...dat.datFileMetaData.values()].find(item => item.fileName.toLowerCase() === name.toLowerCase());
  if (!meta) throw new Error(`${name} is missing from ${dat.filePath}`);
  return meta.buffer;
}

function numberedFiles(directory: string, prefix: string): string[] {
  const pattern = new RegExp(`^${prefix}(\\d+)\\.dat$`, 'i');
  return fs.readdirSync(directory).filter(name => pattern.test(name))
    .sort((a, b) => Number(pattern.exec(a)![1]) - Number(pattern.exec(b)![1]));
}

function readCsv(file: string): Record<string, string>[] {
  const [header, ...rows] = fs.readFileSync(file, 'utf8').trimEnd().split('\n');
  const keys = header.split(',');
  return rows.map(row => Object.fromEntries(row.split(',').map((value, index) => [keys[index], value])));
}

function monsterPaletteIndices(dna: Buffer): number[] {
  const count = dna.readUInt32LE(0);
  const indices: number[] = [];
  let offset = 4;
  for (let id = 0; id < count; id++) {
    const chunks = dna.readUInt8(offset + 4);
    indices.push(dna.readUInt16LE(offset + 6));
    offset += 8;
    for (let chunk = 0; chunk < chunks; chunk++) {
      const blocks = dna.readUInt16LE(offset);
      offset += 2 + blocks * 9;
    }
  }
  if (offset !== dna.length) throw new Error('Nexus monster DNA length mismatch');
  return indices;
}

function writeMonsters(stage: string): string {
  const rows = readCsv(path.join(mappings, 'monsters.csv'));
  const nexusMon = new DatHandler(path.join(Configuration.ntk.dataDirectory, 'mon.dat'), false);
  const palettes = readPalettes(entry(nexusMon, 'monster.pal'));
  const paletteIndices = monsterPaletteIndices(entry(nexusMon, 'monster.dna'));
  const dir = path.join(stage, 'monsters');
  fs.mkdirSync(dir);
  const requests = rows.map(row => {
    const id = Number(row.monster_id);
    const frameOffset = Math.min(6, Number(row.nexus_frame_count) - 1);
    const sourceOffset = Math.min(6, Number(row.baram_frame_count) - 1);
    const sourceImage = path.join(candidates, 'monsters', `${String(id).padStart(3, '0')}.png`);
    if (!fs.existsSync(sourceImage)) throw new Error(`Missing ${sourceImage}; run npm run export-candidates`);
    return { id, sourceOffset, targetOffset: frameOffset,
      globalFrame: Number(row.nexus_frame_start) + frameOffset, image: `${String(id).padStart(3, '0')}-nexus.png` };
  });
  const pending = new Map(requests.map(request => [request.globalFrame, request]));
  let globalStart = 0;
  for (const file of numberedFiles(Configuration.ntk.dataDirectory, 'mon')) {
    const dat = new DatHandler(path.join(Configuration.ntk.dataDirectory, file), false);
    const epf = dat.datFileMetaData.get(dat.getOnlyFileName())?.fileHandler;
    if (!epf) throw new Error(`No EPF in ${file}`);
    for (const [global, request] of pending) {
      if (global < globalStart || global >= globalStart + epf.frames.length) continue;
      const palette = palettes[paletteIndices[request.id]];
      if (!palette) throw new Error(`Missing Nexus monster palette for ${request.id}`);
      fs.writeFileSync(path.join(dir, request.image), frameToPng(epf.frames[global - globalStart], palette));
      pending.delete(global);
    }
    globalStart += epf.frames.length;
  }
  if (pending.size) throw new Error(`${pending.size} Nexus monster frames were not found`);
  const links: string[] = [];
  for (let start = 0; start < requests.length; start += 40) {
    const batch = requests.slice(start, start + 40);
    const file = `${String(batch[0].id).padStart(3, '0')}-${String(batch[batch.length - 1].id).padStart(3, '0')}.md`;
    const lines = [`# Monster IDs ${batch[0].id}–${batch[batch.length - 1].id}`, '', '[Monster comparison index](README.md)', '',
      'Both sides use their own palette. Frame 6 is shown where available; shorter sprites use their last frame.', '',
      '| ID | Baram frame | Classic source | Nexus frame | Nexus target |',
      '| ---: | ---: | --- | ---: | --- |',
      ...batch.map(item => `| ${item.id} | ${item.sourceOffset} | ![Classic monster ${item.id}](../../candidates/monsters/${String(item.id).padStart(3, '0')}.png) | ${item.targetOffset} | ![Nexus monster ${item.id}](${item.image}) |`), ''];
    fs.writeFileSync(path.join(dir, file), lines.join('\n'));
    links.push(`- [IDs ${batch[0].id}–${batch[batch.length - 1].id}](${file})`);
  }
  fs.writeFileSync(path.join(dir, 'README.md'), ['# Monster ID comparisons', '',
    `${requests.length} proposed same-ID pairs, split into pages of 40. The source and target frames use their respective palettes.`, '',
    ...links, ''].join('\n'));
  return `- [Monsters: ${requests.length} ID pairs](monsters/README.md)`;
}

function tileTable(buffer: Buffer): number[] {
  const count = buffer.readUInt32LE(0);
  if (buffer.length !== 4 + 2 * count) throw new Error('Unexpected tile table length');
  return Array.from({ length: count }, (_, index) => buffer.readUInt16LE(4 + 2 * index) & 0x7fff);
}

function writeTileSamples(stage: string, kind: 'tiles' | 'tiles-c', nexusTile: DatHandler): string {
  const sourcePrefix = kind === 'tiles' ? 'ClassicTile' : 'ClassicTileC';
  const targetPrefix = kind === 'tiles' ? 'tile' : 'tilec';
  const paletteName = kind === 'tiles' ? 'tile.pal' : 'TileC.pal';
  const tableName = kind === 'tiles' ? 'tile.tbl' : 'TILEC.TBL';
  const palettes = readPalettes(entry(nexusTile, paletteName));
  const paletteIds = tileTable(entry(nexusTile, tableName));
  const dir = path.join(stage, kind);
  fs.mkdirSync(dir);
  const files = numberedFiles(Configuration.baram.dataDirectory, sourcePrefix);
  const links: string[] = [];
  let globalStart = 0;
  for (const sourceFile of files) {
    const number = Number(/(\d+)\.dat$/i.exec(sourceFile)![1]);
    const sourceDat = new DatHandler(path.join(Configuration.baram.dataDirectory, sourceFile), true);
    const sourceEpf = sourceDat.datFileMetaData.get(sourceDat.getOnlyFileName())?.fileHandler;
    const targetFile = `${targetPrefix}${number}.dat`;
    const targetDat = new DatHandler(path.join(Configuration.ntk.dataDirectory, targetFile), false);
    const targetEpf = targetDat.datFileMetaData.get(targetDat.getOnlyFileName())?.fileHandler;
    if (!sourceEpf || !targetEpf || sourceEpf.frames.length > targetEpf.frames.length) {
      throw new Error(`Cannot compare ${sourceFile} with ${targetFile}`);
    }
    const count = Math.min(32, sourceEpf.frames.length);
    const indices = Array.from({ length: count }, (_, index) =>
      Math.round(index * (sourceEpf.frames.length - 1) / Math.max(1, count - 1)));
    const stem = path.parse(sourceFile).name;
    const lines = [`# ${sourceFile} → ${targetFile}`, '', `[${sourcePrefix} comparison index](README.md)`, '',
      `32 evenly spaced same-ID pairs; global IDs ${globalStart}–${globalStart + sourceEpf.frames.length - 1}. Each side uses its own palette-table assignment.`, '',
      '| Global tile ID | Classic source | Nexus target |', '| ---: | --- | --- |'];
    for (const index of indices) {
      const id = globalStart + index;
      const sourceImage = `${stem}-${String(index).padStart(4, '0')}.png`;
      const sourcePath = path.join(candidates, kind, sourceImage);
      if (!fs.existsSync(sourcePath)) throw new Error(`Missing ${sourcePath}; run npm run export-candidates`);
      const targetImage = `${stem}-${String(index).padStart(4, '0')}-nexus.png`;
      const palette = palettes[paletteIds[id]];
      if (!palette) throw new Error(`No Nexus palette for ${kind} ${id}`);
      fs.writeFileSync(path.join(dir, targetImage), frameToPng(targetEpf.frames[index], palette));
      lines.push(`| ${id} | ![Classic tile ${id}](../../candidates/${kind}/${sourceImage}) | ![Nexus tile ${id}](${targetImage}) |`);
    }
    lines.push('');
    fs.writeFileSync(path.join(dir, `${stem}.md`), lines.join('\n'));
    links.push(`- [${sourceFile} → ${targetFile}](${stem}.md)`);
    globalStart += sourceEpf.frames.length;
  }
  fs.writeFileSync(path.join(dir, 'README.md'), [`# ${sourcePrefix} same-ID samples`, '',
    `32 evenly spaced pairs per source archive, ${files.length} archives. Compare the shapes and palette colors at each global ID.`, '',
    ...links, ''].join('\n'));
  return `- [${sourcePrefix}: ${files.length} sampled archive pages](${kind}/README.md)`;
}

function writeTileExceptions(stage: string, nexusTile: DatHandler): string {
  const dir = path.join(stage, 'tile-exceptions');
  fs.mkdirSync(dir);
  const summaries: string[] = [];
  for (const family of ['ground', 'object'] as const) {
    const rows = readCsv(path.join(mappings, `${family}-pixel-matches.csv`));
    const sourcePrefix = family === 'ground' ? 'ClassicTile' : 'ClassicTileC';
    const targetPrefix = family === 'ground' ? 'tile' : 'tilec';
    const paletteName = family === 'ground' ? 'tile.pal' : 'TileC.pal';
    const tableName = family === 'ground' ? 'tile.tbl' : 'TILEC.TBL';
    const baramTile = new DatHandler(path.join(Configuration.baram.dataDirectory, 'tile.dat'), true);
    const sourcePalettes = readPalettes(entry(baramTile, `${sourcePrefix}.pal`));
    const sourcePaletteIds = tileTable(entry(baramTile, `${sourcePrefix}.tbl`));
    const targetPalettes = readPalettes(entry(nexusTile, paletteName));
    const targetPaletteIds = tileTable(entry(nexusTile, tableName));
    const cache = new Map<string, EpfHandler>();
    function frame(side: 'baram' | 'nexus', prefix: string, id: number): EpfHandler['frames'][number] {
      const fileName = `${prefix}${Math.floor(id / 2000)}.dat`;
      const key = `${side}/${fileName}`;
      let epf = cache.get(key);
      if (!epf) {
        const dat = new DatHandler(path.join(side === 'baram' ? Configuration.baram.dataDirectory : Configuration.ntk.dataDirectory, fileName), side === 'baram');
        epf = dat.datFileMetaData.get(dat.getOnlyFileName())?.fileHandler;
        if (!epf) throw new Error(`No EPF in ${fileName}`);
        cache.set(key, epf);
      }
      const result = epf.frames[id % 2000];
      if (!result) throw new Error(`No frame ${id} in ${fileName}`);
      return result;
    }
    const pages: string[] = [];
    for (let start = 0; start < rows.length; start += 20) {
      const batch = rows.slice(start, start + 20);
      const pageName = `${family}-${String(start).padStart(2, '0')}.md`;
      const lines = [`# ${family} tile pixel matches elsewhere`, '', '[Exception index](README.md)', '',
        'The classic frame differs from Nexus at the same ID, but its indexed pixels match at another Nexus ID. Compare both target positions before deciding whether to remap.', '',
        '| Classic ID | Classic source | Nexus same ID | Nexus exact-pixel ID | Nexus at that ID |',
        '| ---: | --- | --- | ---: | --- |'];
      for (const row of batch) {
        const id = Number(row.classic_tile_id);
        const other = Number(row.exact_nexus_tile_ids.split(';')[0]);
        const stem = `${family}-${String(id).padStart(5, '0')}`;
        const sourceImage = `${stem}-classic.png`;
        const sameImage = `${stem}-nexus-same.png`;
        const otherImage = `${stem}-nexus-other.png`;
        fs.writeFileSync(path.join(dir, sourceImage), frameToPng(frame('baram', sourcePrefix, id), sourcePalettes[sourcePaletteIds[id]]));
        fs.writeFileSync(path.join(dir, sameImage), frameToPng(frame('nexus', targetPrefix, id), targetPalettes[targetPaletteIds[id]]));
        fs.writeFileSync(path.join(dir, otherImage), frameToPng(frame('nexus', targetPrefix, other), targetPalettes[targetPaletteIds[other]]));
        lines.push(`| ${id} | ![Classic ${id}](${sourceImage}) | ![Nexus ${id}](${sameImage}) | ${row.exact_nexus_tile_ids} | ![Nexus ${other}](${otherImage}) |`);
      }
      lines.push('');
      fs.writeFileSync(path.join(dir, pageName), lines.join('\n'));
      pages.push(`- [${family} IDs ${batch[0].classic_tile_id}–${batch[batch.length - 1].classic_tile_id}](${pageName})`);
    }
    summaries.push(...pages);
  }
  fs.writeFileSync(path.join(dir, 'README.md'), ['# Tile pixel matches at another ID', '',
    'These cases deserve closer review than the same-ID samples. The alternate target ID is an exact indexed-pixel match, which is evidence of a possible moved tile but does not prove map usage.', '',
    ...summaries, ''].join('\n'));
  return '- [Tile ID exceptions: 42 focused comparisons](tile-exceptions/README.md)';
}

function main(): void {
  if (!fs.existsSync(candidates) || !fs.existsSync(path.join(mappings, 'monsters.csv'))) {
    throw new Error('Run npm run mappings and npm run export-candidates first');
  }
  fs.mkdirSync(tmp, { recursive: true });
  const stage = fs.mkdtempSync(path.join(tmp, '.mapping-validation-'));
  try {
    const nexusTile = new DatHandler(path.join(Configuration.ntk.dataDirectory, 'tile.dat'), false);
    const links = [
      writeMonsters(stage),
      writeTileSamples(stage, 'tiles', nexusTile),
      writeTileSamples(stage, 'tiles-c', nexusTile),
      writeTileExceptions(stage, nexusTile),
      '- [Riding: 12 frame pairs](../../mappings/riding/README.md)',
    ];
    fs.writeFileSync(path.join(stage, 'README.md'), ['# Visual mapping validation', '',
      'Compare classic Baram images with the original Nexus sprite at the same ID. Release uses these same-ID mappings. Monster previews use frame 6 where present, otherwise the last available frame. Tile pages sample 32 frames from each archive; the exception pages show every exact-pixel match found at a different target ID.', '',
      ...links, '',
      'Matching shapes and animation directions support an ID mapping. Check the exception pages before choosing whether to replace an entire tile range.', '',
    ].join('\n'));
    fs.rmSync(output, { recursive: true, force: true });
    fs.renameSync(stage, output);
    fs.writeFileSync(path.join(tmp, 'README.md'),
      '# Temporary sprite exports\n\n[Additional classic graphic candidates](candidates/README.md)\n\n[Visual mapping validation](mapping-validation/README.md)\n');
    console.log(`Wrote visual comparisons to ${output}`);
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

main();
