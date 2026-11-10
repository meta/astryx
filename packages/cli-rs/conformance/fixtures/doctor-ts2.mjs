// More TypeScript-backed prop drift: a package whose docs match the code, an
// unresolved import, defaults, sub-components, `any` and generic props, mapped
// props, and a broken TypeScript config. Each folder is its own package.
import * as fs from 'node:fs';
import * as path from 'node:path';

export default async function (dir, h) {
  const ts = fs.realpathSync(path.join(h.REPO, 'node_modules/typescript'));
  const kit = async (name, tsconfig, files) => {
    const d = path.join(dir, name);
    await h.writeJson(path.join(d, 'package.json'), {name: `@acme/${name}`, version: '1.0.0', peerDependencies: {'@astryxdesign/core': h.CORE_VERSION}});
    h.copyPackage(path.join(h.REPO, 'packages/core'), path.join(d, 'node_modules/@astryxdesign/core'));
    fs.cpSync(ts, path.join(d, 'node_modules/typescript'), {recursive: true, dereference: true});
    await h.writeFile(path.join(d, 'tsconfig.json'), tsconfig ?? JSON.stringify({compilerOptions: {strict: true, jsx: 'react-jsx', module: 'esnext', moduleResolution: 'bundler', target: 'es2022', skipLibCheck: true}}));
    await h.writeFile(path.join(d, 'astryx.integration.mjs'), "export default {components: './src'};\n");
    for (const [rel, text] of Object.entries(files)) await h.writeFile(path.join(d, rel), text);
  };
  const doc = (name, props, extra = '') => `export default {type: 'component', name: '${name}', category: 'Data Display', usage: {description: 'A ${name}.'}, props: ${JSON.stringify(props)}${extra}};\n`;
  await kit('clean', null, {
    'src/Meter/Meter.tsx': "export enum Tone { Calm = 'calm', Loud = 'loud' }\ntype Size = 'sm' | 'md' | 'lg';\nexport interface MeterProps {\n  value: number;\n  size?: Size;\n  labels?: readonly string[];\n  options?: {dense: boolean; step?: number};\n  tone?: Tone;\n  onPick?: (v: number) => void;\n  className?: string;\n  /** @internal */\n  secret?: boolean;\n}\nexport function Meter({size = 'md', value}: MeterProps) { return null; }\n",
    'src/Meter/Meter.doc.mjs': doc('Meter', [
      {name: 'value', type: 'number', required: true, description: 'Value.'},
      {name: 'size', type: "'lg' | 'md' | 'sm'", default: "'md'", description: 'Size.'},
      {name: 'labels', type: 'readonly string[]', description: 'Labels.'},
      {name: 'options', type: '{dense: boolean; step?: number}', description: 'Options.'},
      {name: 'options.dense', type: 'boolean', description: 'Dense.'},
      {name: 'options.step', type: 'string', description: 'Wrong field type.'},
      {name: 'options.missing', type: 'string', description: 'No such field.'},
      {name: 'tone', type: "'calm' | 'loud'", description: 'Tone.'},
      {name: 'onPick', type: '(v: number) => void', description: 'Pick.'},
    ]),
  });
  await kit('unresolved', null, {
    'src/Chip/Chip.tsx': "import type {Extra} from 'missing-pkg';\nexport interface ChipProps extends Extra { label: string }\nexport function Chip(props: ChipProps) { return null; }\n",
    'src/Chip/Chip.doc.mjs': doc('Chip', [{name: 'label', type: 'string', required: true, description: 'Label.'}]),
    'src/Tag/Tag.tsx': "const base = {a: 1};\nexport function Tag(props: {label: typeof base.nope}) { return null; }\n",
    'src/Tag/Tag.doc.mjs': doc('Tag', [{name: 'label', type: 'string', required: true, description: 'Label.'}]),
  });
  await kit('defaults', null, {
    'src/Stepper/Stepper.tsx': "const START = 3;\nexport interface StepperProps { step?: number; start?: number; mode?: 'a' | 'b'; label?: string }\nexport function Stepper({step = 1, start = START, mode = 'a', label = 'x'}: StepperProps) { return null; }\nexport function StepperItem(props: {index: number; done?: boolean}) { return null; }\n",
    'src/Stepper/Stepper.doc.mjs': doc('Stepper', [
      {name: 'step', type: 'number', default: '2', description: 'Step.'},
      {name: 'start', type: 'number', default: '3', description: 'Start.'},
      {name: 'mode', type: "'a' | 'b'", default: 'the first mode', description: 'Mode.'},
      {name: 'label', type: 'string', default: "'x'", description: 'Label.'},
    ], ", components: [{name: 'StepperItem', props: [{name: 'index', type: 'string', required: true, description: 'Index.'}, {name: 'ghost', type: 'boolean', description: 'Ghost.'}]}]"),
  });
  await kit('shapes', null, {
    'src/Loose/Loose.tsx': "export function Loose(props: any) { return null; }\n",
    'src/Loose/Loose.doc.mjs': doc('Loose', [{name: 'x', type: 'string', description: 'X.'}]),
    'src/Poly/Poly.tsx': "type Props<T extends Record<string, unknown>> = {as?: string} & {[K in keyof T]: T[K]};\nexport function Poly<T extends Record<string, unknown>>(props: Props<T>) { return null; }\n",
    'src/Poly/Poly.doc.mjs': doc('Poly', [{name: 'as', type: 'string', description: 'As.'}]),
    'src/Grid/Grid.tsx': "type Keys = 'top' | 'left';\nexport type GridProps = {[K in Keys as `pad${Capitalize<K>}`]?: number} & {cols: number};\nexport function Grid(props: GridProps) { return null; }\n",
    'src/Grid/Grid.doc.mjs': doc('Grid', [{name: 'cols', type: 'number', required: true, description: 'Cols.'}, {name: 'padTop', type: 'string', description: 'Top.'}]),
    'src/Bag/Bag.tsx': "export interface BagProps { [key: string]: string | undefined; name: string }\nexport function Bag(props: BagProps) { return null; }\n",
    'src/Bag/Bag.doc.mjs': doc('Bag', [{name: 'name', type: 'string', required: true, description: 'Name.'}, {name: 'extra', type: 'number', description: 'Indexed.'}]),
  });
  await kit('badconfig', '{"compilerOptions": {"strict": true, "jsx": "nope"}}', {
    'src/Pin/Pin.tsx': "export function Pin(props: {at: number}) { return null; }\n",
    'src/Pin/Pin.doc.mjs': doc('Pin', [{name: 'at', type: 'number', required: true, description: 'At.'}]),
  });
}
