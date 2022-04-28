
export interface EpfLocation {
  epfIndex: number;
  epfBodyOffset: number;
  epfBodyFrameStart: number;
  absoluteBodyIndex: number;
}

export class FrameFinder {
  public static getEpfIndexForBodyIndex(
    frameCountMap: number[],
    numBodyFrames: number,
    absoluteBodyIndex: number,
  ): EpfLocation {
    let totalBodiesSeen = 0;
    let epfIndex = 0;
    let epfBodyOffset = 0;
    console.log(`Finding EPF indices for absoluteBodyIndex: ${absoluteBodyIndex}`);
    for (let i = 0; i < frameCountMap.length; i++) {
      const bodiesInEpf = frameCountMap[i] / numBodyFrames;
      // console.log(`  Bodies in EPF ${i}: frameCountMap[${i}] / numBodyFrames = bodiesInEpf`);
      // console.log(`                    : ${frameCountMap[i]} / ${numBodyFrames} = ${bodiesInEpf}`);
      totalBodiesSeen += bodiesInEpf;
      if (absoluteBodyIndex < totalBodiesSeen) {
        epfIndex = i;
        const bodiesLeftInEpf = totalBodiesSeen - absoluteBodyIndex;
        epfBodyOffset = bodiesInEpf - bodiesLeftInEpf;
        break;
      }
    }

    return {
      epfIndex,
      epfBodyOffset,
      epfBodyFrameStart: epfBodyOffset * numBodyFrames,
      absoluteBodyIndex,
    }
  }
}