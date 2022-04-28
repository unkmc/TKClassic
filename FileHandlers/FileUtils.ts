import { Configuration } from "../Configuration";
import fs from 'fs';

export class FileUtils {
  public static GetEpfList(isBaram: boolean): string[] {
    const dataDirectory = isBaram
      ? Configuration.baram.dataDirectory
      : Configuration.ntk.dataDirectory;
    const allFiles = fs.readdirSync(dataDirectory);
    return allFiles.filter((fileName) => {
      return fileName.toLowerCase().endsWith(".epf");
    })
  }

  /**
   * https://stackoverflow.com/a/46048129
   * @param fileName 
   * @returns {number}
   */
  public static GetNumericalPart(fileName: string): number {
    return parseInt((/\d+/g.exec(fileName) || "")[0]);
  }

  public static SortByNumericalPart(fileNameA: string, fileNameB: string) {
    const fileNumberA = FileUtils.GetNumericalPart(fileNameA);
    const fileNumberB = FileUtils.GetNumericalPart(fileNameB);
    if (fileNumberA > fileNumberB) return 1;
    if (fileNumberA < fileNumberB) return -1;
    return 0;
  };
}