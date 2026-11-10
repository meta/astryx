// A project whose configured integration's manifest throws on import.
import * as path from 'node:path';

export default async function (dir, h) {
  await h.makeApp(dir);
  const pkg = path.join(dir, 'node_modules', '@test', 'broken');
  await h.writeJson(path.join(pkg, 'package.json'), {name: '@test/broken', version: '1.2.3'});
  await h.writeFile(path.join(pkg, 'astryx.integration.mjs'), "export default createIntegration({components: './components'});\n");
  await h.writeFile(path.join(pkg, 'components', '.keep'), '');
  await h.writeFile(path.join(dir, 'astryx.config.mjs'), "export default {integrations: ['@test/broken']};\n");
}
