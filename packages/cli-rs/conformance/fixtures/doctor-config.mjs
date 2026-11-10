// Doctor: projects whose astryx.config is broken in different ways, one per
// subfolder (`cwd` picks one).
import * as path from 'node:path';

export default async function (dir, h) {
  const app = async (name, files) => {
    const d = path.join(dir, name);
    await h.makeApp(d, {name});
    for (const [rel, text] of Object.entries(files)) await h.writeFile(path.join(d, rel), text);
  };
  await app('throws', {'astryx.config.mjs': "throw new Error('config exploded');\n"});
  await app('multi', {'astryx.config.mjs': 'export default {};\n', 'astryx.config.js': 'export default {};\n'});
  await app('number', {'astryx.config.mjs': 'export default 5;\n'});
  await app('schema', {'astryx.config.mjs': "export default {integrations: 'not-a-list'};\n"});
  await app('missing', {'astryx.config.mjs': "export default {integrations: ['@nope/missing']};\n"});
  await app('ok', {'astryx.config.mjs': 'export default {integrations: []};\n'});
}
