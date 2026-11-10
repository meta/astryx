// An app whose installed Core carries one doc that loads but fails the
// component-doc check, and one that throws when loaded; both declare
// theming targets.
import * as path from 'node:path';

export default function (dir, {makeApp, writeFile}) {
  makeApp(dir, {name: 'baddoc-app'});
  const core = path.join(dir, 'node_modules/@astryxdesign/core/src');
  writeFile(path.join(core, 'Zany/Zany.doc.mjs'), "export default {type: 'component', name: 'Zany', theming: {targets: [{className: 'astryx-zany', visualProps: ['size']}]}};\n");
  writeFile(path.join(core, 'Quirk/Quirk.doc.mjs'), "throw new Error('boom');\nexport default {type: 'component', name: 'Quirk', theming: {targets: [{className: 'astryx-quirk'}]}};\n");
}
