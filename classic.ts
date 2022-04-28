import { Configuration } from "./Configuration";
import { DatFileMetaData, DatHandler } from "./FileHandlers/DatHandler";
import { EpfHandler } from "./FileHandlers/EpfHandler";
import { Frame } from "./FileHandlers/Frame";
import { FileUtils } from "./FileHandlers/FileUtils";
import fs from 'fs';
import { FrameFinder } from "./FileHandlers/FrameFinder";


// const ntkDatHandlers = fs.readdirSync(Configuration.ntk.dataDirectory)
//   .filter((fileName) => fileName.toLowerCase().includes('body'))
//   .sort(FileUtils.SortByNumericalPart)
//   .map((fileName) => {
//     return {
//       fileName,
//       datHandler: new DatHandler(`${Configuration.ntk.dataDirectory}\\${fileName}`, false),
//     }
//   });
// const ntkDatFileMetaData = ntkDatHandlers.map((entry) => {
//   for (let meta of entry.datHandler.datFileMetaData) {
//     return meta; // ... this is fine
//   }
// });
// const ntkEpfFrameCounts: number[] = ntkDatFileMetaData.map((entry) => {
//   if (!entry) return 0;
//   return (entry[1].fileHandler as EpfHandler).frameCount;
// })
// console.log(`ntkEpfFrameCounts: ${JSON.stringify(ntkEpfFrameCounts)}`);

// const baramDatHandlers = fs.readdirSync(Configuration.baram.dataDirectory)
//   .filter((fileName) => fileName.toLowerCase().includes('c_body'))
//   .sort(FileUtils.SortByNumericalPart)
//   .map((fileName) => {
//     return {
//       fileName,
//       datHandler: new DatHandler(`${Configuration.baram.dataDirectory}\\${fileName}`, true),
//     }
//   });
// const baramDatFileMetaData = baramDatHandlers.map((entry) => {
//   for (let meta of entry.datHandler.datFileMetaData) {
//     return meta; // ... this is fine
//   }
// });
// const baramEpfFrameCounts: number[] = baramDatFileMetaData.map((entry) => {
//   if (!entry) return 0;
//   return (entry[1].fileHandler as EpfHandler).frameCount;
// })
// console.log(`baramEpfFrameCounts: ${JSON.stringify(baramEpfFrameCounts)}`);

const ntkBody0: DatHandler = new DatHandler(`${Configuration.ntk.dataDirectory}\\Body0.dat`, false);
const baramBody0: DatHandler = new DatHandler(`${Configuration.baram.dataDirectory}\\C_Body0.dat`, true);

console.log(`ntkBody0.datFileMetaData keys: `);
for (let asdf of ntkBody0.datFileMetaData.keys()) {
  console.log(`  ${asdf}`);
}
const ntkBody0MetaData = ntkBody0.datFileMetaData.get("Body0.epf") as DatFileMetaData;
const baramBody0MetaData = baramBody0.datFileMetaData.get("C_Body0.epf") as DatFileMetaData;
(ntkBody0MetaData.fileHandler as EpfHandler).writeToFile(`${Configuration.ntk.datDumpDirectory}\\body0.dat\\Body0.epf.custom.before`);


// validSwapIndexRange: [2, 126], 
// framesPerBody: { baram: 103, ntk: 80, },

// const epfsEdited: number[] = [];
// for (
//   let bodyIndex = Configuration.body.validSwapIndexRange[0];
//   bodyIndex <= Configuration.body.validSwapIndexRange[1];
//   bodyIndex++
// ) {
//   const ntkEpfLocation = FrameFinder.getEpfIndexForBodyIndex(
//     ntkEpfFrameCounts,
//     Configuration.body.framesPerBody.ntk,
//     bodyIndex
//   );
//   const baramEpfLocation = FrameFinder.getEpfIndexForBodyIndex(
//     baramEpfFrameCounts,
//     Configuration.body.framesPerBody.baram,
//     bodyIndex
//   );
//   console.log(`Will swap frames for body ${bodyIndex} \
// from ${(baramDatFileMetaData[baramEpfLocation.epfIndex] as [string, DatFileMetaData])[0]} \
// to ${(ntkDatFileMetaData[ntkEpfLocation.epfIndex] as [string, DatFileMetaData])[0]}`);

//   Configuration.body.baramToNtkFrameOffsetMap.forEach((frameMap) => {
//     const ntkFrameIndex = ntkEpfLocation.epfBodyFrameStart + frameMap[1] as number;
//     const baramFrameIndex = baramEpfLocation.epfBodyFrameStart + frameMap[0] as number;
//     const baramMetaData = baramDatFileMetaData[baramEpfLocation.epfIndex] as [string, DatFileMetaData];
//     const baramFrame = (baramMetaData[1].fileHandler as EpfHandler).frames[baramFrameIndex] as Frame;
//     ((ntkDatFileMetaData[ntkEpfLocation.epfIndex] as [string, DatFileMetaData])[1].fileHandler as EpfHandler)
//       .frames[ntkFrameIndex] = baramFrame;
//   });

//   epfsEdited.push(ntkEpfLocation.epfIndex);
// }

// for (let index of new Set(epfsEdited)) {
//   const epfName = (ntkDatFileMetaData[index] as [string, DatFileMetaData])[0];
//   ntkDatHandlers[index].datHandler.datFileMetaData.set(epfName, (ntkDatFileMetaData[index] as [string, DatFileMetaData])[1]);
//   const customDatDumpDirectory = `${Configuration.ntk.datDumpDirectory}\\custom`;
//   if (!fs.existsSync(customDatDumpDirectory)) fs.mkdirSync(customDatDumpDirectory);
//   ntkDatHandlers[index].datHandler.writeToFile(`${customDatDumpDirectory}\\${ntkDatHandlers[index].fileName}`);
// }

// Configuration.body["war platemail"].baram.frameIndexMap.forEach((frameMap) => {
//   const ntkFrameIndex = Configuration.body["war platemail"].ntk.framesOffset + frameMap[1] as number;
//   const baramFrameIndex = Configuration.body["war platemail"].baram.framesOffset + frameMap[0] as number;
//   console.log(`Replacing NTK frame ${ntkFrameIndex} with baram frame ${baramFrameIndex}`);
//   const baramFrame = (baramBody0MetaData.fileHandler as EpfHandler).frames[baramFrameIndex] as Frame;
//   (ntkBody0MetaData.fileHandler as EpfHandler).frames[ntkFrameIndex] = baramFrame;
// });
// (ntkBody0MetaData.fileHandler as EpfHandler).writeToFile(`${Configuration.ntk.datDumpDirectory}\\body0.dat\\Body0.epf.custom.after`);
// ntkBody0.datFileMetaData.set("Body0.epf", ntkBody0MetaData);
// console.log(`ntkBody0.datFileMetaData keys after modification: `);
// for (let asdf of ntkBody0.datFileMetaData.keys()) {
//   console.log(`  ${asdf}`);
// }
// ntkBody0.writeToFile(`${Configuration.ntk.datDumpDirectory}\\body0.dat.custom`);