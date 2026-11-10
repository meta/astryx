// An app with one pristine ShadCN-copied composition and its receipt, with
// Windows line endings in the copied source.
import {createHash} from 'node:crypto';
import * as path from 'node:path';

const sha = text => createHash('sha256').update(text, 'utf8').digest('hex');
const TSX = "export default function Example(): null {\n  return null;\n}\n";

export default function (dir, {makeApp, writeFile}) {
  makeApp(dir, {name: 'registry-one'});
  writeFile(path.join(dir, 'src/components/astryx/examples/ButtonBasic.tsx'), TSX.replace(/\n/g, '\r\n'));
  const value = {
    schemaVersion: 2,
    item: {name: 'example-button-basic', path: 'examples/button/basic', aliases: ['examples/button/old'], kind: 'example'},
    source: {package: '@astryxdesign/cli', version: '0.5.0'},
    files: [{id: 'primary', target: '../ButtonBasic.tsx', registryTarget: 'components/astryx/examples/ButtonBasic.tsx', registryPath: 'registry/example-button-basic/ButtonBasic.tsx', sha256: sha(TSX), content: TSX, variants: []}],
  };
  writeFile(path.join(dir, 'src/components/astryx/examples/.astryx/example-button-basic.json'), `${JSON.stringify(value, null, 2)}\n`);
  writeFile(path.join(dir, 'web/README.md'), 'A nested folder to run from.\n');
}
