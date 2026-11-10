// Doctor integration with TypeScript installed: documented props against the
// code (prop drift) and docs against the authoring types (doc types).
import * as fs from 'node:fs';
import * as path from 'node:path';

export default async function (dir, h) {
  const d = path.join(dir, 'kit');
  const w = (rel, text) => h.writeFile(path.join(d, rel), text);
  await h.writeJson(path.join(d, 'package.json'), {name: '@acme/tskit', version: '1.0.0', peerDependencies: {'@astryxdesign/core': h.CORE_VERSION}});
  h.copyPackage(path.join(h.REPO, 'packages/core'), path.join(d, 'node_modules/@astryxdesign/core'));
  const ts = fs.realpathSync(path.join(h.REPO, 'node_modules/typescript'));
  fs.cpSync(ts, path.join(d, 'node_modules/typescript'), {recursive: true, dereference: true});
  await w('tsconfig.json', JSON.stringify({compilerOptions: {strict: true, jsx: 'react-jsx', module: 'esnext', moduleResolution: 'bundler', target: 'es2022', skipLibCheck: true}}));
  await w('astryx.integration.mjs', "export default {components: './src', docs: './docs'};\n");
  await w('src/Gauge/Gauge.tsx', "export interface GaugeProps {\n  /** The value. */\n  value: number;\n  max?: number;\n  tone: 'calm' | 'loud';\n  onChange?: (v: number) => void;\n}\nexport function Gauge(props: GaugeProps) { return null; }\n");
  await w('src/Gauge/Gauge.doc.mjs', "export default {type: 'component', name: 'Gauge', category: 'Data Display', usage: {description: 'A gauge.'}, props: [{name: 'value', type: 'string', required: true, description: 'Value.'}, {name: 'tone', type: \"'calm' | 'loud'\", description: 'Tone.'}, {name: 'ghost', type: 'boolean', description: 'Not in code.'}], bogusField: 1};\n");
  await w('src/Dial/Dial.tsx', "type DialProps = {size: 'sm' | 'lg'};\nexport function Dial({size}: DialProps) { return null; }\n");
  await w('src/Dial/Dial.doc.ts', "export default {type: 'component', name: 'Dial', category: 'Data Display', usage: {description: 'A dial.'}, props: [{name: 'size', type: \"'sm' | 'lg'\", required: true, description: 'Size.'}]};\n");
  await w('docs/guide.doc.mjs', "export default {type: 'generic', name: 'ts-guide', title: 'Guide', description: 'Guide.', sections: [{title: 'Start', content: [{type: 'prose', txt: 'typo field'}]}]};\n");
}
