import { Configuration, SimpleSwap } from "./Configuration";
import { DatFileMetaData, DatHandler } from "./FileHandlers/DatHandler";
import { EpfHandler } from "./FileHandlers/EpfHandler";
import { Frame } from "./FileHandlers/Frame";
import { FileUtils } from "./FileHandlers/FileUtils";
import fs from 'fs';

interface DatHandlerEntry {
  fileName: string,
  datHandler: DatHandler,
}

interface DatMetaEntry {
  fileName: string,
  metaData: DatFileMetaData,
}

export function handle() {
  swap(Configuration.sword);
  swap(Configuration.spear);
  swap(Configuration.shield);
  swap(Configuration.fan);
}
function swap(swap: SimpleSwap) {
  const ntkDatHandlers: DatHandlerEntry[] = fs.readdirSync(Configuration.ntk.dataDirectory)
    .filter((fileName) => fileName.toLowerCase().includes(swap.name))
    .sort(FileUtils.SortByNumericalPart)
    .map((fileName) => {
      console.log(`Parsing NTK dat file: ${fileName}`);
      return {
        fileName,
        datHandler: new DatHandler(`${Configuration.ntk.dataDirectory}\\${fileName}`, false),
      }
    });
  const ntkDatFileMetaData: DatMetaEntry[] = ntkDatHandlers.map((entry) => {
    for (let meta of entry.datHandler.datFileMetaData) {
      return {
        fileName: meta[0],
        metaData: meta[1],
      };
    }
  }) as DatMetaEntry[];
  const ntkFrames: Frame[] = ntkDatFileMetaData.map((entry) => {
    if (entry.metaData.fileHandler) {
      console.log(`${entry.fileName} has ${entry.metaData.fileHandler.frameCount} frames`);
      return entry.metaData.fileHandler.frames;
    }
    return [];
  }).flat();

  const baramDatHandlers: DatHandlerEntry[] = fs.readdirSync(Configuration.baram.dataDirectory)
    .filter((fileName) => fileName.toLowerCase().includes(`c_${swap.name}`))
    .sort(FileUtils.SortByNumericalPart)
    .map((fileName) => {
      console.log(`Parsing Baram dat file: ${fileName}`);
      return {
        fileName,
        datHandler: new DatHandler(`${Configuration.baram.dataDirectory}\\${fileName}`, true),
      }
    });
  const baramDatFileMetaData: DatMetaEntry[] = baramDatHandlers.map((entry) => {
    for (let meta of entry.datHandler.datFileMetaData) {
      return {
        fileName: meta[0],
        metaData: meta[1],
      };
    }
  }) as DatMetaEntry[];
  const baramFrames: Frame[] = baramDatFileMetaData.map((entry) => {
    if (entry.metaData.fileHandler) {
      console.log(`${entry.fileName} has ${entry.metaData.fileHandler.frameCount} frames`);
      return entry.metaData.fileHandler.frames;
    }
    return [];
  }).flat();

  let frameIndex = 0;
  for (
    let i = swap.validSwapIndexRange[0];
    i <= swap.validSwapIndexRange[1];
    i++
  ) {
    console.log(`Overwriting frames for ${swap.name} ${i} of ${swap.validSwapIndexRange[1]}`);
    for (let ii = 0; ii < swap.framesPer.ntk; ii++) {
      ntkFrames[frameIndex + ii] = baramFrames[frameIndex + ii];
    }
    frameIndex += swap.framesPer.ntk;
  }

  const customDatDumpDirectory = `${Configuration.ntk.datDumpDirectory}\\custom`;
  for (let handler of ntkDatHandlers) {
    const epfName = handler.datHandler.getOnlyFileName();
    const metaData = handler.datHandler.datFileMetaData.get(epfName);
    if (!metaData) throw new Error(`Found no metadata for file name: ${epfName}`);
    const frameCount = ntkFrames.length > 2600 ? 2600 : ntkFrames.length;
    (metaData.fileHandler as EpfHandler).frames = ntkFrames.splice(0, frameCount);
    handler.datHandler.writeToFile(`${customDatDumpDirectory}\\${handler.fileName}`)
  }
}