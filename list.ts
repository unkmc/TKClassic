import { DatHandler } from "./FileHandlers/DatHandler";
import { Configuration } from "./Configuration";
import fs from 'fs';

// console.log(`Listing dat file contents with configuration: ${JSON.stringify(Configuration, null, 2)}`);


extractFilesFromDat('char', true);
extractFilesFromDat('char', false);
extractFilesFromDat('body', true);
extractFilesFromDat('body', false);

function extractFilesFromDat(fileNameSubstring: string, isBaram: boolean) {
  const datDumpPath = isBaram
    ? Configuration.baram.datDumpDirectory
    : Configuration.ntk.datDumpDirectory;
  const datPath = isBaram
    ? Configuration.baram.dataDirectory
    : Configuration.ntk.dataDirectory;
  console.log(`Reading datPath: ${datPath}`);
  const datFiles = fs.readdirSync(datPath)
    .filter((fileName) => {
      return fileName.toLowerCase().includes(fileNameSubstring)
        && fileName.toLowerCase().endsWith('.dat');
    }).map((fileName) => {
      return {
        fileName,
        filePath: `${datDumpPath}\\${fileName}`,
      };
    });
  console.log(`Found ${datFiles.length} dat files:${JSON.stringify(datFiles, null, 2)}`);

  for (let fileInfo of datFiles) {
    console.log(`Instantiating DatHandler for ${fileInfo.filePath}`);
    const datHandler = new DatHandler(fileInfo.filePath, isBaram);
    writeFilesFromDat(`${datDumpPath}\\${fileInfo.fileName}`, datHandler);
  }
}


// const ntkDatHandler: DatHandler = new DatHandler(`${Configuration.ntk.dataDirectory}\\char.dat`, false);
// console.log(`${ntkDatHandler.fileCount} files in NTK char.dat`);
// extractFilesFromDat(Configuration.ntk.datDumpDirectory, ntkDatHandler);

// const baramDatHandler: DatHandler = new DatHandler(`${Configuration.baram.dataDirectory}\\char.dat`, true);
// console.log(`${baramDatHandler.fileCount} files in NTK char.dat`);
// extractFilesFromDat(Configuration.baram.datDumpDirectory, baramDatHandler);

function writeFilesFromDat(basePath: string, datHandler: DatHandler) {
  console.log(`Writing files from dat...`);
  fs.mkdirSync(basePath, { recursive: true });
  for (const fileMetadata of datHandler.datFileMetaData) {
    const fullPath = `${basePath}\\${fileMetadata[0]}`;
    console.log(`Writing file: ${fullPath}`);
    fs.writeFileSync(fullPath, fileMetadata[1].buffer);
  }
}