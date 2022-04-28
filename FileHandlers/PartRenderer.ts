import { DscHandler, DscPart } from './DscHandler'
import { EpfHandler } from './EpfHandler';
import { FileUtils } from './FileUtils';
import { Frame } from './Frame';

export class PartRenderer {
  public epfHandlers: EpfHandler[];
  public dscHandler: DscHandler
  public renderedParts = new Map();
  constructor(
    public partName: string,
    public dscFileHandler: DscHandler,
    public isBaram: boolean,
  ) {
    this.epfHandlers = EpfHandler.CreateFromDats(partName, isBaram);
  }

  public getFramesForPart(partIndex: number) {
    const part: DscPart = this.dscFileHandler.parts[partIndex];
    const frameCount = part.frameCount;
    const frames = [];
    for (let i = 0; i < frameCount; i++) {
      frames[i] = this.renderFrame(partIndex, part.frameIndex, i, part.paletteIndex)

    }
  }

  public renderFrame(
    partIndex: number,
    frameIndex: number,
    frameOffset: number,
    paletteIndex: number,
  ) {
    const frameKey = frameIndex + frameOffset;
    if (this.renderedParts.has(frameKey)) {
      return this.renderedParts.get(frameKey);
    }
    const frame = this.getFrameData(frameIndex, frameOffset);
    
  }

  public getFrameData(
    frameIndex: number,
    frameOffset: number,
  ): Frame {
    const frameKey = frameIndex + frameOffset;
    let epfIndex = 0;
    let frameCount = 0;

    for (let i = 0; i < this.epfHandlers.length; i++) {

      if (frameKey < (frameCount + this.epfHandlers[i].frameCount)) {
        epfIndex = i;
        break;
      }
      frameCount += this.epfHandlers[i].frameCount;

      return this.epfHandlers[epfIndex].getFrame(frameKey - frameCount);
    }
  }
}