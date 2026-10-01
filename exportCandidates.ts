import fs from 'fs';
import path from 'path';
import { Configuration } from './Configuration';
import { DatHandler } from './FileHandlers/DatHandler';
import { DscHandler } from './FileHandlers/DscHandler';
import { EpfHandler } from './FileHandlers/EpfHandler';
import { FileUtils } from './FileHandlers/FileUtils';
import { frameToPng, readPalettes } from './FileHandlers/SpritePng';

const root = path.join(__dirname, 'documentation', 'tmp');
const output = path.join(root, 'candidates');
const data = Configuration.baram.dataDirectory;

function archiveFile(dat: DatHandler, name: string): Buffer {
  const entry = [...dat.datFileMetaData.values()].find(meta => meta.fileName.toLowerCase() === name.toLowerCase());
  if (!entry) throw new Error(`${name} is missing from ${dat.filePath}`);
  return entry.buffer;
}

function epfFromDat(fileName: string): EpfHandler {
  const dat = new DatHandler(path.join(data, fileName), true);
  const name = dat.getOnlyFileName();
  const epf = dat.datFileMetaData.get(name)?.fileHandler;
  if (!epf) throw new Error(`No EPF in ${fileName}`);
  return epf;
}

function page(dir: string, title: string, note: string, entries: string[]): void {
  fs.writeFileSync(path.join(dir, 'README.md'), [`# ${title}`, '', '[Candidate index](../README.md)', '', note, '', ...entries, ''].join('\n'));
}

function exportCharacters(stage: string, baramChar: DatHandler, nexusChar: DatHandler): string[] {
  const summaries: string[] = [];
  for (const name of ['body', 'shield', 'spear', 'sword']) {
    const sourceDsc = new DscHandler(archiveFile(baramChar, `C_${name}.dsc`), true);
    const targetDsc = new DscHandler(archiveFile(nexusChar, `${name}.dsc`), false);
    const targetPalettes = readPalettes(archiveFile(nexusChar, `${name}.pal`));
    const groups = name === 'body'
      ? Configuration.body.validSwapIndexRange[1] - Configuration.body.validSwapIndexRange[0] + 1
      : Configuration[name as 'shield' | 'spear' | 'sword'].validSwapIndexRange[1] + 1;
    const stride = name === 'body' ? Configuration.body.framesPer.baram : 19;
    const firstUnusedFrame = groups * stride;
    const unused = sourceDsc.parts.filter(part => part.frameIndex >= firstUnusedFrame);
    const files = fs.readdirSync(data)
      .filter(fileName => new RegExp(`^C_${name}\\d+\\.dat$`, 'i').test(fileName))
      .sort(FileUtils.SortByNumericalPart);
    const frames = files.flatMap(fileName => epfFromDat(fileName).frames);
    const dir = path.join(stage, name);
    fs.mkdirSync(dir);
    const entries: string[] = [];
    for (const part of unused) {
      const target = targetDsc.parts.find(candidate => candidate.id === part.id);
      if (!target) throw new Error(`No Nexus ${name} sprite ${part.id} for palette selection`);
      const palette = targetPalettes[target.paletteIndex];
      const frame = frames[part.frameIndex + 6];
      if (!palette || !frame || part.frameCount <= 6) throw new Error(`Cannot preview ${name} ${part.id}`);
      const file = `${String(part.id).padStart(3, '0')}.png`;
      fs.writeFileSync(path.join(dir, file), frameToPng(frame, palette));
      entries.push(`| ${part.id} | ${part.frameIndex + 6} | ![${name} ${part.id}](${file}) |`);
    }
    page(dir, `Unused classic ${name} sprites`, `Source frame 6; Nexus sprite palette. The current writer never reads any frame from these source sprites.`, [
      '| Baram sprite ID | Global source frame | Preview |',
      '| ---: | ---: | --- |',
      ...entries,
    ]);
    summaries.push(`| [${name}](${name}/README.md) | ${unused.length} ${unused.length === 1 ? 'sprite' : 'sprites'} |`);
  }
  return summaries;
}

function exportRiding(stage: string, baramChar: DatHandler): string {
  const dsc = new DscHandler(archiveFile(baramChar, 'C_Riding.dsc'), true);
  const palettes = readPalettes(archiveFile(baramChar, 'C_Riding.pal'));
  const frames = epfFromDat('C_Riding0.dat').frames;
  const dir = path.join(stage, 'riding');
  fs.mkdirSync(dir);
  const entries = dsc.parts.map(part => {
    const frame = frames[part.frameIndex + 6] || frames[part.frameIndex];
    const palette = palettes[part.paletteIndex];
    if (!frame || !palette) throw new Error(`Cannot preview riding ${part.id}`);
    const file = `${part.id}.png`;
    fs.writeFileSync(path.join(dir, file), frameToPng(frame, palette));
    return `| ${part.id} | ${part.frameIndex + 6 < frames.length ? 6 : 0} | ![Riding ${part.id}](${file}) |`;
  });
  page(dir, 'Classic riding', 'Baram `C_Riding0.dat`, using its DSC palette.', [
    '| Sprite ID | Frame offset | Preview |', '| ---: | ---: | --- |', ...entries,
  ]);
  return `| [riding](riding/README.md) | ${entries.length} sprite |`;
}

