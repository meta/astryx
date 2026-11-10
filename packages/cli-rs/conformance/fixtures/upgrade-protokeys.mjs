// Source whose names match Object.prototype members (toString, constructor):
// the JS codemods look names up in plain objects, so these reach them.
import * as path from 'node:path';

export default function (dir, {makeApp, writeFile}) {
  makeApp(dir, {name: 'protokeys-app'});
  const w = (rel, text) => writeFile(path.join(dir, rel), text);
  w('src/forged.test.ts', `export const forged = {
  toString: () => 'forged',
  valueOf: () => 1,
};
export const ok = {label: 'x'};
`);
  w('src/imports.tsx', `import {constructor, toString as ts2} from '@xds/core';
export const A = () => <div>{String(constructor)}{ts2}</div>;
`);
  w('src/stack.jsx', `import {XDSStack, XDSToolbar} from '@xds/core';
export const B = () => <XDSStack gap="toString"><XDSToolbar density="constructor" /></XDSStack>;
`);
  w('src/theme.css', `.astryx-button.constructor { color: red; }
.astryx-constructor.primary { color: red; }
.astryx-toString { color: red; }
`);
}
