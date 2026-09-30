import { Configuration } from "./Configuration";
import { DatHandler } from "./FileHandlers/DatHandler";
import fs from 'fs';
import path from 'path';



function extractBaramDats(targetPath: string) {
  fs.mkdirSync(targetPath, { recursive: true });
  const baramDatFilenames: string[] = fs.readdirSync(Configuration.baram.dataDirectory)
    .filter((fileName) => fileName.toLowerCase().endsWith('dat'));
  baramDatFilenames.forEach((fileName) => {
    const handler = new DatHandler(path.join(Configuration.baram.dataDirectory, fileName), true);
    const outputDirectoryName = fileName.replace('.dat', '');
    const outputDirectoryPath = path.join(targetPath, outputDirectoryName);
    console.log(`Extracting files from ${fileName} into ${outputDirectoryPath}`);
    if (!fs.existsSync(outputDirectoryPath)) {
      fs.mkdirSync(outputDirectoryPath);
    }
    handler.unpackFiles(outputDirectoryPath);
  })
}


const outputFilePath = process.argv[2] || Configuration.baram.datDumpDirectory;
extractBaramDats(outputFilePath);
