// An app whose subfolder projects hold agent docs the setup reminder reads:
// a block in a file that is not valid UTF-8, and blocks whose content is an
// `@import` line with JavaScript-only whitespace.
import * as fs from 'node:fs';
import * as path from 'node:path';

export default function (dir, {makeApp, writeFile, writeJson}) {
  makeApp(dir, {name: 'nudge-app'});
  const sub = (name, agents) => {
    writeJson(path.join(dir, name, 'package.json'), {name, version: '1.0.0', dependencies: {'@astryxdesign/core': '*'}});
    fs.mkdirSync(path.join(dir, name), {recursive: true});
    fs.writeFileSync(path.join(dir, name, 'AGENTS.md'), agents);
  };
  sub('badutf', Buffer.concat([Buffer.from('<!-- ASTRYX:START -->\nUse Astryx \u00e9 '), Buffer.from([0xff, 0xfe]), Buffer.from('\n<!-- ASTRYX:END -->\n')]));
  sub('feff', '<!-- ASTRYX:START -->\n@docs\ufeffastryx.md\n<!-- ASTRYX:END -->\n');
  sub('ref', '<!-- ASTRYX:START -->\n@docs/astryx.md\n<!-- ASTRYX:END -->\n');
  sub('nel', '<!-- ASTRYX:START -->\u0085@docs/astryx.md\u0085<!-- ASTRYX:END -->\n');
}
