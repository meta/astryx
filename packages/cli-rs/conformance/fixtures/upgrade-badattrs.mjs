// An app whose .gitattributes cannot be parsed.
import * as path from 'node:path';

export default function (dir, {makeApp, writeFile}) {
  makeApp(dir, {name: 'badattrs-app'});
  writeFile(path.join(dir, '.gitattributes'), '"src/unterminated linguist-generated\n');
  writeFile(path.join(dir, 'src/App.tsx'), "import {XDSSelector} from '@xds/core';\nexport const A = () => <XDSSelector items={[]} />;\n");
}
