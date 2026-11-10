import { file1_1 } from "./dir1/file1_1.js";

export function file1() {
  return "file1" + ".." + file1_1();
}
