// Version 1 receipts whose TypeScript source uses an enum, a const enum and a
// namespace. Version 1 receipts derive their JavaScript variant by compiling
// the TypeScript, so the variant exists only when that compile succeeds; with
// both files installed, upgrade then reports two installed variants.
import {createHash} from 'node:crypto';
import * as path from 'node:path';

const sha = text => createHash('sha256').update(text, 'utf8').digest('hex');

function receipt(name, file, content) {
  return {
    schemaVersion: 1,
    item: {name, path: `examples/${name.replace(/^example-/, '')}`, aliases: [], kind: 'example'},
    source: {package: '@astryxdesign/cli', version: '0.5.0'},
    files: [{id: 'primary', target: `../${file}`, registryTarget: `components/astryx/examples/${file}`, registryPath: `registry/${name}/${file}`, sha256: sha(content), content}],
  };
}

const ENUMS = `export enum Tone {
  Neutral,
  Accent = 4,
  Strong,
}

const enum Size { Small = 'sm', Large = 'lg' }

export namespace Layout {
  export const gap = 8;
  export function pad(n: number): number { return n * gap; }
  export namespace Grid {
    export const columns = 12;
  }
}

export default function Example() {
  return <div data-size={Size.Small}>{Tone.Accent + Layout.pad(1) + Layout.Grid.columns}</div>;
}
`;

const BROKEN = `export namespace Bad {
  export let mutable = 1;
}

export default function Example() {
  return <div>{Bad.mutable}</div>;
}
`;

export default function (dir, {makeApp, writeFile}) {
  makeApp(dir, {name: 'registry-enums-app'});
  const w = (rel, text) => writeFile(path.join(dir, rel), text);
  const json = (rel, value) => w(rel, `${JSON.stringify(value, null, 2)}\n`);
  const ex = 'src/components/astryx/examples';
  w(`${ex}/Enums.tsx`, ENUMS);
  w(`${ex}/Enums.jsx`, 'export default function Example() { return null; }\n');
  json(`${ex}/.astryx/example-enums.json`, receipt('example-enums', 'Enums.tsx', ENUMS));
  w(`${ex}/Broken.tsx`, BROKEN);
  w(`${ex}/Broken.jsx`, 'export default function Example() { return null; }\n');
  json(`${ex}/.astryx/example-broken.json`, receipt('example-broken', 'Broken.tsx', BROKEN));
}
