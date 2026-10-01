import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { Configuration } from './Configuration';
import { DscHandler } from './FileHandlers/DscHandler';
import { EpfHandler } from './FileHandlers/EpfHandler';
import { frameToPng, readPalettes } from './FileHandlers/SpritePng';

interface DnaEntry {
  frameIndex: number;
  paletteIndex: number;
  layout: Buffer;
}

interface TileObject {
  header: Buffer;
  tiles: number[];
}

function numberedFiles(directory: string, prefix: string): string[] {
  const expression = new RegExp(`^${prefix}(\\d+)\\.dat$`, 'i');
  return fs.readdirSync(directory).filter(name => expression.test(name))
    .sort((a, b) => Number(expression.exec(a)![1]) - Number(expression.exec(b)![1]));
}

function archiveFrameSpans(directory: string, prefix: string, isBaram: boolean): { name: string; start: number; count: number }[] {
  const result: { name: string; start: number; count: number }[] = [];
  let start = 0;
  for (const name of numberedFiles(directory, prefix)) {
    const file = fs.openSync(path.join(directory, name), 'r');
    try {
      const bytes = Buffer.alloc(4);
      fs.readSync(file, bytes, 0, 4, 4);
      const epfStart = bytes.readUInt32LE(0);
      fs.readSync(file, bytes, 0, 2, epfStart);
      const count = bytes.readInt16LE(0);
      result.push({ name, start, count });
      start += count;
    } finally {
      fs.closeSync(file);
    }
  }
  return result;
}

function entries(file: string, isBaram: boolean): Map<string, Buffer> {
  const buffer = fs.readFileSync(file);
  const width = isBaram ? 32 : 13;
  const count = buffer.readUInt32LE(0);
  if (count > 100000) throw new Error(`Invalid DAT entry count in ${file}`);
  const result = new Map<string, Buffer>();
  for (let index = 0; index < count; index++) {
    const at = 4 + index * (width + 4);
    const start = buffer.readUInt32LE(at);
    const end = buffer.readUInt32LE(at + width + 4);
    const rawName = buffer.subarray(at + 4, at + 4 + width);
    const zero = rawName.indexOf(0);
    const name = rawName.subarray(0, zero < 0 ? width : zero).toString('latin1').toLowerCase();
    if (name) result.set(name, buffer.subarray(start, end));
  }
  return result;
}

function required(map: Map<string, Buffer>, key: string): Buffer {
  const result = map.get(key.toLowerCase());
  if (!result) throw new Error(`Missing archive entry: ${key}`);
  return result;
}

function parseDna(buffer: Buffer): DnaEntry[] {
  const count = buffer.readUInt32LE(0);
  const result: DnaEntry[] = [];
  let offset = 4;
  for (let id = 0; id < count; id++) {
    const frameIndex = buffer.readUInt32LE(offset);
    const chunks = buffer.readUInt8(offset + 4);
    const paletteIndex = buffer.readUInt16LE(offset + 6);
    offset += 8;
    const layoutStart = offset;
    for (let chunk = 0; chunk < chunks; chunk++) {
      const blocks = buffer.readUInt16LE(offset);
      offset += 2 + blocks * 9;
    }
    result.push({ frameIndex, paletteIndex, layout: buffer.subarray(layoutStart, offset) });
  }
  if (offset !== buffer.length) throw new Error(`DNA parsing ended at ${offset}, expected ${buffer.length}`);
  return result;
}

function palettesFor(baram: Map<string, Buffer>, source: string, nexus: Map<string, Buffer>, target: string): {
  source: Buffer[]; target: Buffer[]; matches: number[][];
} {
  const from = readPalettes(required(baram, source));
  const to = readPalettes(required(nexus, target));
  const matches = from.map(palette => to.flatMap((candidate, index) => candidate.equals(palette) ? [index] : []));
  return { source: from, target: to, matches };
}

function selectedMatch(sourceIndex: number, matches: number[]): number | null {
  if (!matches.length) return null;
  if (matches.includes(sourceIndex)) return sourceIndex;
  return matches.reduce((best, index) =>
    Math.abs(index - sourceIndex) < Math.abs(best - sourceIndex) ? index : best);
}

