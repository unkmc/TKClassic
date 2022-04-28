import { Configuration } from "./Configuration";
import { DatHandler } from "./FileHandlers/DatHandler";
import fs from 'fs';

const asdf: DatHandler = new DatHandler(`${Configuration.ntk.dataDirectory}\\char.dat`, false);


if (!fs.existsSync(Configuration.ntk.datDumpDirectory)) {
  fs.mkdirSync(Configuration.ntk.datDumpDirectory);
}
asdf.writeToFile(`${Configuration.ntk.datDumpDirectory}\\char.dat.wrote`);

const charDatSubdirectory = `${Configuration.ntk.datDumpDirectory}\\char.dat`;
if (!fs.existsSync(charDatSubdirectory)) {
  fs.mkdirSync(charDatSubdirectory);
}
asdf.unpackFiles(charDatSubdirectory);