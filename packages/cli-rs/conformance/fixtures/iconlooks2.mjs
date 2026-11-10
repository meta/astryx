// The iconlooks package after its library changed: Home is gone, Rocket is
// new, Trash is drawn as Bin, and the package gained a LICENSE.
import * as fs from 'node:fs';
import * as path from 'node:path';
import base from './iconlooks.mjs';

export default function make(dir, h) {
  base(dir, h);
  const file = path.join(dir, 'lib', 'looks.js');
  let text = fs.readFileSync(file, 'utf8');
  text = text
    .split('\n')
    .filter(line => !/export const Home(Outline|Solid)Icon/.test(line))
    .join('\n')
    .replace(/TrashOutlineIcon/g, 'BinOutlineIcon')
    .replace(/TrashSolidIcon/g, 'BinSolidIcon');
  text += "export const RocketOutlineIcon = icon('M1 R');\nexport const RocketSolidIcon = icon('M2 R');\n";
  fs.writeFileSync(file, text);
  h.writeFile(path.join(dir, 'LICENSE'), 'MIT License\n');
}
