// A project whose configured integration ships code and config codemods
// written without jscodeshift (plain string edits), one that throws, and an
// optional one.
import * as path from 'node:path';

export default function (dir, {makeApp, writeFile, writeJson}) {
  makeApp(dir, {name: 'intcodemods-app'});
  writeFile(path.join(dir, 'astryx.config.mjs'), "export default {integrations: ['@acme/widgets']};\n");
  const pkg = path.join(dir, 'node_modules/@acme/widgets');
  const w = (rel, text) => writeFile(path.join(pkg, rel), text);
  writeJson(path.join(pkg, 'package.json'), {name: '@acme/widgets', version: '2.0.0'});
  w('astryx.integration.mjs', "export default {codemods: './codemods'};\n");
  w('codemods/0.7.9/rename-widget.mjs', `export default {
  type: 'code',
  title: 'Rename OldWidget to Widget',
  transform: ({source}) => source.includes('OldWidget') ? source.replaceAll('OldWidget', 'Widget') : undefined,
};
`);
  w('codemods/0.7.9/nested/drop-legacy-flag.ts', `export default {
  type: 'code',
  title: 'Drop legacy flag',
  fileExtensions: ['.tsx'],
  transform: (file: {source: string; path: string}) => file.source.replace(/ legacy(?=[ />])/g, ''),
};
`);
  w('codemods/0.7.10/config-theme.mjs', `export default {
  type: 'config',
  title: 'Add widgets theme note',
  transform: ({source}) => source.includes('widgets:') ? undefined : source.replace("integrations: ['@acme/widgets']", "integrations: ['@acme/widgets'], widgets: {}"),
};
`);
  w('codemods/0.7.11/explode.mjs', `export default {
  type: 'code',
  title: 'Explodes on Panel',
  fileExtensions: ['.tsx'],
  transform: ({source, path}) => {
    if (source.includes('Panel')) throw new Error('cannot migrate Panel in ' + path.split('/').pop());
    return undefined;
  },
};
`);
  w('codemods/0.7.11/optional-polish.mjs', `export default {
  type: 'code',
  title: 'Optional polish',
  isOptional: true,
  transform: ({source}) => source + '// polished\\n',
};
`);
  w('codemods/0.7.11/test-helper.test.mjs', 'throw new Error("tests are not codemods");\n');
  writeFile(path.join(dir, 'src/App.tsx'), "import {OldWidget} from '@acme/widgets';\n\nexport const A = () => <OldWidget legacy size=\"m\" />;\n");
  writeFile(path.join(dir, 'src/Panel.tsx'), "export const Panel = () => null;\n");
  writeFile(path.join(dir, 'src/util.js'), "export const name = 'OldWidget';\n");
}
