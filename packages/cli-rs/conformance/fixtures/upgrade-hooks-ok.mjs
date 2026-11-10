// An app whose postCodemod hook succeeds.
import * as path from 'node:path';

export default function (dir, {makeApp, writeFile}) {
  makeApp(dir, {name: 'hooks-ok-app'});
  writeFile(
    path.join(dir, 'astryx.config.mjs'),
    `export default {
  hooks: {
    postCodemod: [
      {name: 'touch', buildCommand: ({packageDir, files}) => ({command: 'sh', args: ['-c', 'printf "%s" "$1" > hook-ran.txt', 'x', files.join(',')]})},
    ],
  },
};
`,
  );
  writeFile(path.join(dir, 'src/App.tsx'), "import {XDSSelector} from '@xds/core';\n\nexport const A = () => <XDSSelector items={[]} />;\n");
}
