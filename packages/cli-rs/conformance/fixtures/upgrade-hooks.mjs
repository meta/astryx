// An app with postCodemod hooks in astryx.config and legacy source.
import * as path from 'node:path';

export default function (dir, {makeApp, writeFile}) {
  makeApp(dir, {name: 'hooks-app'});
  writeFile(
    path.join(dir, 'astryx.config.mjs'),
    `export default {
  hooks: {
    postCodemod: [
      {
        name: 'record-files',
        buildCommand: ({files}) => {
          console.log('building for', files.length, 'files');
          return {command: 'sh', args: ['-c', 'echo "$0" > hook-ran.txt', files.join(',')]};
        },
      },
      {buildCommand: () => null},
      {name: 'fails', buildCommand: () => ({command: 'sh', args: ['-c', 'echo boom >&2; exit 3']})},
    ],
  },
};
`,
  );
  writeFile(path.join(dir, 'src/App.tsx'), "import {XDSSelector} from '@xds/core';\n\nexport const A = () => <XDSSelector items={[]} />;\n");
}