function csv(rows: (string | number | boolean | null)[][]): string {
  return rows.map(row => row.map(cell => {
    const value = cell === null ? '' : String(cell);
    return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  }).join(',')).join('\n') + '\n';
}

function monsterMapping(output: string, baramMon: Map<string, Buffer>, nexusMon: Map<string, Buffer>): {
  count: number; sameLayout: number; sameFrames: number; frameDelta: number; paletteRows: (string | number | null)[][];
} {
  const source = parseDna(required(baramMon, 'ClassicMonster.dna'));
  const target = parseDna(required(nexusMon, 'monster.dna'));
  const palette = palettesFor(baramMon, 'ClassicMonster.pal', nexusMon, 'monster.pal');
  const sourceEpfs = new Map<number, { archive: string; frames: number }>();
  const targetArchives = archiveFrameSpans(Configuration.ntk.dataDirectory, 'mon', false);
  for (const file of numberedFiles(Configuration.baram.dataDirectory, 'cmon')) {
    for (const [name, epf] of entries(path.join(Configuration.baram.dataDirectory, file), true)) {
      const match = /^cmon(\d+)\.epf$/.exec(name);
      if (match) sourceEpfs.set(Number(match[1]), { archive: file, frames: epf.readInt16LE(0) });
    }
  }
  if (source.length !== sourceEpfs.size || target.length <= source.length) throw new Error('Unexpected monster count');
  const sourceTotal = [...sourceEpfs.values()].reduce((sum, epf) => sum + epf.frames, 0);
  const targetFirstUnchanged = target[source.length].frameIndex;
  const rows: (string | number | boolean | null)[][] = [[
    'monster_id', 'baram_dat', 'baram_epf', 'baram_frame_start', 'baram_frame_count',
    'nexus_dat_at_start', 'nexus_local_frame', 'nexus_frame_start', 'nexus_frame_count', 'animation_layout_same',
    'baram_palette', 'nexus_identical_palette', 'new_nexus_frame_start',
  ]];
  let sameLayout = 0;
  let sameFrames = 0;
  let running = 0;
  for (let id = 0; id < source.length; id++) {
    const from = source[id];
    const to = target[id];
    const epf = sourceEpfs.get(id);
    if (!epf || from.frameIndex !== running) throw new Error(`Monster ${id} has inconsistent source frames`);
    if (id + 1 < source.length && source[id + 1].frameIndex !== running + epf.frames) {
      throw new Error(`Monster ${id} EPF and DNA frame spans differ`);
    }
    const targetCount = target[id + 1].frameIndex - to.frameIndex;
    const archive = targetArchives.find(item => item.start <= to.frameIndex && to.frameIndex < item.start + item.count);
    if (!archive) throw new Error(`No Nexus DAT holds monster ${id} frame ${to.frameIndex}`);
    const layoutSame = from.layout.equals(to.layout);
    if (layoutSame) sameLayout++;
    if (epf.frames === targetCount) sameFrames++;
    const match = selectedMatch(from.paletteIndex, palette.matches[from.paletteIndex] || []);
    if (match === null) throw new Error(`No Nexus palette for classic monster ${id}`);
    rows.push([id, epf.archive, `cmon${id}.epf`, from.frameIndex, epf.frames,
      archive.name, to.frameIndex - archive.start, to.frameIndex, targetCount,
      layoutSame, from.paletteIndex, match, running]);
    running += epf.frames;
  }
  if (running !== sourceTotal) throw new Error('Unexpected classic monster frame total');
  fs.writeFileSync(path.join(output, 'monsters.csv'), csv(rows));
  const paletteRows: (string | number | null)[][] = palette.matches.map((matches, index) => [
    'monster', index, selectedMatch(index, matches), 'reuse', matches.join(';'),
  ]);
  return { count: source.length, sameLayout, sameFrames, frameDelta: sourceTotal - targetFirstUnchanged, paletteRows };
}

function parseTileTable(buffer: Buffer): number[] {
  const count = buffer.readUInt32LE(0);
  if (buffer.length !== 4 + count * 2) throw new Error('Unexpected tile table size');
  return Array.from({ length: count }, (_, index) => buffer.readUInt16LE(4 + index * 2) & 0x7fff);
}

