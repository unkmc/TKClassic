import { DatFileMetaData, DatHandler } from "./DatHandler";

export enum DataType {
  uint8_t = 1,
  uint16_t = 2,
  int16_t = 3,
  uint32_t = 4,
  string = 5,
}

export interface DatHandlerEntry {
  fileName: string,
  datHandler: DatHandler,
}

export interface DatMetaEntry {
  fileName: string,
  metaData: DatFileMetaData,
}
