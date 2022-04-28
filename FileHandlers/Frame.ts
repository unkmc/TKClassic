import { Stencil } from './Stencil';

export interface Frame {
  top: number;
  left: number;
  bottom: number;
  right: number;
  width: number;
  height: number;
  pixelDataOffset: number;
  stencilDataOffset: number;
  rawPixelData: Buffer;
  rawStencilData: Buffer;
  stencil: Stencil
}