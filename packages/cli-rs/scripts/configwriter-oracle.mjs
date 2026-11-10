// Test oracle only: setConfigString over crafted configs. Writes the input
// configs to <out>.inputs/<case>/ and records each result and output text.
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {pathToFileURL} from 'node:url';
const [cliRoot, out] = process.argv.slice(2);
const cw = await import(pathToFileURL(path.join(cliRoot, 'foundation/config/config-writer.mjs')).href);
const inputs = {
  none: null,
  plain: "export default {\n  integrations: [],\n};\n",
  replace: "export default {\n  experimental: {iconSet: 'old', other: 1},\n};\n",
  same: "export default {experimental: {iconSet: 'glyphs'}};\n",
  nested: "// config\nexport default {\n  integrations: ['@acme/kit'], // kits\n  experimental: {\n    xle: true,\n  },\n};\n",
  spread: "const base = {};\nexport default {...base};\n",
  spreadInner: "export default {experimental: {...more}};\n",
  notObject: "export default makeConfig();\n",
  notStaticInner: "export default {experimental: something};\n",
  satisfies: "import type {Config} from 'x';\nexport default {\n  integrations: [],\n} satisfies Config;\n",
  quote: "export default {experimental: {iconSet: \"double\"}};\n",
};
const base = `${out}.inputs`;
fs.rmSync(base, {recursive: true, force: true});
const cases = [];
for (const [name, text] of Object.entries(inputs)) {
  for (const [key, value] of [['experimental.iconSet', 'glyphs'], ['theme', "it's"], ['a.b.c', 'x']]) {
    const dir = path.join(base, `${name}-${key}`);
    fs.mkdirSync(dir, {recursive: true});
    if (text != null) fs.writeFileSync(path.join(dir, name === 'satisfies' ? 'astryx.config.ts' : 'astryx.config.mjs'), text);
    let result;
    try { result = cw.setConfigString(dir, key, value); } catch (e) { result = {error: e.message, code: e.code ?? null}; }
    const file = ['astryx.config.ts', 'astryx.config.mjs'].map(f => path.join(dir, f)).find(f => fs.existsSync(f));
    cases.push({name, dir, key, value, input: text, result, output: fs.readFileSync(file ?? '/dev/null', 'utf8')});
    // Restore the input for the Rust run.
    if (text != null) fs.writeFileSync(file, text); else if (file) fs.rmSync(file);
  }
}
fs.writeFileSync(out, JSON.stringify(cases, null, 1));
console.log(cases.length);