function monsterPaletteIndices(dna: Buffer): number[] {
  const count = dna.readUInt32LE(0);
  const indices: number[] = [];
  let offset = 4;
  for (let id = 0; id < count; id++) {
    if (offset + 8 > dna.length) throw new Error('Truncated ClassicMonster.dna');
    const chunks = dna.readUInt8(offset + 4);
    indices.push(dna.readUInt16LE(offset + 6));
    offset += 8;
    for (let chunk = 0; chunk < chunks; chunk++) {
      if (offset + 2 > dna.length) throw new Error('Truncated monster chunk');
      const blocks = dna.readUInt16LE(offset);
      offset += 2 + blocks * 9;
    }
  }
  if (offset > dna.length) throw new Error('Truncated ClassicMonster.dna');
  return indices;
}

function exportMonsters(stage: string, baramMon: DatHandler): string {
  const palettes = readPalettes(archiveFile(baramMon, 'ClassicMonster.pal'));
  const paletteIndices = monsterPaletteIndices(archiveFile(baramMon, 'ClassicMonster.dna'));
  const files = fs.readdirSync(data).filter(name => /^cmon\d+\.dat$/i.test(name)).sort(FileUtils.SortByNumericalPart);
  const dir = path.join(stage, 'monsters');
  fs.mkdirSync(dir);
  const entries: { id: number; file: string; palette: number; frameIndex: number }[] = [];
  for (const file of files) {
    const dat = new DatHandler(path.join(data, file), true);
    for (const meta of dat.datFileMetaData.values()) {
      const match = /^cmon(\d+)\.epf$/i.exec(meta.fileName);
      if (!match || !meta.fileHandler) continue;
      const id = Number(match[1]);
      const paletteIndex = paletteIndices[id];
      const palette = palettes[paletteIndex];
      const frameIndex = Math.min(6, meta.fileHandler.frames.length - 1);
      const frame = meta.fileHandler.frames[frameIndex];
      if (!palette || !frame) throw new Error(`Cannot preview ${meta.fileName}: palette ${paletteIndex}`);
      const image = `${String(id).padStart(3, '0')}.png`;
      try {
        fs.writeFileSync(path.join(dir, image), frameToPng(frame, palette));
      } catch (error) {
        throw new Error(`Cannot render ${meta.fileName} frame ${frameIndex} (${frame.width}x${frame.height}): ${error}`);
      }
      entries.push({ id, file: image, palette: paletteIndex, frameIndex });
    }
  }
  entries.sort((a, b) => a.id - b.id);
  const links: string[] = [];
  for (let start = 0; start < entries.length; start += 40) {
    const batch = entries.slice(start, start + 40);
    const name = `${String(batch[0].id).padStart(3, '0')}-${String(batch[batch.length - 1].id).padStart(3, '0')}.md`;
    const lines = [`# Classic monsters ${batch[0].id}–${batch[batch.length - 1].id}`, '', '[Monster index](README.md)', '', 'Frame 6 where available; otherwise the last frame. Palette selected from `ClassicMonster.dna`.', '',
      '| Monster ID | Frame index | Palette | Preview |', '| ---: | ---: | ---: | --- |',
      ...batch.map(item => `| ${item.id} | ${item.frameIndex} | ${item.palette} | ![Monster ${item.id} frame ${item.frameIndex}](${item.file}) |`), ''];
    fs.writeFileSync(path.join(dir, name), lines.join('\n'));
    links.push(`- [${batch[0].id}–${batch[batch.length - 1].id}](${name})`);
  }
  page(dir, 'Classic monsters', `All ${entries.length} cmon EPFs, split into pages of at most 40 images. Frame 6 is shown where available; shorter EPFs use their last frame.`, links);
  return `| [monsters](monsters/README.md) | ${entries.length} EPFs |`;
}

function tilePaletteIndices(tbl: Buffer): number[] {
  const count = tbl.readUInt32LE(0);
  if (tbl.length !== 4 + count * 2) throw new Error('Unexpected classic tile table size');
  return Array.from({ length: count }, (_, index) => tbl.readUInt16LE(4 + index * 2) & 0x7fff);
}

