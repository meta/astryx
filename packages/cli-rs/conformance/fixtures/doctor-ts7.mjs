// The type checks run on the CLI's own TypeScript 7 whatever TypeScript a
// package installs: one with TypeScript 7 alone (no JavaScript compiler API),
// and one with TypeScript 5. Each package's `typescript` is only its
// package.json, which is all the checks read of it.
import * as path from 'node:path';

export default async function (dir, h) {
  const kit = async (name, version, files) => {
    const d = path.join(dir, name);
    await h.writeJson(path.join(d, 'package.json'), {name: `@acme/${name}`, version: '1.0.0', peerDependencies: {'@astryxdesign/core': h.CORE_VERSION}});
    h.copyPackage(path.join(h.REPO, 'packages/core'), path.join(d, 'node_modules/@astryxdesign/core'));
    await h.writeJson(path.join(d, 'node_modules/typescript/package.json'), {name: 'typescript', version, exports: {'./package.json': './package.json'}});
    await h.writeFile(path.join(d, 'tsconfig.json'), JSON.stringify({compilerOptions: {strict: true, jsx: 'react-jsx', module: 'esnext', moduleResolution: 'bundler', target: 'es2022', skipLibCheck: true}}));
    await h.writeFile(path.join(d, 'astryx.integration.mjs'), "export default {components: './src'};\n");
    for (const [rel, text] of Object.entries(files)) await h.writeFile(path.join(d, rel), text);
  };
  const files = {
    'src/Dial/Dial.tsx': "type Size = 'sm' | 'md';\nexport interface DialProps {\n  value: number;\n  size?: Size;\n  label?: string;\n  onTurn?: (v: number) => void;\n}\nexport function Dial({size = 'md'}: DialProps) { return null; }\n",
    'src/Dial/Dial.doc.mjs': "export default {type: 'component', name: 'Dial', category: 'Knobs', usage: {description: 'A dial.'}, keywords: ['dial'], props: [{name: 'value', type: 'string', required: true, description: 'Value.'}, {name: 'size', type: \"'sm' | 'lg'\", default: \"'sm'\", description: 'Size.'}, {name: 'onTurn', type: '(v: number) => void', description: 'Turn.'}]};\n",
  };
  await kit('ts7only', '7.0.2', files);
  await kit('ts5', '5.4.5', files);
}
