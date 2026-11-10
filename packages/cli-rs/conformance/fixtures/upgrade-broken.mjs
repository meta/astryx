// An app with a source file that does not parse and a generated file.
import * as path from 'node:path';

export default function (dir, {makeApp, writeFile}) {
  makeApp(dir, {name: 'broken-app'});
  writeFile(path.join(dir, 'src/broken.tsx'), "import {XDSDialog} from '@xds/core';\nexport const x = <XDSDialog isShown={true} >;\n");
  writeFile(path.join(dir, 'src/gen/panel.tsx'), "// @generated\n// Command: pnpm run gen:panel\nimport {XDSSelector} from '@xds/core';\nexport const P = () => <XDSSelector items={[]} />;\n");
  writeFile(path.join(dir, 'src/ok.tsx'), "import {XDSSelector} from '@xds/core';\nexport const Q = () => <XDSSelector items={[]} />;\n");
}
