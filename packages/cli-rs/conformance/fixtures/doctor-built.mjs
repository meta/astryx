// Doctor --built: build output and source in several shapes.
import * as path from 'node:path';

export default async function (dir, h) {
  await h.makeApp(dir, {name: 'built'});
  const w = (rel, text) => h.writeFile(path.join(dir, rel), text);
  await w('dist/index.html', '<!doctype html><html><head><link rel="stylesheet" href="/assets/app.css"><link rel="stylesheet" href="missing.css"><!-- <link rel="stylesheet" href="commented.css"> --><script src="./assets/app.js"></script><link rel="icon" href="https://x.test/favicon.ico"></head><body><div id="root"></div></body></html>\n');
  await w('dist/assets/app.css', '/* @layer astryx-base */\n.app{color:red}\n');
  await w('dist/assets/app.js', 'console.log("bundle");\n');
  await w('plain/index.html', '<!doctype html><html><body><p>Hi</p></body></html>\n');
  await w('styled/index.html', '<html><head><style>@layer astryx-theme { :root { --astryx-color: red; } }</style></head></html>\n');
  await w('src/Page.tsx', `import {Button, Card} from '@astryxdesign/core';
import type {ButtonProps} from '@astryxdesign/core';
import {Heart} from 'lucide-react';
import * as stylex from '@stylexjs/stylex';
import './page.css';

// <div> in a comment is not counted
const styles = stylex.create({root: {padding: 4}});
const sample = "<span>in a string</span>";

export default function Page(props: ButtonProps) {
  return (
    <div className="page" style={{margin: 0}}>
      <Card>
        <h1>Title</h1>
        <Button label="Go" />
        <Heart />
        <svg><path d="M0 0" /></svg>
        <input type="hidden" name="x" />
        <input name="y" />
      </Card>
    </div>
  );
}
`);
  await w('src/clean.tsx', "import {Text} from '@astryxdesign/core';\n\nexport function Clean() {\n  return <Text>ok</Text>;\n}\n");
  await w('src/util.js', "export const x = <b>1</b>;\nconst req = require('@astryxdesign/core');\n");
  await w('src/broken.tsx', 'export default function ( {\n');
  await w('src/types.d.ts', "import '@astryxdesign/core';\n");
  await w('nojsx/index.ts', "export const n: number = 1;\n");
  await w('empty/.keep', '');
}