function exportTiles(stage: string, baramTile: DatHandler): string[] {
  const summaries: string[] = [];
  for (const kind of ['ClassicTile', 'ClassicTileC']) {
    const palettes = readPalettes(archiveFile(baramTile, `${kind}.pal`));
    const paletteIndices = tilePaletteIndices(archiveFile(baramTile, `${kind}.tbl`));
    const files = fs.readdirSync(data)
      .filter(fileName => new RegExp(`^${kind}\\d+\\.dat$`, 'i').test(fileName))
      .sort(FileUtils.SortByNumericalPart);
    const dirName = kind === 'ClassicTile' ? 'tiles' : 'tiles-c';
    const dir = path.join(stage, dirName);
    fs.mkdirSync(dir);
    let globalStart = 0;
    const links: string[] = [];
    for (const file of files) {
      const frames = epfFromDat(file).frames;
      const sampleCount = Math.min(32, frames.length);
      const sampleIndices = Array.from({ length: sampleCount }, (_, i) =>
        Math.round(i * (frames.length - 1) / Math.max(1, sampleCount - 1)));
      const stem = path.parse(file).name;
      const lines = [`# ${file}`, '', '[Tile index](README.md)', '',
        `32 evenly spaced samples from ${frames.length} frames. Global IDs ${globalStart}–${globalStart + frames.length - 1}. Colors use ${kind}.tbl palette indices.`, '',
        '| Global tile ID | Archive frame | Palette | Preview |', '| ---: | ---: | ---: | --- |'];
      for (const index of sampleIndices) {
        const global = globalStart + index;
        const paletteIndex = paletteIndices[global];
        const palette = palettes[paletteIndex];
        if (!palette) throw new Error(`${kind} tile ${global} has invalid palette ${paletteIndex}`);
        const image = `${stem}-${String(index).padStart(4, '0')}.png`;
        fs.writeFileSync(path.join(dir, image), frameToPng(frames[index], palette));
        lines.push(`| ${global} | ${index} | ${paletteIndex} | ![Tile ${global}](${image}) |`);
      }
      lines.push('');
      fs.writeFileSync(path.join(dir, `${stem}.md`), lines.join('\n'));
      links.push(`- [${file}](./${stem}.md): global IDs ${globalStart}–${globalStart + frames.length - 1}`);
      globalStart += frames.length;
    }
    if (globalStart !== paletteIndices.length) throw new Error(`${kind}: ${globalStart} frames but ${paletteIndices.length} table entries`);
    page(dir, kind, `32 evenly spaced previews per archive; ${globalStart} source frames across ${files.length} archives.`, links);
    summaries.push(`| [${kind}](${dirName}/README.md) | ${files.length} archives, ${globalStart} frames (sampled) |`);
  }
  return summaries;
}

function main(): void {
  fs.mkdirSync(root, { recursive: true });
  const stage = fs.mkdtempSync(path.join(root, '.candidates-'));
  try {
    const baramChar = new DatHandler(path.join(data, 'char.dat'), true);
    const nexusChar = new DatHandler(path.join(Configuration.ntk.dataDirectory, 'char.dat'), false);
    const baramMon = new DatHandler(path.join(data, 'mon.dat'), true);
    const baramTile = new DatHandler(path.join(data, 'tile.dat'), true);
    const rows = [
      ...exportCharacters(stage, baramChar, nexusChar),
      exportRiding(stage, baramChar),
      exportMonsters(stage, baramMon),
      ...exportTiles(stage, baramTile),
    ];
    fs.writeFileSync(path.join(stage, 'README.md'), [
      '# Additional classic graphic candidates', '',
      'These are Baram source previews for visual review. They are not included in the current `Release/` swaps.', '',
      'Character sprites use frame 6 and Nexus palettes, matching the main catalog. Riding uses frame 6 and its Baram palette. Monsters use frame 6 where available (the last frame for shorter EPFs) and the palette from `ClassicMonster.dna`. Tiles show 32 evenly spaced frames per archive with palette assignments from the matching classic tile table.', '',
      '| Category | Exported |', '| --- | ---: |', ...rows, '',
    ].join('\n'));
    fs.rmSync(output, { recursive: true, force: true });
    fs.renameSync(stage, output);
    const validationLink = fs.existsSync(path.join(root, 'mapping-validation', 'README.md'))
      ? '\n[Visual mapping validation](mapping-validation/README.md)\n' : '';
    fs.writeFileSync(path.join(root, 'README.md'),
      `# Temporary sprite exports\n\n[Additional classic graphic candidates](candidates/README.md)\n${validationLink}`);
    console.log(`Exported candidates to ${output}`);
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

main();