function frameSignatures(epf: Buffer): (string | null)[] {
  const count = epf.readInt16LE(0);
  const table = 12 + epf.readUInt32LE(8);
  const signatures: (string | null)[] = [];
  for (let index = 0; index < count; index++) {
    const at = table + index * 16;
    const width = epf.readInt16LE(at + 6) - epf.readInt16LE(at + 2);
    const height = epf.readInt16LE(at + 4) - epf.readInt16LE(at);
    if (!width || !height) {
      signatures.push(null);
      continue;
    }
    if (width < 0 || height < 0) throw new Error('Invalid tile dimensions');
    const pixels = 12 + epf.readUInt32LE(at + 8);
    const dimensions = Buffer.alloc(4);
    dimensions.writeUInt16LE(width, 0);
    dimensions.writeUInt16LE(height, 2);
    signatures.push(createHash('sha256').update(dimensions)
      .update(epf.subarray(pixels, pixels + width * height)).digest('hex'));
  }
  return signatures;
}

function tileSignatures(directory: string, prefix: string, isBaram: boolean): (string | null)[] {
  const result: (string | null)[] = [];
  for (const file of numberedFiles(directory, prefix)) {
    const dat = entries(path.join(directory, file), isBaram);
    const epf = required(dat, `${path.parse(file).name}.epf`);
    result.push(...frameSignatures(epf));
  }
  return result;
}

function parseObjects(buffer: Buffer, isBaram: boolean): TileObject[] {
  const start = isBaram ? 4 : 0;
  const count = buffer.readUInt32LE(start);
  const objects: TileObject[] = [];
  let offset = start + 6;
  for (let id = 0; id < count; id++) {
    const header = buffer.subarray(offset, offset + 7);
    const height = buffer.readInt8(offset + 6);
    if (height < 0) throw new Error(`Object ${id} has negative height`);
    offset += 7;
    const tiles: number[] = [];
    for (let row = 0; row < height; row++) {
      tiles.push(isBaram ? buffer.readUInt32LE(offset) : buffer.readUInt16LE(offset));
      offset += isBaram ? 4 : 2;
    }
    objects.push({ header, tiles });
  }
  if (offset !== buffer.length) throw new Error('Object table length mismatch');
  return objects;
}

function tileMapping(output: string, kind: 'ground' | 'object', baramTile: Map<string, Buffer>, nexusTile: Map<string, Buffer>): {
  count: number; targetCount: number; samePixels: number; otherExactPixels: number; samePaletteIndex: number;
  identicalPalettes: number; sourcePalettes: number; missingPalettes: number[]; paletteChanges: number;
  paletteRows: (string | number | null)[][];
} {
  const sourcePrefix = kind === 'ground' ? 'ClassicTile' : 'ClassicTileC';
  const targetPrefix = kind === 'ground' ? 'tile' : 'tilec';
  const sourceTable = parseTileTable(required(baramTile, `${sourcePrefix}.tbl`));
  const targetTable = parseTileTable(required(nexusTile, `${targetPrefix}.tbl`));
  const palette = palettesFor(baramTile, `${sourcePrefix}.pal`, nexusTile, `${targetPrefix}.pal`);
  const sourceFrames = tileSignatures(Configuration.baram.dataDirectory, sourcePrefix, true);
  const targetFrames = tileSignatures(Configuration.ntk.dataDirectory, targetPrefix, false);
  if (sourceFrames.length !== sourceTable.length || targetFrames.length !== targetTable.length) {
    throw new Error(`${kind} EPF and TBL counts differ`);
  }
  const targetsBySignature = new Map<string, number[]>();
  for (let id = 0; id < targetFrames.length; id++) {
    const signature = targetFrames[id];
    if (signature) targetsBySignature.set(signature, [...(targetsBySignature.get(signature) || []), id]);
  }
  let samePixels = 0;
  let otherExactPixels = 0;
  const exceptions: (string | number)[][] = [['kind', 'classic_tile_id', 'exact_nexus_tile_ids']];
  for (let id = 0; id < sourceFrames.length; id++) {
    const signature = sourceFrames[id];
    if (!signature) continue;
    if (signature === targetFrames[id]) {
      samePixels++;
    } else {
      const matches = targetsBySignature.get(signature) || [];
      if (matches.length) {
        otherExactPixels++;
        exceptions.push([kind, id, matches.join(';')]);
      }
    }
  }
  fs.writeFileSync(path.join(output, `${kind}-pixel-matches.csv`), csv(exceptions));
  let nextPalette = palette.target.length;
  const replacementPaletteIds: number[] = [];
  const paletteRows: (string | number | null)[][] = palette.matches.map((matches, index) => [
    kind, index, replacementPaletteIds[index] = selectedMatch(index, matches) ?? nextPalette++,
    matches.length ? 'reuse' : 'append', matches.join(';'),
  ]);
  const changes: (string | number)[][] = [['tile_id', 'baram_palette', 'nexus_existing_palette', 'nexus_replacement_palette']];
  for (let id = 0; id < sourceTable.length; id++) {
    const replacement = replacementPaletteIds[sourceTable[id]];
    if (replacement === undefined) throw new Error(`${kind} tile ${id} has no source palette`);
    if (replacement !== targetTable[id]) {
      changes.push([id, sourceTable[id], targetTable[id], replacement]);
    }
  }
  fs.writeFileSync(path.join(output, `${kind}-palette-updates.csv`), csv(changes));
  return {
    count: sourceFrames.length,
    targetCount: targetFrames.length,
    samePixels,
    otherExactPixels,
    samePaletteIndex: sourceTable.filter((index, id) => index === targetTable[id]).length,
    identicalPalettes: palette.matches.filter((matches, index) => matches.includes(index)).length,
    sourcePalettes: palette.source.length,
    missingPalettes: palette.matches.flatMap((matches, index) => matches.length ? [] : [index]),
    paletteChanges: changes.length - 1,
    paletteRows,
  };
}

