// A project that declares Core without installing it, with one ShadCN receipt.
import * as path from 'node:path';

export default function (dir, {writeFile}) {
  writeFile(path.join(dir, 'package.json'), `${JSON.stringify({name: 'registry-nocore', version: '1.0.0', private: true, dependencies: {'@astryxdesign/core': '0.5.0'}}, null, 2)}\n`);
  writeFile(path.join(dir, 'src/components/astryx/examples/.astryx/example-x.json'), '{}\n');
}
