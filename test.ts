import { Configuration } from "./Configuration";
import { DatHandler } from "./FileHandlers/DatHandler";
import fs from 'fs';
import { EpfHandler } from "./FileHandlers/EpfHandler";
import path from 'path';

// unpackDat(Configuration.ntk.dataDirectory, 'char.dat', false, Configuration.ntk.datDumpDirectory);
unpackDat(Configuration.baram.dataDirectory, 'char.dat', true, Configuration.baram.datDumpDirectory);

unpackDat(Configuration.ntk.dataDirectory, 'body0.dat', false, Configuration.ntk.datDumpDirectory);
// unpackDat(Configuration.baram.dataDirectory, 'C_Body0.dat', true, Configuration.baram.datDumpDirectory);

console.log(`  Instantiating EPF handler...`);
const body0EpfHandler:EpfHandler = new EpfHandler(path.join(Configuration.ntk.datDumpDirectory, 'body0.dat', 'Body0.epf'));
console.log(`  Writing EPF to file...`);
body0EpfHandler.writeToFile(path.join(Configuration.ntk.datDumpDirectory, 'body0.dat', 'Body0.epf.EpfHandler'));


function unpackDat(dataDirectory: string, fileName: string, isBaram: boolean, dumpDirectory: string) {
  console.log(`  Instantiating DatHandler...`);
  const datHandler: DatHandler = new DatHandler(path.join(dataDirectory, fileName), isBaram);
  fs.mkdirSync(dumpDirectory, { recursive: true });
  console.log(`  Writing dat file...`);
  datHandler.writeToFile(path.join(dumpDirectory, `${fileName}.clean`));
  const subdirectory = path.join(dumpDirectory, fileName);
  console.log(`  Unpacking dat file...`);
  if (!fs.existsSync(subdirectory)) fs.mkdirSync(subdirectory);
  datHandler.unpackFiles(subdirectory);
}
