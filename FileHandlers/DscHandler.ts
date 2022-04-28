import { DataType } from "./DataType";
import { FileHandler } from "./FileHandler";


export class DscHandler extends FileHandler {
  public constructor(filePath: string, isBaram: boolean);
  public constructor(buffer: Buffer, isBaram: boolean);
  public constructor(...parameters: any[]) {
    super(parameters[0]);
    this.isBaram = parameters[1];
  }

  public isBaram: boolean;
}