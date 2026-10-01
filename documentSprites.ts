import fs from 'fs';
import path from 'path';
import { Configuration } from './Configuration';
import { DatHandler } from './FileHandlers/DatHandler';
import { DscHandler, DscPart } from './FileHandlers/DscHandler';
import { Frame } from './FileHandlers/Frame';
import { FileUtils } from './FileHandlers/FileUtils';
import { frameToPng, readPalettes } from './FileHandlers/SpritePng';

const previewFrameOffset = 6;

interface FrameLocation {
  frame: Frame;
  datName: string;
}

interface Category {
  name: string;
  first: number;
  last: number;
  targetFramesPer: number;
  sourceFramesPer: number;
  body: boolean;
}

const categories: Category[] = [
  {
    name: 'body',
    first: Configuration.body.validSwapIndexRange[0],
    last: Configuration.body.validSwapIndexRange[1],
    targetFramesPer: Configuration.body.framesPer.ntk,
    sourceFramesPer: Configuration.body.framesPer.baram,
    body: true,
  },
  ...[Configuration.fan, Configuration.shield, Configuration.spear, Configuration.sword].map(swap => ({
    name: swap.name,
    first: swap.validSwapIndexRange[0],
    last: swap.validSwapIndexRange[1],
    targetFramesPer: swap.framesPer.ntk,
    sourceFramesPer: swap.framesPer.baram,
    body: false,
  })),
];

function archiveFile(dat: DatHandler, name: string): Buffer {
  const entry = [...dat.datFileMetaData.values()].find(meta => meta.fileName.toLowerCase() === name.toLowerCase());
  if (!entry) throw new Error(`${name} is missing from ${dat.filePath}`);
  return entry.buffer;
}

function readFrames(directory: string, name: string, isBaram: boolean): FrameLocation[] {
  const pattern = new RegExp(`^${isBaram ? 'c_' : ''}${name}\\d+\\.dat$`, 'i');
  const datNames = fs.readdirSync(directory).filter(fileName => pattern.test(fileName)).sort(FileUtils.SortByNumericalPart);
  if (datNames.length === 0) throw new Error(`No ${name} DAT files in ${directory}`);

  const frames: FrameLocation[] = [];
  for (const datName of datNames) {
    const dat = new DatHandler(path.join(directory, datName), isBaram);
    const epfName = dat.getOnlyFileName();
    const epf = dat.datFileMetaData.get(epfName)?.fileHandler;
    if (!epf) throw new Error(`No EPF in ${path.join(directory, datName)}`);
    for (const frame of epf.frames) frames.push({ frame, datName });
  }
  return frames;
}

function assignments(category: Category): Map<number, number> {
  const result = new Map<number, number>();
  // Match Body.ts and Weapon.ts exactly: both start at global frame zero,
  // regardless of the configured first sprite label.
  for (let group = 0; group <= category.last - category.first; group++) {
    const targetBase = group * category.targetFramesPer;
    const sourceBase = group * category.sourceFramesPer;
    if (category.body) {
      for (const [sourceOffset, targetOffset] of Configuration.body.baramToNtkFrameOffsetMap) {
        result.set(targetBase + targetOffset, sourceBase + sourceOffset);
      }
    } else {
      for (let offset = 0; offset < category.targetFramesPer; offset++) {
        result.set(targetBase + offset, sourceBase + offset);
      }
    }
  }
  return result;
}

function spriteForFrame(parts: DscPart[], frameIndex: number, category: string): DscPart {
  const part = parts.find(candidate =>
    candidate.frameIndex <= frameIndex && frameIndex < candidate.frameIndex + candidate.frameCount);
  if (!part) throw new Error(`${category} DSC has no sprite for global frame ${frameIndex}`);
  return part;
}

function sameFrame(a: Frame, b: Frame): boolean {
  return a.top === b.top && a.left === b.left && a.bottom === b.bottom && a.right === b.right
    && a.rawPixelData.equals(b.rawPixelData) && a.rawStencilData.equals(b.rawStencilData);
}

function selectedPalette(palettes: Buffer[], index: number, label: string): Buffer {
  const palette = palettes[index];
  if (!palette) throw new Error(`${label} palette ${index} does not exist`);
  return palette;
}

