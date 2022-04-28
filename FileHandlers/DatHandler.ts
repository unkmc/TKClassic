import { Configuration } from "../Configuration";
import { DataType } from "./DataType";
import { FileHandler } from "./FileHandler";
import fs from 'fs';
import { FileUtils } from "./FileUtils";
import { EpfHandler } from "./EpfHandler";

export interface DatFileMetaData {
  dataBeginLocation: number;
  fileName: string;
  fileNamePad: Buffer;
  fileSize: number;
  buffer: Buffer;
  fileHandler?: any;
}

export class DatHandler extends FileHandler {
  public static CreateFromPrefix(prefix: string, isBaram: boolean): DatHandler[] {
    const dataDirectory = isBaram ? Configuration.baram.dataDirectory : Configuration.ntk.dataDirectory;
    const allFiles = fs.readdirSync(dataDirectory);
    const datFiles = allFiles
      .filter((fileName) => fileName.toLowerCase().endsWith(".dat"))
      .sort(FileUtils.SortByNumericalPart);
    const datPaths = datFiles.map((fileName) => `${dataDirectory}\\${fileName}`);
    return datPaths.map((datPath) => {
      return new DatHandler(datPath, isBaram);
    })
  }


  public fileCount: number;
  public isBaram: boolean;
  public datFileMetaData: Map<string, DatFileMetaData>;
  private maxFileNameLength: number;

  private readDatFileMetaData() {
    const dataBeginLocation: number = this.read(DataType.uint32_t);
    const fileName = this.readString();
    console.log(`Found file in DAT: ${fileName}`);
    const remainingZeros = this.maxFileNameLength - fileName.length;
    const fileNamePad = this.readChunk(remainingZeros);
    const endOfCurrentMetadata = this.filePosition;
    const nextDataBeginLocation = this.read(DataType.uint32_t);
    const fileSize = nextDataBeginLocation - dataBeginLocation;
    this.seekTo(dataBeginLocation);
    const buffer = fileName === ""
      ? Buffer.alloc(0)
      : this.readChunk(fileSize);
    console.log(`  File details: ${JSON.stringify({
      dataBeginLocation,
      fileName,
      fileNamePad,
      fileSize,
    }, null, 2)}`);

    const metaData:DatFileMetaData = {
      dataBeginLocation,
      fileName,
      fileNamePad,
      fileSize,
      buffer,
    };
    if(fileName.toLowerCase(). endsWith('.epf')){
      metaData.fileHandler = new EpfHandler(buffer);
    }
    this.datFileMetaData.set(fileName, metaData);
    this.seekTo(endOfCurrentMetadata);
  }


  constructor(filePath: string, isBaram: boolean) {
    super(filePath);
    this.isBaram = isBaram;
    this.maxFileNameLength = isBaram ? 32 : 13;
    this.fileCount = this.read(DataType.uint32_t);
    console.log(`File count should be: ${this.fileCount}`);
    this.datFileMetaData = new Map();
    for (let index = 0; index < this.fileCount; index++) {
      this.readDatFileMetaData();
    };
    console.log(`Total Files found: ${this.datFileMetaData.size}`);
  }

  public getByteSize(): number {
    let byteCount = 4; // fileCount
    for (let metaData of this.datFileMetaData) {
      byteCount += 4; // dataBeginLocation
      byteCount += this.maxFileNameLength;
      if (metaData[1].fileName === "") continue; // The "null entry" needs no data written.
      byteCount += metaData[1].fileSize;
    }
    return byteCount;
  }

  public writeToFile(filePath: string) {
    const buffer = Buffer.alloc(this.getByteSize(), 0);
    let bufferPosition = 0;
    buffer.writeUint32LE(this.fileCount, bufferPosition); bufferPosition += 4
    for (let metaData of this.datFileMetaData) {
      buffer.writeUint32LE(metaData[1].dataBeginLocation, bufferPosition); bufferPosition += 4;
      // console.log(`bufferPosition: ${bufferPosition}`);
      // console.log(`Writing data for file: ${metaData[1].fileName}`);
      buffer.write(metaData[1].fileName, bufferPosition); bufferPosition += metaData[1].fileName.length;
      metaData[1].fileNamePad.copy(buffer, bufferPosition); bufferPosition += metaData[1].fileNamePad.length;

      // console.log(`Copying file data w/ options: ${JSON.stringify({
      //   "metaData[1].buffer.length": metaData[1].buffer.length,
      //   targetStart: metaData[1].dataBeginLocation,
      //   sourceStart: metaData[1].dataBeginLocation,
      //   sourceEnd: metaData[1].dataBeginLocation + metaData[1].fileSize
      // }, null, 2)}`);
      if (metaData[1].fileName === "") continue; // The "null entry" needs no data written.
      metaData[1].buffer.copy(
        buffer,
        metaData[1].dataBeginLocation,
        // metaData[1].dataBeginLocation,
        // metaData[1].dataBeginLocation + metaData[1].fileSize,
      );
    }
    fs.writeFileSync(filePath, buffer);
  }

  public unpackFiles(filePath: string) {
    for (let metaData of this.datFileMetaData) {
      if (metaData[1].fileName === "") continue; // The "null entry" needs no data written.
      fs.writeFileSync(`${filePath}\\${metaData[0]}`, metaData[1].buffer);
    }
  }
}