export interface SimpleSwap {
  name:string;
  validSwapIndexRange: number[];
  framesPer: {
    baram: number;
    ntk: number;
  };
}

export const Configuration = {
  ntk: {
    dataDirectory: "C:\\Program Files (x86)\\KRU\\NexusTK\\Data",
    datDumpDirectory: "E:\\Reversing\\NTK\\dat\\ntk",
  },
  baram: {
    dataDirectory: "C:\\Nexon\\Kingdom of the Winds\\Data",
    datDumpDirectory: "E:\\Reversing\\NTK\\dat\\baram",
  },
  body: {
    // Classic sprites only available for some armors
    validSwapIndexRange: [2, 126],
    framesPer: { baram: 103, ntk: 80, },
    baramToNtkFrameOffsetMap: [
      // There are more frames in baram than NTK
      // So, we need to map baram frames onto NTK frames
      // Thankfully, they *seem* to be the same
      // TODO: learn DSC format, can we force NTK to play the extra baram frames?
      [0, 0],
      [12, 1],
      [14, 2],
      [3, 3],
      [15, 4],
      [17, 5],
      [6, 6],
      [18, 7],
      [20, 8],
      [9, 9],
      [21, 10],
      [23, 11],
      [24, 12],
      [36, 13],
      [38, 14],
      [27, 15],
      [15, 16],
      [17, 17],
      [31, 18],
      [42, 19],
      [44, 20],
      [46, 21],
      [45, 22],
      [47, 23],
      [48, 24],
      [49, 25],
      [50, 26],
      [51, 27],
      [52, 28],
      [53, 29],
      [54, 30],
      [55, 31],
      [56, 32],
      [57, 33],
      [58, 34],
      [59, 35],
      [60, 36],
      [61, 37],
      [62, 38],
      [63, 39],
      [64, 40],
      [65, 41],
      [66, 42],
      [67, 43],
      [68, 44],
      [69, 45],
      [70, 46],
      [71, 47],
      [72, 48],
      [73, 49],
      [74, 50],
      [75, 51],
      [76, 52],
      [77, 53],
      [78, 54],
      [79, 55],
      [80, 56],
      [81, 57],
      [82, 58],
      [83, 59],
      [84, 60],
      [85, 61],
      [86, 62],
      [87, 63],
      [88, 64],
      [89, 65],
      [90, 66],
      [91, 67],
      [92, 68],
      [93, 69],
      // [, 70], I have no idea what this is, a little black circle ???
      [94, 71],
      [95, 72],
      [96, 73],
      [97, 74],
      [98, 75],
      [99, 76],
      [100, 77],
      [101, 78],
      [102, 79],
    ]
  },
  sword: {
    name:'sword',
    validSwapIndexRange: [0, 147],
    framesPer: { baram: 19, ntk: 19, },
  } as SimpleSwap,
  spear: {
    name:'spear',
    validSwapIndexRange: [0, 50],
    framesPer: { baram: 19, ntk: 19, },
  } as SimpleSwap,
  shield: {
    name:'shield',
    validSwapIndexRange: [0, 25],
    framesPer: { baram: 19, ntk: 19, },
  },
  fan: {
    name:'fan',
    validSwapIndexRange: [0, 5],
    framesPer: { baram: 19, ntk: 19, },
  } as SimpleSwap,
}
