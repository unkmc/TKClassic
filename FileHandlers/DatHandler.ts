import { DataType } from "./DataType";
import { FileHandler } from "./FileHandler";

export class DatFileMetaData {
  public fileName: string = "";
  public fileSize: number = 0;
  public buffer: Buffer = Buffer.allocUnsafe(0);
}

export class DatHandler extends FileHandler {
  public fileCount: number;
  public isBaram: boolean;
  public datFileMetaData: Map<string, DatFileMetaData>;
  private maxFileNameLength: number;

  private readDatFileMetaData() {
    const dataBeginLocation: number = this.read(DataType.uint32_t);
    const fileName = this.readString();
    const remainingZeros = this.maxFileNameLength - fileName.length;
    this.seekFor(remainingZeros);
    const endOfCurrentMetadata = this.filePosition;
    const nextDataBeginLocation = this.read(DataType.uint32_t);
    const fileSize = nextDataBeginLocation - dataBeginLocation;
    const buffer = this.readChunk(fileSize);
    this.datFileMetaData
      .set(fileName,
        {
          fileName,
          fileSize,
          buffer,
        });
    this.seekTo(endOfCurrentMetadata);
  }


  constructor(filePath: string, isBaram: boolean) {
    super(filePath);
    this.isBaram = isBaram;
    this.maxFileNameLength = isBaram ? 32 : 13;
    this.fileCount = this.read(DataType.uint32_t) - 1;
    this.datFileMetaData = new Map();
    for (let index = 0; index < this.fileCount; index++) {
      this.readDatFileMetaData();
    };
  }
}