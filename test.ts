import { Configuration } from "./Configuration";
import { DatHandler } from "./FileHandlers/DatHandler";
import fs from 'fs';

// const charDatHandler: DatHandler = new DatHandler(`${Configuration.ntk.dataDirectory}\\char.dat`, false);
// if (!fs.existsSync(Configuration.ntk.datDumpDirectory)) fs.mkdirSync(Configuration.ntk.datDumpDirectory);
// charDatHandler.writeToFile(`${Configuration.ntk.datDumpDirectory}\\char.dat.wrote`);
// const charDatSubdirectory = `${Configuration.ntk.datDumpDirectory}\\char.dat`;
// if (!fs.existsSync(charDatSubdirectory)) fs.mkdirSync(charDatSubdirectory);
// charDatHandler.unpackFiles(charDatSubdirectory);



const body0DatHandler: DatHandler = new DatHandler(`${Configuration.ntk.dataDirectory}\\Body0.dat`, false);
if (!fs.existsSync(Configuration.ntk.datDumpDirectory)) fs.mkdirSync(Configuration.ntk.datDumpDirectory);
body0DatHandler.writeToFile(`${Configuration.ntk.datDumpDirectory}\\Body0.dat.wrote`);
const body0DatSubdirectory = `${Configuration.ntk.datDumpDirectory}\\Body0.dat`;
if (!fs.existsSync(body0DatSubdirectory)) fs.mkdirSync(body0DatSubdirectory);
body0DatHandler.unpackFiles(body0DatSubdirectory);