function renderCategory(category: Category, nexusChar: DatHandler, baramChar: DatHandler, imagesRoot: string): { lines: string[]; count: number } {
  const name = category.name;
  const nexusDsc = new DscHandler(archiveFile(nexusChar, `${name}.dsc`), false);
  const baramDsc = new DscHandler(archiveFile(baramChar, `C_${name}.dsc`), true);
  const nexusPalettes = readPalettes(archiveFile(nexusChar, `${name}.pal`));
  const original = readFrames(Configuration.ntk.dataDirectory, name, false);
  const released = readFrames(Configuration.releaseDirectory, name, false);
  const source = readFrames(Configuration.baram.dataDirectory, name, true);
  if (original.length !== released.length) {
    throw new Error(`${name} Release has ${released.length} frames; original has ${original.length}`);
  }

  const mapping = assignments(category);
  const affected = nexusDsc.parts.filter(part => {
    for (let frameIndex = part.frameIndex; frameIndex < part.frameIndex + part.frameCount; frameIndex++) {
      if (mapping.has(frameIndex)) return true;
    }
    return false;
  });
  const lines = [
    `# ${name[0].toUpperCase()}${name.slice(1)} sprite replacements (${affected.length})`,
    '',
    '[All sprite types](README.md)',
    '',
    `Each preview shows frame index ${previewFrameOffset} of the sprite. Both images use the Nexus palette. The Baram column identifies the source frame used for the replacement. A single EPF frame can contain more than one visible shape.`,
    '',
    `| Nexus sprite / frame | Baram source sprite / frame | Original: frame ${previewFrameOffset} | Released: frame ${previewFrameOffset} |`,
    '| --- | --- | --- | --- |',
  ];
  const imageDirectory = path.join(imagesRoot, name);
  fs.mkdirSync(imageDirectory, { recursive: true });

  for (const part of affected) {
    if (part.frameCount <= previewFrameOffset) {
      throw new Error(`${name} sprite ${part.id} has no frame ${previewFrameOffset}`);
    }
    const targetIndex = part.frameIndex + previewFrameOffset;
    const sourceIndex = mapping.get(targetIndex);
    if (sourceIndex === undefined) {
      throw new Error(`${name} sprite ${part.id} frame ${previewFrameOffset} was not overwritten`);
    }
    const originalFrame = original[targetIndex];
    const releasedFrame = released[targetIndex];
    const sourceFrame = source[sourceIndex];
    if (!originalFrame || !releasedFrame || !sourceFrame) {
      throw new Error(`${name} sprite ${part.id} has an out-of-range frame mapping (${targetIndex} → ${sourceIndex})`);
    }
    if (!sameFrame(releasedFrame.frame, sourceFrame.frame)) {
      throw new Error(`${name} sprite ${part.id}: Release frame ${targetIndex} does not match Baram frame ${sourceIndex}; regenerate Release`);
    }

    const sourcePart = spriteForFrame(baramDsc.parts, sourceIndex, `C_${name}`);
    const nexusPalette = selectedPalette(nexusPalettes, part.paletteIndex, name);
    const stem = String(part.id).padStart(3, '0');
    const originalImage = `images/${name}/${stem}-original.png`;
    const releasedImage = `images/${name}/${stem}-released.png`;
    fs.writeFileSync(path.join(imagesRoot, name, `${stem}-original.png`), frameToPng(originalFrame.frame, nexusPalette));
    fs.writeFileSync(path.join(imagesRoot, name, `${stem}-released.png`), frameToPng(releasedFrame.frame, nexusPalette));
    lines.push(`| ${part.id}, frame ${targetIndex} (${originalFrame.datName}) | ${sourcePart.id}, frame ${sourceIndex} (${sourceFrame.datName}) | ![Original ${name} ${part.id} frame ${previewFrameOffset}](${originalImage}) | ![Released ${name} ${part.id} frame ${previewFrameOffset}](${releasedImage}) |`);
  }
  lines.push('');
  return { lines, count: affected.length };
}

function main(): void {
  if (!fs.existsSync(Configuration.releaseDirectory) || !fs.statSync(Configuration.releaseDirectory).isDirectory()) {
    throw new Error(`Release is missing. Run npm run classic first: ${Configuration.releaseDirectory}`);
  }
  const nexusChar = new DatHandler(path.join(Configuration.ntk.dataDirectory, 'char.dat'), false);
  const baramChar = new DatHandler(path.join(Configuration.baram.dataDirectory, 'char.dat'), true);
  const documentation = path.resolve(__dirname, 'documentation');
  fs.mkdirSync(documentation, { recursive: true });
  const temporary = fs.mkdtempSync(path.join(documentation, '.generated-'));
  const temporaryImages = path.join(temporary, 'images');
  fs.mkdirSync(temporaryImages);

  try {
    const indexLines = [
      '# Character sprite replacements',
      '',
      `Generated from the original Nexus data, the Baram classic data, and the current \`Release/\` DATs. Each category has its own page. Previews show frame index ${previewFrameOffset} of each sprite before and after replacement, using the Nexus palette.`,
      '',
      'This catalog covers body, fan, shield, spear, and sword. Monster, riding, and tile mappings and their Release packaging are described in the [classic asset mapping report](mappings/README.md).',
      '',
      'To recognize the mobs worth checking in game, see the [mob validation guide](mob-validation.md) with released frame 06 previews.',
      '',
      'Sprite IDs come from the DSC files. The current splice starts writing body frames at sprite 0 even though its configured loop label begins at 2. Weapon writes advance 19 frames per group while DSC sprites have 20 frames, so the affected IDs can differ from the configured loop range.',
      '',
      'One EPF frame can contain multiple visible shapes. For example, sword sprite 39 has two sword shapes in its original frame 6 PNG; its row still contains only one Original and one Released PNG.',
      '',
      '| Sprite type | Affected sprites |',
      '| --- | ---: |',
    ];
    let count = 0;
    for (const category of categories) {
      const rendered = renderCategory(category, nexusChar, baramChar, temporaryImages);
      fs.writeFileSync(path.join(temporary, `${category.name}.md`), rendered.lines.join('\n') + '\n');
      indexLines.push(`| [${category.name[0].toUpperCase()}${category.name.slice(1)}](${category.name}.md) | ${rendered.count} |`);
      count += rendered.count;
      console.log(`Documented ${rendered.count} ${category.name} sprites`);
    }
    indexLines.push('', `**Total: ${count} sprites.**`, '');
    fs.writeFileSync(path.join(temporary, 'README.md'), indexLines.join('\n') + '\n');

    const images = path.join(documentation, 'images');
    fs.mkdirSync(images, { recursive: true });
    for (const category of categories) {
      const categoryImages = path.join(images, category.name);
      fs.rmSync(categoryImages, { recursive: true, force: true });
      fs.renameSync(path.join(temporaryImages, category.name), categoryImages);
    }
    for (const category of categories) {
      fs.renameSync(path.join(temporary, `${category.name}.md`), path.join(documentation, `${category.name}.md`));
    }
    fs.renameSync(path.join(temporary, 'README.md'), path.join(documentation, 'README.md'));
    console.log(`Documented ${count} sprites in ${documentation}`);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

main();
