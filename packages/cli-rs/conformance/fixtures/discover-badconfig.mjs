// A project whose astryx.config throws on import.
import * as path from 'node:path';

export default async function (dir, h) {
  await h.makeApp(dir);
  await h.writeFile(path.join(dir, 'astryx.config.mjs'), "throw new Error('config exploded');\n");
}
