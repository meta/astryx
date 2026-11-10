// A project that configures @acme/kit, plus a broken integration package.
import * as path from 'node:path';

export default function (dir, {makeIntegration, writeFile, writeJson}) {
  makeIntegration(dir);
  writeFile(path.join(dir, 'astryx.config.mjs'), "export default {integrations: ['@acme/kit', '@acme/bad']};\n");
  const bad = path.join(dir, 'node_modules/@acme/bad');
  writeJson(path.join(bad, 'package.json'), {name: '@acme/bad', version: '1.0.0'});
  writeFile(path.join(bad, 'astryx.integration.mjs'), "export default {components: './missing', codemods: './codemods'};\n");
  writeFile(path.join(bad, 'codemods/0.7.10/rename-thing.mjs'), "export default {type: 'code', title: 'Rename thing', transform: () => undefined};\n");
}
