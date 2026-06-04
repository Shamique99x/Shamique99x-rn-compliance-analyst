import * as fs from "fs";
import * as path from "path";

export function backupAndWrite(filePath: string, content: string): string {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  // Use a timestamped backup so repeated runs never overwrite the original
  const backupPath = filePath + "." + Date.now() + ".bak";
  if (fs.existsSync(filePath)) {
    fs.copyFileSync(filePath, backupPath);
  }

  const tmp = filePath + ".tmp";
  fs.writeFileSync(tmp, content, "utf-8");
  fs.renameSync(tmp, filePath);

  return backupPath;
}
