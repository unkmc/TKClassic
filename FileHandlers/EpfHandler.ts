import { DataType } from "./DataType";
import { DatHandler } from "./DatHandler";
import { FileHandler } from "./FileHandler";
import { Frame } from './Frame';
import { Stencil } from "./Stencil";



export class EpfHandler extends FileHandler {
  public static HEADER_SIZE = 0xC;
  public static FRAME_SIZE = 0x10;

  public static CreateFromDats(prefix: string, isBaram: boolean): EpfHandler[] {
    const result: EpfHandler[] = [];
    const datHandlers: DatHandler[] = DatHandler.CreateFromPrefix(prefix, isBaram);
    for (let i = 0; i < datHandlers.length; i++) {
      const buffer: Buffer = datHandlers[i].datFileMetaData.get(`${prefix}${i}.epf`).buffer;
      result.push(new EpfHandler(buffer));
    }

    return result;
  }


  public bitBlt: number;
  public frameCount: number;
  public height: number;
  public pixelDataLength: number;
  public width: number;
  public dataSize: number;
  public constructor(filePath: string);
  public constructor(buffer: Buffer);
  constructor(...parameters: any[]) {
    super(parameters[0]);
    this.frameCount = this.read(DataType.int16_t);
    this.width = this.read(DataType.int16_t);
    this.height = this.read(DataType.int16_t);
    this.bitBlt = this.read(DataType.int16_t);
    this.pixelDataLength = this.read(DataType.uint16_t);
    this.dataSize = 0;
  }

  public getFrame(index: number): Frame {
    this.seekTo(EpfHandler.HEADER_SIZE + this.pixelDataLength + (index * EpfHandler.FRAME_SIZE));
    // Seek to frame data & read it
    const top = this.read(DataType.uint16_t, false);
    const left = this.read(DataType.uint16_t, false);
    const bottom = this.read(DataType.uint16_t, false);
    const right = this.read(DataType.uint16_t, false);
    const width = (right - left);
    const height = (bottom - top);
    const pixelDataOffset = this.read();
    const stencilDataOffset = this.read();

    // Seek to Pixel & Stencil Data
    this.seekTo(EpfHandler.HEADER_SIZE + pixelDataOffset);
    const rawPixelData = this.readChunk(width * height);
    this.dataSize += rawPixelData.length;

    // this.seekTo(EpfHandler.HEADER_SIZE + stencilDataOffset);
    const stencil: Stencil = new Stencil(this, stencilDataOffset, width, height);
    this.dataSize += stencil.rawData.length;
    const frame: Frame = {
      top, left, bottom, right, width, height,
      pixelDataOffset, stencilDataOffset,
      rawPixelData,
      rawStencilData: stencil.rawData,
      stencil
    };
    //TODO: cache?
    return frame;
  }
}