import { Configuration } from "./Configuration";
import { DatFileMetaData, DatHandler } from "./FileHandlers/DatHandler";
import { EpfHandler } from "./FileHandlers/EpfHandler";
import { Frame } from "./FileHandlers/Frame";
import { FileUtils } from "./FileHandlers/FileUtils";
import { DatHandlerEntry, DatMetaEntry } from "./FileHandlers/DataType";
import fs from 'fs';



function extractBaramDats(targetPath: string) {
  if (!fs.existsSync(targetPath)) {
    fs.mkdirSync(targetPath);
  }
  const baramDatFilenames: string[] = fs.readdirSync(Configuration.baram.dataDirectory)
    .filter((fileName) => fileName.toLowerCase().endsWith('dat'));
  // const baramDatHandlers: DatHandlerEntry[] = fs.readdirSync(Configuration.baram.dataDirectory)
  //   .filter((fileName) => fileName.toLowerCase().endsWith('dat'));
  // .map((fileName) => {
  //   return {
  //     fileName,
  //     datHandler: new DatHandler(`${Configuration.baram.dataDirectory}\\${fileName}`, true),
  //   }
  // });

  baramDatFilenames.forEach((fileName) => {
    const handler = new DatHandler(`${Configuration.baram.dataDirectory}\\${fileName}`, true);
    const outputDirectoryName = fileName.replace('.dat', '');
    const outputDirectoryPath = `${targetPath}\\${outputDirectoryName}`;
    console.log(`Extracting files from ${fileName} into ${outputDirectoryPath}`);
    if (!fs.existsSync(outputDirectoryPath)) {
      fs.mkdirSync(outputDirectoryPath);
    }
    handler.unpackFiles(outputDirectoryPath);
  })
}


const outputFilePath = process.argv[2];
if (!outputFilePath) {
  console.log(`Provide a filePath: ts-node extractBaramDats.ts ".\\files"`);
}
extractBaramDats(outputFilePath);
