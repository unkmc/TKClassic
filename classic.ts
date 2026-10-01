import { handle as body } from "./Body";
import { handle as weapon } from "./Weapon";
import { handle as riding } from "./Riding";
import { handle as monster } from "./Monster";
import { handle as tile } from "./Tile";
import { Configuration } from "./Configuration";
import fs from 'fs';

for (const dataDirectory of [Configuration.baram.dataDirectory, Configuration.ntk.dataDirectory]) {
  if (!fs.existsSync(dataDirectory) || !fs.statSync(dataDirectory).isDirectory()) {
    throw new Error(`Game data directory not found: ${dataDirectory}`);
  }
}

const releaseDirectory = Configuration.releaseDirectory;
if (fs.existsSync(releaseDirectory)) {
  if (fs.lstatSync(releaseDirectory).isSymbolicLink()) {
    throw new Error(`Refusing to clear symlinked Release directory: ${releaseDirectory}`);
  }
  fs.rmSync(releaseDirectory, { recursive: true });
}
fs.mkdirSync(releaseDirectory);

body();
weapon();
monster();
riding();
tile();
