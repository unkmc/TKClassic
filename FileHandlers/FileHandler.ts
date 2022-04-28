import { Buffer } from 'buffer';
import { DataType } from './DataType';
import fs from 'fs';
import { stringify } from 'querystring';

/**
 * Contains basic file operations like reading/writing bytes
 */
export class FileHandler {

  public constructor(filePath: string);
  public constructor(buffer: Buffer);
  public constructor(...parameters: any[]) {
    this.filePosition = 0;
    if (parameters[0] instanceof Buffer) {
      this.filePath = "UNKNOWN";
      this.buffer = parameters[0];
    } else if (typeof parameters[0] === "string") {
      this.filePath = parameters[0];
      this.buffer = fs.readFileSync(parameters[0]);
    } else {
      throw new Error("Invalid parameters for FileHandler. First parameter must be Buffer or string.");
    }
  }

  protected buffer: Buffer;
  public filePath: string;
  public filePosition: number;

  public read(type: DataType = DataType.uint32_t, littleEndian: boolean = true): number {
    let value: number = 0;
    switch (type) {
      case DataType.uint32_t:
        if (littleEndian) {
          value = this.buffer.readUint32LE(this.filePosition);
        } else {
          value = this.buffer.readUint32BE(this.filePosition);
        }
        this.filePosition += 4;
        break;
      case DataType.uint16_t:
        if (littleEndian) {
          value = this.buffer.readUint16LE(this.filePosition);
        } else {
          value = this.buffer.readUint16BE(this.filePosition);
        }
        this.filePosition += 2;
        break;
      case DataType.int16_t:
        if (littleEndian) {
          value = this.buffer.readInt16LE(this.filePosition);
        } else {
          value = this.buffer.readInt16BE(this.filePosition);
        }
        this.filePosition += 2;
        break;
      case DataType.uint8_t:
        value = this.buffer.readUInt8(this.filePosition);
        this.filePosition += 1;
        break;
      default:
        throw new Error("Unhandled read type: " + type);
    }
    return value;
  }

  public readString() {
    let byte = 1;
    let result = '';
    while (byte != 0) {
      byte = this.read(DataType.uint8_t);
      result += String.fromCharCode(byte);
    }
    this.filePosition--;
    return result.slice(0, result.length - 1);
  }

  public seekTo(filePosition: number) {
    this.filePosition = filePosition;
  }

  // public seekFor(numBytes: number) {
  //   this.filePosition += numBytes;
  // }

  public rewind(byteCount: number) {
    this.filePosition -= byteCount;
  }

  public bytesUntilZero(): number {
    const startPosition = this.filePosition;
    let byte = this.read(DataType.uint8_t);
    let bytesSeen = 1;
    while (byte != 0) {
      byte = this.read(DataType.uint8_t);
      bytesSeen++;
    }
    this.rewind(bytesSeen);
    return bytesSeen - 1;
  }

  public readChunk(size: number): Buffer {
    const result: Buffer = Buffer.allocUnsafe(size);
    this.buffer.copy(result, 0, this.filePosition, this.filePosition + size);
    this.filePosition += size;
    return result;
  }
}