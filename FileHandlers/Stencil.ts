import { DataType } from "./DataType";
import { EpfHandler } from "./EpfHandler";

export class Stencil {
  public static MASK = 0x80;
  public rows: boolean[][];
  public rawData: Buffer;
  constructor(epfHandler: EpfHandler, stencilDataOffset: number, width: number, height: number) {
    epfHandler.seekTo(EpfHandler.HEADER_SIZE + stencilDataOffset);

    // Rows are boolean arrays (true/false) representing whether or not to draw an individual pixel of *that* row.
    this.rows = [];
    const collectedRawData: number[] = [];
    for (let index = 0; index < height; index++) {
      const bytes: number[] = [];

      while (true) {
        const stencilValue = epfHandler.read(DataType.uint8_t);
        collectedRawData.push(stencilValue);
        if (stencilValue == 0) break;
        bytes.push(stencilValue);
      }

      const row: boolean[] = Array(width).fill(false);
      if (bytes.length > 0) {
        let rowOffset = 0;
        for (let j = 0; j < bytes.length; j++) {
          let shouldDraw = bytes[j] > Stencil.MASK;
          const stencilValue = shouldDraw
            ? bytes[j] ^ Stencil.MASK
            : bytes[j];
          for (let k = 0; k < stencilValue; k++) {
            row[rowOffset + k] = shouldDraw;
          }
          rowOffset += stencilValue;
        }
      }
      this.rows.push(row);
    }
    this.rawData = Buffer.from(collectedRawData);
  }
}