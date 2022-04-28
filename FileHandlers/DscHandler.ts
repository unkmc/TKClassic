import { DataType } from "./DataType";
import { FileHandler } from "./FileHandler";

export interface DscBlock {
  frameOffset: number;
  unknown: Buffer;
}

export interface DscChunk {
  unknown: Buffer;
  blockCount: number;
  blocks: DscBlock[];
}

export interface DscPart {
  id: number;
  paletteIndex: number;
  frameIndex: number;
  frameCount: number;
  unknown: Buffer;
  chunkCount: number;
  chunks: DscChunk[];
}

export class DscHandler extends FileHandler {
  private static HEADER_SIZE = 0x17;
  public partCount = 0;
  public parts: DscPart[] = [];
  public isBaram: boolean;
  public header: Buffer;

  public constructor(filePath: string, isBaram: boolean);
  public constructor(buffer: Buffer, isBaram: boolean);
  public constructor(...parameters: any[]) {
    super(parameters[0]);
    this.isBaram = parameters[1];
    this.header = this.readChunk(DscHandler.HEADER_SIZE);
    this.partCount = this.read();

    for (let i = 0; i < this.partCount; i++) {
      const id = this.read();
      const paletteIndex = this.read();
      const frameIndex = this.read();
      const frameCount = this.read();
      const unknownPartData = this.readChunk(14);
      const chunkCount = this.read();
      const chunks: DscChunk[] = [];
      for (let ii = 0; ii < chunkCount; ii++) {
        const unknownChunkData = this.readChunk(8);
        const blockCount = this.read();
        const blocks: DscBlock[] = [];
        for (let iii = 0; iii < blockCount; iii++) {
          const frameOffset = this.read(DataType.uint16_t, false);
          const unknownBlockData = this.isBaram
            ? this.readChunk(10)
            : this.readChunk(7);
          blocks.push({
            frameOffset,
            unknown: unknownBlockData
          });
        }
        chunks.push({
          unknown: unknownChunkData,
          blockCount,
          blocks,
        })
      }
      this.parts.push({
        id,
        paletteIndex,
        frameIndex,
        frameCount,
        unknown: unknownPartData,
        chunkCount,
        chunks,
      })
    }
  }

  public writeToFile(filePath: string) {
    const fileBuffer: Buffer = Buffer.alloc(
      DscHandler.HEADER_SIZE
      + 4 // partCount
      + this.partCount * (
        4 //id
        + 4
      )
    );
  }
}