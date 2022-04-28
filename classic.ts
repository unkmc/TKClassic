import { Configuration } from "./Configuration";
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

const ntkDatHandlers: DatHandlerEntry[] = fs.readdirSync(Configuration.ntk.dataDirectory)
  .filter((fileName) => fileName.toLowerCase().includes('body'))
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
const ntkEpfFrameCounts: number[] = ntkDatFileMetaData.map((entry) => {
  if (!entry) return 0;
  return (entry.metaData.fileHandler as EpfHandler).frameCount;
})
const ntkFrames: Frame[] = ntkDatFileMetaData.map((entry) => {
  if (entry.metaData.fileHandler) {
    return entry.metaData.fileHandler.frames;
  }
  return [];
}).flat();

const baramDatHandlers: DatHandlerEntry[] = fs.readdirSync(Configuration.baram.dataDirectory)
  .filter((fileName) => fileName.toLowerCase().includes('c_body'))
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
const baramEpfFrameCounts: number[] = baramDatFileMetaData.map((entry) => {
  if (!entry) return 0;
  return (entry.metaData.fileHandler as EpfHandler).frameCount;
})
const baramFrames: Frame[] = baramDatFileMetaData.map((entry) => {
  if (entry.metaData.fileHandler) {
    return entry.metaData.fileHandler.frames;
  }
  return [];
}).flat();


let ntkFrameIndex = 0;
let baramFrameIndex = 0;
for (
  let i = Configuration.body.validSwapIndexRange[0];
  i <= Configuration.body.validSwapIndexRange[1];
  i++
) {
  console.log(`Overwriting frames for body ${i} of ${Configuration.body.validSwapIndexRange[1]}`);
  Configuration.body.baramToNtkFrameOffsetMap.forEach((frameMap) => {
    const baramIndex = baramFrameIndex + frameMap[0] as number;
    const ntkIndex = ntkFrameIndex + frameMap[1] as number;
    ntkFrames[ntkIndex] = baramFrames[baramIndex];
  });
  ntkFrameIndex += 80;
  baramFrameIndex += 103;
}

const customDatDumpDirectory = `${Configuration.ntk.datDumpDirectory}\\custom`;
for (let handler of ntkDatHandlers) {
  const epfName = handler.datHandler.getOnlyFileName();
  const metaData = handler.datHandler.datFileMetaData.get(epfName);
  if(!metaData) throw new Error(`Found no metadata for file name: ${epfName}`);
  const frameCount = ntkFrames.length > 2600 ? 2600 : ntkFrames.length;
  (metaData.fileHandler as EpfHandler).frames = ntkFrames.splice(0, frameCount);
  handler.datHandler.writeToFile(`${customDatDumpDirectory}\\${handler.fileName}`)
}