function main(): void {
  const output = path.join(__dirname, 'documentation', 'mappings');
  fs.mkdirSync(output, { recursive: true });
  const baramMon = entries(path.join(Configuration.baram.dataDirectory, 'mon.dat'), true);
  const nexusMon = entries(path.join(Configuration.ntk.dataDirectory, 'mon.dat'), false);
  const baramTile = entries(path.join(Configuration.baram.dataDirectory, 'tile.dat'), true);
  const nexusTile = entries(path.join(Configuration.ntk.dataDirectory, 'tile.dat'), false);
  const baramChar = entries(path.join(Configuration.baram.dataDirectory, 'char.dat'), true);
  const baramRiding = entries(path.join(Configuration.baram.dataDirectory, 'C_Riding0.dat'), true);
  const monster = monsterMapping(output, baramMon, nexusMon);
  const ground = tileMapping(output, 'ground', baramTile, nexusTile);
  const object = tileMapping(output, 'object', baramTile, nexusTile);
  const sourceObjects = parseObjects(required(baramTile, 'ClassicSObj.tbl'), true);
  const targetObjects = parseObjects(required(nexusTile, 'SObj.tbl'), false);
  const sameObjectTiles = sourceObjects.filter((item, id) => item.tiles.join(',') === targetObjects[id]?.tiles.join(',')).length;
  const changedObjects: (string | number)[][] = [['object_id', 'classic_tile_ids', 'nexus_tile_ids']];
  for (let id = 0; id < sourceObjects.length; id++) {
    const source = sourceObjects[id];
    const target = targetObjects[id];
    if (!target) throw new Error(`No Nexus object ${id}`);
    if (source.tiles.join(',') !== target.tiles.join(',')) {
      changedObjects.push([id, source.tiles.join(';'), target.tiles.join(';')]);
    }
  }
  fs.writeFileSync(path.join(output, 'object-tile-changes.csv'), csv(changedObjects));
  const matchingRidingFrames = new DscHandler(required(baramChar, 'C_Riding.dsc'), true).parts[0].frameCount;
  const targetRiding = parseDna(required(nexusMon, 'RIDINGS.DNA'));
  const sourceRidingPalettes = readPalettes(required(baramChar, 'C_Riding.pal'));
  const targetRidingPalettes = readPalettes(required(nexusMon, 'RIDINGS.PAL'));
  const ridingPart = new DscHandler(required(baramChar, 'C_Riding.dsc'), true).parts[0];
  const ridingPaletteMatches = targetRidingPalettes.flatMap((candidate, id) =>
    candidate.equals(sourceRidingPalettes[ridingPart.paletteIndex]) ? [id] : []);
  const ridingSource = new EpfHandler(required(baramRiding, 'C_Riding0.epf')).frames;
  const ridingTarget = new EpfHandler(required(nexusMon, 'RIDINGS.EPF')).frames;
  const ridingDirectory = path.join(output, 'riding');
  fs.mkdirSync(ridingDirectory, { recursive: true });
  const ridingLines = [
    '# Riding ID 0 frame comparison', '', '[Mapping summary](../README.md)', '',
    'Baram C_Riding0.epf uses C_Riding.pal index 167. Nexus RIDINGS.EPF uses RIDINGS.PAL index 2 for riding ID 0.', '',
    '| Frame | Classic source | Nexus target |', '| ---: | --- | --- |',
  ];
  for (let index = 0; index < matchingRidingFrames; index++) {
    const sourceName = `${String(index).padStart(2, '0')}-classic.png`;
    const targetName = `${String(index).padStart(2, '0')}-nexus.png`;
    fs.writeFileSync(path.join(ridingDirectory, sourceName),
      frameToPng(ridingSource[index], sourceRidingPalettes[ridingPart.paletteIndex]));
    fs.writeFileSync(path.join(ridingDirectory, targetName),
      frameToPng(ridingTarget[index], targetRidingPalettes[targetRiding[0].paletteIndex]));
    ridingLines.push(`| ${index} | ![Classic riding ${index}](${sourceName}) | ![Nexus riding ${index}](${targetName}) |`);
  }
  ridingLines.push('');
  fs.writeFileSync(path.join(ridingDirectory, 'README.md'), ridingLines.join('\n'));
  const paletteRows = [['family', 'baram_palette', 'suggested_nexus_palette', 'action', 'all_identical_nexus_palettes'],
    ...monster.paletteRows, ...ground.paletteRows, ...object.paletteRows,
    ['riding', ridingPart.paletteIndex, ridingPaletteMatches[0] ?? targetRidingPalettes.length,
      ridingPaletteMatches.length ? 'reuse' : 'append', ridingPaletteMatches.join(';')]];
  fs.writeFileSync(path.join(output, 'palettes.csv'), csv(paletteRows));
  const ridingTargetFrames = targetRiding[1].frameIndex - targetRiding[0].frameIndex;
  const lines = [
    '# Classic asset mappings', '',
    'Generated by `npm run mappings` from the local Baram and Nexus data. The mappings below are used by `npm run classic`. This report command does not modify `Release/`.', '',
    '## Monsters', '',
    `- Baram cmon0.dat–cmon7.dat contain ${monster.count} EPFs named cmon<ID>.epf. ClassicMonster.dna has ${monster.count} matching IDs. Nexus monster.dna has ${parseDna(required(nexusMon, 'monster.dna')).length} IDs. Release maps source monster ID → the same Nexus ID for 0–${monster.count - 1}.`,
    '- Use the numeric ID in each cmon<ID>.epf filename to order the source frames. The entry order inside Baram DATs is lexical and does not match the DNA frame order.',
    `- ${monster.sameLayout}/${monster.count} IDs have byte-identical animation layouts. ${monster.sameFrames}/${monster.count} IDs have the same frame count. Release uses classic DNA layouts for IDs 0–${monster.count - 1} and preserves later Nexus layouts.`,
    `- The classic set has ${monster.frameDelta >= 0 ? '+' : ''}${monster.frameDelta} frames compared with Nexus IDs 0–${monster.count - 1}. Release shifts later Nexus DNA frame starts by that amount.`,
    `- All 42 classic monster palettes have an identical entry in Nexus monster.pal. Release remaps palette IDs using [palettes.csv](palettes.csv) and preserves Nexus monster.pal. The per-ID source archive, frame span, Nexus span, animation comparison, palette, and new frame start are in [monsters.csv](monsters.csv).`, '',
    '## Riding', '',
    `- Baram C_Riding0.dat has one ${matchingRidingFrames}-frame sprite, ID 0. Nexus mon.dat has RIDINGS.EPF and RIDINGS.DNA; riding ID 0 occupies ${ridingTargetFrames} frames, starting at frame ${targetRiding[0].frameIndex}. The released RIDINGS.EPF replaces those 12 frames at the same index.`,
    `- The source uses C_Riding.dsc and palette ${ridingPart.paletteIndex} from C_Riding.pal; Nexus riding uses RIDINGS.DNA and RIDINGS.PAL. The classic palette has ${ridingPaletteMatches.length} identical entries in the original Nexus RIDINGS.PAL, so Release appends it as palette ${targetRidingPalettes.length} and changes riding DNA ID 0 to use it. The existing Nexus animation timing and all other riding frames remain. Review the [12 frame pairs](riding/README.md).`, '',
    '## Tiles and objects', '',
    '| Family | Classic frames | Nexus frames | Same-ID pixel match | Pixel match at another ID | Same palette-table ID | Same-index palette colors |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
    `| Ground (ClassicTile → tile) | ${ground.count} | ${ground.targetCount} | ${ground.samePixels} | ${ground.otherExactPixels} | ${ground.samePaletteIndex} | ${ground.identicalPalettes}/${ground.sourcePalettes} |`,
    `| Object (ClassicTileC → tilec) | ${object.count} | ${object.targetCount} | ${object.samePixels} | ${object.otherExactPixels} | ${object.samePaletteIndex} | ${object.identicalPalettes}/${object.sourcePalettes} |`, '',
    'Both sides number tile frames globally from zero, with 2,000 frames per numbered DAT except the final archive. Release maps every classic tile ID to the same Nexus tile ID, including all 42 IDs whose indexed pixels match another Nexus ID. Those other matches remain available for reference in [ground-pixel-matches.csv](ground-pixel-matches.csv) and [object-pixel-matches.csv](object-pixel-matches.csv).', '',
    `The classic tile tables assign palettes per global tile ID. Classic ground palette IDs ${ground.missingPalettes.join(', ')} have no byte-identical original Nexus palette; Release appends them to tile.pal. Classic object palettes all reuse an identical Nexus entry. [palettes.csv](palettes.csv) lists the exact remaps. Release changes ${ground.paletteChanges} ground and ${object.paletteChanges} object tile palette-table entries; see [ground palette updates](ground-palette-updates.csv) and [object palette updates](object-palette-updates.csv). The target table flags are preserved.`, '',
    `ClassicSObj.tbl has ${sourceObjects.length} object definitions versus ${targetObjects.length} in Nexus SObj.tbl. ${sameObjectTiles} classic definitions use exactly the same tile IDs at the same object ID. Its source tile indices are 32-bit; Nexus uses 16-bit. All source indices fit the Nexus field. Release copies the ${changedObjects.length - 1} changed classic tile lists at the same object IDs and preserves Nexus behavior fields and later definitions. See [object-tile-changes.csv](object-tile-changes.csv).`, '',
    '## Packaging', '',
    '- Monster frames are packaged in Nexus-named `mon0.dat`–`mon67.dat`; updated monster.dna is in generated `mon.dat`.',
    '- Riding frames and metadata are also packaged in generated `mon.dat`.',
    '- Swapped tile frames are packaged in `tile0.dat`–`tile14.dat` and `tilec0.dat`–`tilec14.dat`; updated palettes, palette tables, and object tile lists are in generated `tile.dat`. Later Nexus tile frames and definitions are preserved.',
    '- `npm run verify-release` checks all released monster frames, DNA, and palettes; tile frames, palette assignments, and object tile lists; and riding frames and metadata. Client animation, rendering, and map usage still need an in-game check. The pixel-match analysis uses dimensions and indexed pixel bytes; it does not compare stencil data or final rendered colors.', '',
    '## In-game validation', '',
    '- Test monster IDs 2, 14, and 500 through movement, attacks, hits, and death. Their classic frame counts or animation layouts differ from Nexus. Also check IDs 734 and 735 across the classic/Nexus boundary, plus a later Nexus monster.',
    '- Test riding ID 0 facing and moving in all directions. Confirm its colors in the client.',
    '- Walk through maps using the replaced ground and object tiles. Check colors, transparency, object layering, and any objects from [the 160 changed tile lists](object-tile-changes.csv).', '',
  ];
  fs.writeFileSync(path.join(output, 'README.md'), lines.join('\n'));
  console.log(`Wrote mapping report to ${output}`);
}

main();
