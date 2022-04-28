import { DataType } from "./DataType";
import { FileHandler } from "./FileHandler";
import { Frame } from './Frame';
import { Stencil } from "./Stencil";
import fs from 'fs';



export class EpfHandler extends FileHandler {
  public static HEADER_SIZE = 0xC;
  public static FRAME_SIZE = 0x10;

  public bitBlt: number;
  public frameCount: number;
  public height: number;
  public pixelDataLength: number;
  public width: number;
  public frames: Frame[] = [];

  public constructor(filePath: string);
  public constructor(buffer: Buffer);
  constructor(...parameters: any[]) {
    super(parameters[0]);
    this.frameCount = this.read(DataType.int16_t);
    this.width = this.read(DataType.int16_t);
    this.height = this.read(DataType.int16_t);
    this.bitBlt = this.read(DataType.int16_t);
    this.pixelDataLength = this.read(DataType.uint32_t);
    // console.log(`Read EPF metadata: ${JSON.stringify({
    //   frameCount: this.frameCount,
    //   width: this.width,
    //   height: this.height,
    //   bitBlt: this.bitBlt,
    //   pixelDataLength: this.pixelDataLength,
    // }, null, 2)}`);
    for (let i = 0; i < this.frameCount; i++) {
      // for (let i = 0; i < 2; i++) {
      this.getFrame(i);
    }
  }

  public getFrame(index: number): Frame {
    if (this.frames[index]) {
      return this.frames[index] as Frame;
    }
    const frameDataOffset = EpfHandler.HEADER_SIZE + this.pixelDataLength + (index * EpfHandler.FRAME_SIZE);
    // console.log(`Gathering metadata for frame at index ${index}: `);
    // console.log(`  Seeking to: ${frameDataOffset}`);
    this.seekTo(frameDataOffset);
    // Seek to frame data & read it
    const top = this.read(DataType.int16_t);
    const left = this.read(DataType.int16_t);
    const bottom = this.read(DataType.int16_t);
    const right = this.read(DataType.int16_t);
    const width = (right - left);
    const height = (bottom - top);
    const pixelDataOffset = this.read(DataType.uint32_t) + EpfHandler.HEADER_SIZE;
    const stencilDataOffset = this.read(DataType.uint32_t) + EpfHandler.HEADER_SIZE;
    // if (index == 0) {
    //   console.log(`First frame reports pixel data offset: ${pixelDataOffset}`);
    // }
    // if (index <= 1) {
    //   console.log(`Read frame metadata @ ${frameDataOffset}: ${JSON.stringify({
    //     top,
    //     left,
    //     bottom,
    //     right,
    //     // width,
    //     // height,
    //     pixelDataOffset,
    //     stencilDataOffset,
    //   }, null, 2)}`);
    // }
    this.seekTo(pixelDataOffset);
    const rawPixelData = this.readChunk(width * height);

    this.seekTo(stencilDataOffset);
    const stencil: Stencil = new Stencil(this, stencilDataOffset, width, height);
    const frame: Frame = {
      top, left, bottom, right, width, height,
      pixelDataOffset, stencilDataOffset,
      rawPixelData,
      rawStencilData: stencil.rawData,
      stencil
    };
    this.frames[index] = frame;
    return frame;
  }

  public getActualPixelDataLength(): number {
    let actualPixelDataLength = 0;
    for (let i = 0; i < this.frameCount; i++) {
      const frame: Frame = this.frames[i] as Frame;
      actualPixelDataLength += frame.rawPixelData.length;
      actualPixelDataLength += frame.rawStencilData.length;
    }
    return actualPixelDataLength;
  }

  public getByteSize(): number {
    let byteCount = 2; // frameCount
    byteCount += 2; // width
    byteCount += 2; // height
    byteCount += 2; // bitBlt
    byteCount += 4; // pixelDataLength
    byteCount += this.getActualPixelDataLength();
    for (let i = 0; i < this.frameCount; i++) {
      byteCount += 4 * 2;// top, left, bottom, right
      byteCount += 2 * 4;// pixelDataOffset, stencilDataOffset
    }
    return byteCount;
  }

  public getByteBuffer(): Buffer {
    const byteSize = this.getByteSize();
    // console.log(`EPF handler reports byte size of ${byteSize}`);
    // console.log(`Original           byte size was ${this.buffer.length}`);
    const buffer = Buffer.alloc(byteSize, 0);
    let headerPosition = 0;
    const actualPixelDataLength = this.getActualPixelDataLength();
    // console.log(`Calculated data length is      : ${actualPixelDataLength}`);
    // console.log(`Originally read data length was: ${this.pixelDataLength}`);
    buffer.writeInt16LE(this.frameCount, headerPosition); headerPosition += 2;
    buffer.writeInt16LE(this.width, headerPosition); headerPosition += 2;
    buffer.writeInt16LE(this.height, headerPosition); headerPosition += 2;
    buffer.writeInt16LE(this.bitBlt, headerPosition); headerPosition += 2;
    buffer.writeUInt32LE(actualPixelDataLength, headerPosition); headerPosition += 4;
    // console.log(`After writing header, write position is now ${headerPosition}`);
    let tableOfContentsPosition = EpfHandler.HEADER_SIZE + actualPixelDataLength;
    // console.log(`Original table of contents position was  ${EpfHandler.HEADER_SIZE + this.pixelDataLength}`);
    // console.log(`Calculated table of contents position is ${tableOfContentsPosition}`);
    let pixelDataPosition = headerPosition;
    for (let i = 0; i < this.frameCount; i++) {
      const frame: Frame = this.frames[i] as Frame;
      // console.log(`Frame ${i} meta will be written @ ${tableOfContentsPosition}`);
      const tocSave = tableOfContentsPosition;
      buffer.writeInt16LE(frame.top, tableOfContentsPosition); tableOfContentsPosition += 2;
      buffer.writeInt16LE(frame.left, tableOfContentsPosition); tableOfContentsPosition += 2;
      buffer.writeInt16LE(frame.bottom, tableOfContentsPosition); tableOfContentsPosition += 2;
      buffer.writeInt16LE(frame.right, tableOfContentsPosition); tableOfContentsPosition += 2;
      const pixelDataOffset = pixelDataPosition;
      // if (i == 0) console.log(`writing first frame pixel data position of ${pixelDataPosition} at ${tableOfContentsPosition}`);
      buffer.writeUInt32LE(pixelDataPosition - EpfHandler.HEADER_SIZE, tableOfContentsPosition); tableOfContentsPosition += 4;
      frame.rawPixelData.copy(buffer, pixelDataPosition); pixelDataPosition += frame.rawPixelData.length;
      const stencilDataOffset = pixelDataPosition;
      buffer.writeUInt32LE(pixelDataPosition - EpfHandler.HEADER_SIZE, tableOfContentsPosition); tableOfContentsPosition += 4;
      frame.rawStencilData.copy(buffer, pixelDataPosition); pixelDataPosition += frame.rawStencilData.length;
      // if (i <= 1) {
      //   console.log(`Wrote frame metadata @ ${tocSave}: ${JSON.stringify({
      //     top: frame.top,
      //     left: frame.left,
      //     bottom: frame.bottom,
      //     right: frame.right,
      //     // width,
      //     // height,
      //     pixelDataOffset,
      //     stencilDataOffset,
      //   }, null, 2)}`);
      // }
    }
    return buffer;
  }

  public writeToFile(filePath: string) {
    console.log(`EPF file writing to: ${filePath}.......`);
    const buffer = this.getByteBuffer();
    fs.writeFileSync(filePath, buffer);
    console.log(`EPF file written to: ${filePath}`);
  }
}