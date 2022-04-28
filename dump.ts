import { DatHandler } from "./FileHandlers/DatHandler";
import { Configuration } from "./Configuration";
import fs from 'fs';

console.log(`Dumping with configuration: ${JSON.stringify(Configuration, null, 2)}`);

const ntkDatHandler: DatHandler = new DatHandler(`${Configuration.ntkDataDirectory}\\char.dat`, false);
console.log(`${ntkDatHandler.fileCount} files in NTK char.dat`);
writeDatFilesToFile(Configuration.ntkDatDumpDirectory, ntkDatHandler);

const baramDatHandler: DatHandler = new DatHandler(`${Configuration.baramDataDirectory}\\char.dat`, true);
console.log(`${baramDatHandler.fileCount} files in NTK char.dat`);
writeDatFilesToFile(Configuration.baramDatDumpDirectory, baramDatHandler);

function writeDatFilesToFile(basePath: string, datHandler: DatHandler) {
  fs.mkdirSync(basePath, { recursive: true });
  for (const fileMetadata of datHandler.datFileMetaData) {
    const fullPath = `${basePath}\\${fileMetadata[0]}`;
    console.log(`Writing file: ${fullPath}`);
    fs.writeFileSync(fullPath, fileMetadata[1].buffer);
  }
}