// Copyright (c) Meta Platforms, Inc. and affiliates.
/** @file Focused contract tests for keyed theme-family builds. */
import {parse} from '@babel/parser';
import {execFileSync} from 'node:child_process';
// prettier-ignore
import {afterEach, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {pathToFileURL} from 'node:url';
import {defineTheme as defineCoreTheme} from '@astryxdesign/core/theme';
import {themeBuild, themeBuildFamily} from './build.mjs';
import {interceptCore} from './core-interception.mjs';
import {ensureCoreBuilt} from '../../../clients/cli/commands/ensure-core-built.mjs';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {getCliInvocation} from '../../../foundation/env/package-manager.mjs';
vi.setConfig({testTimeout: 120_000});
const CLI_ROOT = path.resolve(import.meta.dirname, '../../..');
const FAMILY_KEY = 'ocean-family';
const OUTPUTS = [
  `${FAMILY_KEY}.css`,
  `${FAMILY_KEY}.css.d.ts`,
  `${FAMILY_KEY}.js`,
  `${FAMILY_KEY}.d.ts`,
];
/** @type {string[]} */ let dirs;
beforeAll(() => ensureCoreBuilt(), 200_000);
beforeEach(() => (dirs = []));
// prettier-ignore
afterEach(() => { for (const dir of dirs) fs.rmSync(dir, {recursive: true, force: true}); });
// prettier-ignore
function makeDir() { const dir = fs.mkdtempSync(path.join(CLI_ROOT, '.tmp-theme-family-')); dirs.push(dir); fs.mkdirSync(path.join(dir, 'themes'), {recursive: true}); fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}\n'); return dir; }
function writeFamily(dir) {
  const themes = path.join(dir, 'themes');
  const hidden = path.join(themes, '.hidden');
  fs.mkdirSync(hidden, {recursive: true});
  const write = (root, name, source) =>
    fs.writeFileSync(path.join(root, name), source);
  const helper = path.join(dir, 'node_modules/@fixture/static-helper');
  fs.mkdirSync(helper, {recursive: true});
  fs.writeFileSync(
    path.join(helper, 'package.json'),
    JSON.stringify({
      name: '@fixture/static-helper',
      type: 'module',
      exports: {import: './index.mjs'},
    }),
  );
  fs.writeFileSync(
    path.join(helper, 'index.mjs'),
    `export const marker=true;\n`,
  );
  // prettier-ignore
  for (const [root, name, source] of [[themes, 'base-icons.mjs', `import '@fixture/static-helper';export {icons} from './base-icons-leaf.mjs';\n`], [themes, 'base-icons-leaf.mjs', `export const icons={close:'base-close',menu:'base-menu'};\n`], [hidden, 'child-icons.mjs', `export const icons={close:'child-close'};\n`], [themes, 'base-indicators.mjs', `export const indicators={check:'base-check',radio:'base-radio'};\n`], [hidden, 'child-indicators.mjs', `export const indicators={check:'child-check'};\n`]]) write(root, name, source);
  // prettier-ignore
  write(themes, 'ocean.mjs', `import {defineTheme} from '@astryxdesign/core/theme';
import {icons} from './base-icons.mjs';
import {indicators} from './base-indicators.mjs';
await Promise.resolve();
export const oceanTheme=defineTheme({
 name:'ocean',icons,indicators,
 tokens:{'--color-accent':'rgb(0 119 182)','--color-background-body':'rgb(240 248 255)'},
 localTokens:{'--tide':'8px','--wash':'linear-gradient(\\nred,\\nblue\\n)','--commented':'red /* ) */','--payload':'[one; two]'},
 components:{button:{base:{borderRadius:'6px',backgroundImage:'url(/icons/*/mark.svg)',':hover':{backgroundColor:'rgb(220 40 40)'}},'variant:a{b':{color:'rgb(1 2 3)'}},card:{base:{padding:'8px 16px'}},text:{'type:body':{letterSpacing:'0.01em'}}},
 adaptations:{rules:[{when:{width:{below:'md'}},value:{tokens:{'--spacing-4':'12px'},components:{button:{base:{minHeight:'40px'}}}}}]},
 onDark:{tokens:{'--color-border':'rgb(80 120 140)'},components:{button:{base:{borderColor:'rgb(80 120 140)','::before':{content:\`'@scope ([data-astryx-theme="ocean"])'\`}}}}},
});export default oceanTheme;\n`,
  );
  write(
    themes,
    'ocean-barrel.mjs',
    `export {oceanTheme} from './ocean.mjs';\n`,
  );
  // prettier-ignore
  write(hidden, 'ocean-calm.mjs', `import {defineTheme} from '@astryxdesign/core/theme';
import {oceanTheme} from '../ocean-barrel.mjs';
import {icons as brandIcons} from './child-icons.mjs';
import {indicators as brandIndicators} from './child-indicators.mjs';
export const resolvedOceanCalmTheme=defineTheme({
 name:'ocean-calm',extends:oceanTheme,icons:brandIcons,indicators:brandIndicators,
 tokens:{'--color-accent':['rgb(0 150 170)','rgb(0 170 190)']},
 localTokens:{'--tide':'10px','--wash':'linear-gradient(\\nred,\\ngreen\\n)','--payload':'[one; three]'},
 components:{button:{base:{backgroundColor:'rgb(220 250 250)',borderColor:'rgb(0 0 0)',minHeight:'28px'},'variant:lagoon':{backgroundColor:'rgb(0 90 110)'}},card:{base:{padding:'24px'}}},
 adaptations:{widthBreakpoints:{md:900}},
});export const oceanCalmTheme={...resolvedOceanCalmTheme};export default oceanCalmTheme;\n`,
  );
  // prettier-ignore
  write(hidden, 'ocean-calm-deep.mjs', `import {defineTheme} from '@astryxdesign/core/theme';\nimport {oceanCalmTheme} from './ocean-calm.mjs';\nexport const oceanCalmDeepTheme=defineTheme({name:'ocean-calm-deep',extends:oceanCalmTheme});\n`);
  // prettier-ignore
  write(themes, 'ocean-midnight.mjs', `import {oceanTheme} from './ocean.mjs';\nexport const oceanMidnightTheme={name:'ocean-midnight',extends:oceanTheme,tokens:{'--color-background-body':'rgb(4 20 32)'},components:{button:{base:{color:'rgb(235 250 255)'}}}};export default oceanMidnightTheme;\n`);
  // prettier-ignore
  return ['themes/ocean.mjs', 'themes/.hidden/ocean-calm.mjs', 'themes/.hidden/ocean-calm-deep.mjs', 'themes/ocean-midnight.mjs'];
}
const count = (text, needle) => text.split(needle).length - 1;
/** @param {string} source */
// prettier-ignore
function executableDependencies(source) {
  const ast = parse(source, {sourceType: 'module'}); /** @type {string[]} */ const dependencies = [];
  /** @param {any} node */ const visit = node => {
    if (!node || typeof node !== 'object') return;
    if (['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(node.type) && typeof node.source?.value === 'string') dependencies.push(node.source.value);
    const dynamic = node.type === 'ImportExpression' ? node.source : node.type === 'CallExpression' && (node.callee?.type === 'Import' || node.callee?.name === 'require') ? node.arguments?.[0] : null;
    if (dynamic) dependencies.push(typeof dynamic.value === 'string' ? dynamic.value : '<non-static>');
    for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(child => child?.type && visit(child)); else if (value?.type) visit(value);
  };
  visit(ast); return dependencies;
}
// prettier-ignore
const build = (dir, files, options = {}) => themeBuildFamily(files, {familyKey: FAMILY_KEY, ...options}, {cwd: dir});
describe('themeBuildFamily()', () => {
  // prettier-ignore
  it('does not add lineage metadata to ordinary Core themes', () => {
    const base = defineCoreTheme({name: 'runtime-base'}), child = defineCoreTheme({name: 'runtime-child', extends: base}), spread = {...child};
    expect(Object.getOwnPropertySymbols(base)).toEqual([]); expect(Object.getOwnPropertySymbols(child)).toEqual([]);
    expect(Reflect.ownKeys(spread)).toEqual(Reflect.ownKeys(child)); expect(JSON.stringify(spread)).toBe(JSON.stringify(child));
  });

  it('emits one deterministic complete trio with shared rules and member deltas', async () => {
    const first = makeDir();
    const second = makeDir();
    const firstFiles = writeFamily(first);
    const secondFiles = writeFamily(second);
    // prettier-ignore
    const result = await build(first, [firstFiles[2], firstFiles[3], firstFiles[0], firstFiles[1]]);
    // prettier-ignore
    await build(second, [secondFiles[1], secondFiles[0], secondFiles[3], secondFiles[2]]);
    expect(result?.type).toBe('theme.build');
    expect(result?.data.name).toBe('ocean');
    // prettier-ignore
    expect(result?.data.outputs).toEqual({css: `themes/${FAMILY_KEY}.css`, cssDts: `themes/${FAMILY_KEY}.css.d.ts`, js: `themes/${FAMILY_KEY}.js`, dts: `themes/${FAMILY_KEY}.d.ts`});
    // prettier-ignore
    for (const output of OUTPUTS) { const a = fs.readFileSync(path.join(first, 'themes', output), 'utf8'), b = fs.readFileSync(path.join(second, 'themes', output), 'utf8'); expect({output, content: a}).toEqual({output, content: b}); }
    const css = fs.readFileSync(
      path.join(first, 'themes', `${FAMILY_KEY}.css`),
      'utf8',
    );
    expect(css).toContain(
      ':where([data-astryx-theme="ocean"], [data-astryx-theme="ocean-calm"], [data-astryx-theme="ocean-calm-deep"], [data-astryx-theme="ocean-midnight"])',
    );
    expect(css).toContain(
      ':where([data-astryx-theme="ocean-calm"], [data-astryx-theme="ocean-calm-deep"])',
    );
    expect(css).not.toContain(':where(.astryx-button)');
    expect(css).toContain('--tide: 8px;');
    expect(css).toMatch(/--wash: linear-gradient\(\s*red,\s*green\s*\);/);
    expect(css).toContain('--commented: red /* ) */;');
    expect(css).toContain('[data-variant="a{b"]');
    expect(css).toContain('background-image: url(/icons/*/mark.svg);');
    expect(css).toContain('--payload: [one; two];');
    expect(css).toContain('--payload: [one; three];');
    expect(css).toContain(`content: '@scope ([data-astryx-theme="ocean"])';`);
    expect(css).toContain('--tide: 10px;');
    expect(count(css, '--tide: 8px;')).toBe(1);
    expect(count(css, '--tide: 10px;')).toBe(1);
    expect(css).toContain('--astryx-card-padding: 24px;');
    expect(css).toContain('--astryx-card-padding-inline: 16px;');
    expect(css).toContain('@media (width < 768px)');
    expect(css).toContain('@media (width < 900px)');
    expect(css).toContain('[data-astryx-media="dark"]');
    // prettier-ignore
    for (const text of [':root:where([data-astryx-theme="ocean-calm"], [data-astryx-theme="ocean-calm-deep"])', ':where(:scope:not([data-theme]):not(html[data-theme] *))', ':where(:scope:not([data-theme]):is(html[data-theme="dark"] *))', 'html[data-theme="dark"]:where([data-astryx-theme="ocean-calm"], [data-astryx-theme="ocean-calm-deep"])']) expect(css).toContain(text);
    expect(css).not.toContain('\n  :root { color-scheme: light dark; }');
    // prettier-ignore
    expect(css).not.toContain('@scope (:where([data-astryx-theme="ocean-calm-deep"]))');
    // prettier-ignore
    const js = fs.readFileSync(path.join(first, 'themes', `${FAMILY_KEY}.js`), 'utf8'), dts = fs.readFileSync(path.join(first, 'themes', `${FAMILY_KEY}.d.ts`), 'utf8');
    const dependencies = executableDependencies(js);
    expect(dependencies).not.toContain('<non-static>');
    expect(
      dependencies.some(specifier => /\.css(?:$|[?#])/i.test(specifier)),
    ).toBe(false);
    expect(js).toContain('from "./.hidden/child-icons.mjs"');
    // prettier-ignore
    for (const name of ['oceanTheme', 'oceanCalmTheme', 'oceanCalmDeepTheme', 'oceanMidnightTheme']) {
      expect(js).toContain(`export const ${name}`);
      expect(dts).toContain(`export declare const ${name}`);
    }
    // prettier-ignore
    const imported = await import(`${pathToFileURL(path.join(first, 'themes', `${FAMILY_KEY}.js`)).href}?${Date.now()}`);
    expect(imported.oceanTheme.icons.close).toBe('base-close');
    expect(imported.oceanCalmTheme.icons.close).toBe('child-close');
    expect(imported.oceanCalmTheme.icons.menu).toBe('base-menu');
    expect(imported.oceanCalmDeepTheme.icons.menu).toBe('base-menu');
    expect(imported.oceanCalmTheme.indicators.check).toBe('child-check');
    expect(imported.oceanCalmTheme.indicators.radio).toBe('base-radio');
    expect(imported.oceanCalmDeepTheme.indicators.radio).toBe('base-radio');
    expect(imported.oceanCalmDeepTheme.name).toBe('ocean-calm-deep');
    expect(Object.hasOwn(imported.oceanCalmTheme, '__extends')).toBe(false);
    fs.writeFileSync(
      path.join(first, 'themes', 'consumer.tsx'),
      `import type {DefinedTheme} from '@astryxdesign/core/theme';\n` +
        `import {Button} from '@astryxdesign/core/Button';\n` +
        `import {oceanTheme, oceanCalmTheme, oceanCalmDeepTheme, oceanMidnightTheme} from './ocean-family.js';\n` +
        `const family: DefinedTheme[] = [oceanTheme, oceanCalmTheme, oceanCalmDeepTheme, oceanMidnightTheme];\n` +
        `// @ts-expect-error family lineage is build-private, not DefinedTheme API\n` +
        `oceanCalmTheme.__extends;\n` +
        `export const Probe = () => <Button label={String(family.length)} variant="lagoon" />;\n`,
    );
    fs.writeFileSync(
      path.join(first, 'themes', 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          module: 'esnext',
          target: 'es2022',
          jsx: 'react-jsx',
          moduleResolution: 'bundler',
          strict: true,
          skipLibCheck: true,
        },
        include: ['consumer.tsx', 'ocean-family.d.ts'],
      }),
    );
    execFileSync(
      'pnpm',
      ['exec', 'tsc', '--project', 'tsconfig.json', '--noEmit'],
      {cwd: path.join(first, 'themes'), stdio: 'pipe'},
    );
    // prettier-ignore
    for (const member of ['ocean', 'ocean-calm', 'ocean-calm-deep', 'ocean-midnight']) expect(fs.existsSync(path.join(first, 'themes', `${member}.css`))).toBe(false);
  });
  // prettier-ignore
  it('retains private capture across cached frozen exports', () => {
    const core = {defineTheme: input => Object.freeze({name: input.name, tokens: {}})}, first = interceptCore(core), wrapped = /** @type {any} */ (first.modules['@astryxdesign/core/theme']);
    const parent = wrapped.defineTheme({name: 'parent'}), child = wrapped.defineTheme({name: 'child', extends: parent, adaptations: {rules: []}});
    first.retain(child); first.strip(child); const retry = interceptCore(core);
    expect(retry.parentOf(child)).toBe(parent); expect(retry.lineageOf(child).some(value => value?.adaptations)).toBe(true); expect(retry.unobservedIn(child)).toEqual([]);
  });

  it('checks the exact keyed trio without writing stale or missing output', async () => {
    const dir = makeDir();
    const files = writeFamily(dir);
    await build(dir, files);
    const cssPath = path.join(dir, 'themes', `${FAMILY_KEY}.css`);
    const jsPath = path.join(dir, 'themes', `${FAMILY_KEY}.js`);
    const dtsPath = path.join(dir, 'themes', `${FAMILY_KEY}.d.ts`);
    const cssBefore = fs.readFileSync(cssPath, 'utf8');
    expect((await build(dir, files, {check: true}))?.data).toMatchObject({
      upToDate: true,
      stale: [],
      checked: OUTPUTS.map(file => `themes/${file}`),
    });
    fs.writeFileSync(jsPath, '/* stale */\n');
    fs.rmSync(dtsPath);
    const checked = await build(dir, files, {check: true});
    expect(checked?.type).toBe('theme.build.check');
    expect(checked?.data.upToDate).toBe(false);
    expect(checked?.data.stale).toEqual([
      {path: `themes/${FAMILY_KEY}.js`, reason: 'outdated'},
      {path: `themes/${FAMILY_KEY}.d.ts`, reason: 'missing'},
    ]);
    expect(fs.readFileSync(cssPath, 'utf8')).toBe(cssBefore);
    expect(fs.readFileSync(jsPath, 'utf8')).toBe('/* stale */\n');
    expect(fs.existsSync(dtsPath)).toBe(false);
  });

  it('refuses to write family outputs outside cwd, and checks them read-only', async () => {
    const dir = makeDir();
    const files = writeFamily(dir).map(file => path.join(dir, file));
    const app = path.join(dir, 'app');
    fs.mkdirSync(app);

    await expect(
      themeBuildFamily(files, {familyKey: FAMILY_KEY}, {cwd: app}),
    ).rejects.toMatchObject({code: 'ERR_PATH_TRAVERSAL'});
    const checked = await themeBuildFamily(
      files,
      {familyKey: FAMILY_KEY, check: true},
      {cwd: app},
    );
    expect(checked?.type).toBe('theme.build.check');
    expect(checked?.data.upToDate).toBe(false);
    // The `.css.d.ts` import stub may be absent in check mode.
    expect(checked?.data.stale).toEqual(
      OUTPUTS.filter(file => !file.endsWith('.css.d.ts')).map(file => ({
        path: `../themes/${file}`,
        reason: 'missing',
      })),
    );
    for (const output of OUTPUTS) {
      expect(fs.existsSync(path.join(dir, 'themes', output))).toBe(false);
    }
  });

  it('ends a stale family report for outputs outside cwd with a remedy that works', async () => {
    const dir = makeDir();
    const files = writeFamily(dir).map(file => path.join(dir, file));
    const app = path.join(dir, 'app');
    fs.mkdirSync(app);
    const family = ['--family', ...files, '--family-key', FAMILY_KEY];

    const stale = await runCli(['theme', 'build', ...family, '--check'], app);
    expect(stale.code).toBe(1);
    // The old remedy ran the build from cwd, which refuses these outputs.
    expect(stale.stderr).not.toContain('Rebuild with:');

    const lines = stale.stderr.split('\n').map(line => line.trim());
    const runDir = lines.find(line => line.startsWith('cd '))?.slice(3);
    expect(runDir).toBe(fs.realpathSync(path.join(dir, 'themes')));
    const stem = `${getCliInvocation(runDir)} theme build `;
    const [buildArgs, checkArgs] = lines
      .filter(line => line.startsWith(stem))
      .map(line => line.slice(stem.length).split(' '));
    expect(checkArgs).toEqual([...buildArgs, '--check']);

    // Following the remedy builds, and the check from there passes.
    const built = await runCli(['theme', 'build', ...buildArgs], runDir);
    expect(built.code).toBe(0);
    for (const output of OUTPUTS) {
      expect(fs.existsSync(path.join(dir, 'themes', output))).toBe(true);
    }
    const checked = await runCli(
      ['--json', 'theme', 'build', ...checkArgs],
      runDir,
    );
    expect(checked.code).toBe(0);
    expect(JSON.parse(checked.stdout).data.upToDate).toBe(true);
  });

  it('fails without publishing a mixed trio when staging a write fails', async () => {
    const dir = makeDir();
    const files = writeFamily(dir);
    const outputDir = path.join(dir, 'themes');
    // A directory where the JS output goes fails its staging after the CSS
    // output was already staged.
    fs.mkdirSync(path.join(outputDir, `${FAMILY_KEY}.js`));

    await expect(build(dir, files)).rejects.toThrow(
      /Failed to write theme outputs/,
    );
    expect(fs.existsSync(path.join(outputDir, `${FAMILY_KEY}.css`))).toBe(
      false,
    );
    expect(fs.existsSync(path.join(outputDir, `${FAMILY_KEY}.d.ts`))).toBe(
      false,
    );
    expect(
      fs.readdirSync(outputDir).filter(name => name.includes('.tmp-')),
    ).toEqual([]);
  });

  it('rejects invalid graphs and keys before touching an existing trio', async () => {
    const dir = makeDir();
    const files = writeFamily(dir);
    const outputDir = path.join(dir, 'themes');
    for (const output of [...OUTPUTS, 'ocean.css', 'ocean.js', 'ocean.d.ts']) {
      fs.writeFileSync(path.join(outputDir, output), `sentinel:${output}`);
    }
    const unrelated = 'themes/unrelated.mjs';
    // prettier-ignore
    fs.writeFileSync(path.join(dir, unrelated), `import {defineTheme} from '@astryxdesign/core/theme';export default defineTheme({name:'unrelated'});\n`);
    const duplicate = 'themes/duplicate.mjs';
    // prettier-ignore
    fs.writeFileSync(path.join(dir, duplicate), `import {defineTheme} from '@astryxdesign/core/theme';export default defineTheme({name:'ocean'});\n`);
    const impostor = 'themes/impostor.mjs';
    const impostorChild = 'themes/impostor-child.mjs';
    // prettier-ignore
    fs.writeFileSync(path.join(dir, impostor), `import {oceanTheme} from './ocean.mjs';export const impostor={...oceanTheme};\n`);
    // prettier-ignore
    fs.writeFileSync(path.join(dir, impostorChild), `import {defineTheme} from '@astryxdesign/core/theme';import {impostor} from './impostor.mjs';export default defineTheme({name:'impostor-child',extends:impostor});\n`);
    const emptyParent = 'themes/empty-parent.mjs';
    // prettier-ignore
    fs.writeFileSync(path.join(dir, emptyParent), `import {defineTheme} from '@astryxdesign/core/theme';const invalid={name:'',tokens:{}};export default defineTheme({name:'empty-parent',extends:invalid});\n`);
    const sourceCollision = 'themes/Theme-family.js';
    const sourceBytes = `export const baseTheme={name:'base',tokens:{},extends:undefined};\n`;
    fs.writeFileSync(path.join(dir, sourceCollision), sourceBytes);
    const sourceChild = 'themes/source-child.mjs';
    // prettier-ignore
    fs.writeFileSync(path.join(dir, sourceChild), `import {defineTheme} from '@astryxdesign/core/theme';import {baseTheme} from './Theme-family.js';export default defineTheme({name:'source-child',extends:baseTheme});\n`);
    const bypass = 'themes/bypass.mjs';
    fs.writeFileSync(
      path.join(dir, bypass),
      `export default {name:'bypass',tokens:{}};\n`,
    );
    const graphIcons = 'themes/graph-icons.mjs';
    const graphRoot = 'themes/graph-root.mjs';
    const graphChild = 'themes/graph-child.mjs';
    // prettier-ignore
    fs.writeFileSync(path.join(dir, graphIcons), `export const icons={close:'x'};if(false)import(\`./hidden.css\`);\n`);
    fs.writeFileSync(path.join(dir, 'themes/hidden.css'), '.hidden{}\n');
    // prettier-ignore
    fs.writeFileSync(path.join(dir, graphRoot), `import {defineTheme} from '@astryxdesign/core/theme';import {icons} from './graph-icons.mjs';export const root=defineTheme({name:'graph-root',icons,tokens:{'--color-accent':'red'}});\n`);
    // prettier-ignore
    fs.writeFileSync(path.join(dir, graphChild), `import {defineTheme} from '@astryxdesign/core/theme';import {root} from './graph-root.mjs';export default defineTheme({name:'graph-child',extends:root});\n`);
    // prettier-ignore
    for (const [name, type, entry, source] of [['external-registry', 'module', 'index.mjs', `export const icons={close:'external'};if(false)import('./missing.mjs');\n`], ['computed-registry', 'module', 'index.mjs', `export const icons={close:'computed'};const extension='css';if(false)import(\`./hidden.\${extension}\`);\n`], ['cjs-registry', 'commonjs', 'index.cjs', `exports.icons={close:'cjs'};\n`]]) { const root = path.join(dir, 'node_modules/@fixture', name); fs.mkdirSync(root, {recursive: true}); fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({name: `@fixture/${name}`, type, exports: `./${entry}`})); fs.writeFileSync(path.join(root, entry), source); }
    fs.writeFileSync(
      path.join(dir, 'node_modules/@fixture/computed-registry/hidden.css'),
      '.hidden{}\n',
    );
    const cycleShared = 'themes/cycle-shared.mjs';
    const cycleA = 'themes/cycle-a.mjs';
    const cycleB = 'themes/cycle-b.mjs';
    // prettier-ignore
    fs.writeFileSync(path.join(dir, cycleShared), `import {defineTheme} from '@astryxdesign/core/theme';const input={name:'cycle-a'};export const a=defineTheme(input);export const b=defineTheme({name:'cycle-b',extends:a});input.extends=b;\n`);
    fs.writeFileSync(
      path.join(dir, cycleA),
      `export {a as default} from './cycle-shared.mjs';\n`,
    );
    fs.writeFileSync(
      path.join(dir, cycleB),
      `export {b as default} from './cycle-shared.mjs';\n`,
    );
    // prettier-ignore
    const cases = [
      {files: [files[0]], key: FAMILY_KEY, message: /at least two/i}, {files: [files[0], files[0]], key: FAMILY_KEY, message: /duplicate/i},
      {files: [files[0], duplicate], key: FAMILY_KEY, message: /duplicate.*ocean/i}, {files: [files[1], unrelated], key: FAMILY_KEY, message: /ancestor|parent/i},
      {files: [files[0], unrelated], key: FAMILY_KEY, message: /one selected root/i}, {files: [files[0], impostorChild], key: FAMILY_KEY, message: /does not extend the selected/i},
      {files: [files[0], bypass], key: FAMILY_KEY, message: /exact family ancestry could not be observed/i},
      {files: [cycleA, cycleB], key: FAMILY_KEY, message: /cycle/i},
      {files: [graphRoot, graphChild], key: 'graph-family', message: /registry graph imports CSS/i},
      {files: [emptyParent, unrelated], key: FAMILY_KEY, message: /invalid normalized parent/i},
      {files: [sourceCollision, sourceChild], key: 'theme-family', message: /collides with a selected source/i},
      {files, key: 'ocean', message: /collides.*standalone/i},
      {files, key: '../escaped', message: /family key/i},
      {files, key: 'Ocean_Family', message: /lower-kebab/i},
    ];
    // prettier-ignore
    for (const testCase of cases) await expect(themeBuildFamily(testCase.files, {familyKey: testCase.key}, {cwd: dir})).rejects.toThrow(testCase.message);
    // prettier-ignore
    fs.writeFileSync(path.join(dir, graphIcons), `export const icons={close:'x'};if(false)import('./missing.mjs');\n`);
    // prettier-ignore
    await expect(themeBuildFamily([graphRoot, graphChild], {familyKey: 'graph-family'}, {cwd: dir})).rejects.toThrow(/cannot resolve registry import/i);
    // prettier-ignore
    fs.writeFileSync(path.join(dir, graphIcons), `export {icons} from './nested-icons';\n`);
    // prettier-ignore
    fs.writeFileSync(path.join(dir, 'themes/nested-icons.mjs'), `export const icons={close:'x'};\n`);
    // prettier-ignore
    await expect(themeBuildFamily([graphRoot, graphChild], {familyKey: 'graph-family'}, {cwd: dir})).rejects.toThrow(/cannot resolve registry import/i);
    // prettier-ignore
    for (const [name, source] of [['graph-icons.mjs', `export const icons={close:'x'};\n`], ['graph-leaf.mjs', `export const other={};\n`], ['broken-icons.mjs', `import {missing} from './graph-leaf.mjs';export {missing as icons};\n`], ['compiled-icons.mjs', `export const icons={close:'x'};\n`]]) fs.writeFileSync(path.join(dir, 'themes', name), source);
    // prettier-ignore
    await expect(themeBuildFamily([graphRoot, graphChild], {familyKey: 'graph-family', iconsSpecifier: './broken-icons.mjs'}, {cwd: dir})).rejects.toThrow(/cannot import family registry|does not export/i);
    // prettier-ignore
    await expect(themeBuildFamily([graphRoot, graphChild], {familyKey: 'graph-family', iconsSpecifier: './compiled-icons'}, {cwd: dir})).rejects.toThrow(/cannot resolve registry import/i);
    // prettier-ignore
    await expect(themeBuildFamily([graphRoot, graphChild], {familyKey: 'graph-family', iconsSpecifier: '@fixture/external-registry'}, {cwd: dir})).rejects.toThrow(/cannot resolve registry import/i);
    // prettier-ignore
    await expect(themeBuildFamily([graphRoot, graphChild], {familyKey: 'computed-family', iconsSpecifier: '@fixture/computed-registry'}, {cwd: dir})).rejects.toThrow(/non-static dependency.*resolvable and CSS-free/i);
    // prettier-ignore
    for (const extension of ['css', 'js', 'd.ts']) expect(fs.existsSync(path.join(outputDir, `computed-family.${extension}`))).toBe(false);
    // prettier-ignore
    fs.writeFileSync(path.join(dir, 'themes/cjs-icons.mjs'), `export {icons} from '@fixture/cjs-registry';\n`);
    // prettier-ignore
    await expect(themeBuildFamily([graphRoot, graphChild], {familyKey: 'cjs-family', iconsSpecifier: './cjs-icons.mjs', check: true}, {cwd: dir})).resolves.toMatchObject({data: {upToDate: false}});
    // prettier-ignore
    expect(fs.readFileSync(path.join(dir, sourceCollision), 'utf8')).toBe(sourceBytes);
    // prettier-ignore
    for (const output of [...OUTPUTS, 'ocean.css', 'ocean.js', 'ocean.d.ts']) expect(fs.readFileSync(path.join(outputDir, output), 'utf8')).toBe(`sentinel:${output}`);
  });
  it('leaves standalone build bytes and outputs independent of family mode', async () => {
    const dir = makeDir();
    const files = writeFamily(dir);
    const standalone = await themeBuild(files[0], {}, {cwd: dir});
    // prettier-ignore
    const before = Object.fromEntries(['ocean.css', 'ocean.js', 'ocean.d.ts'].map(file => [file, fs.readFileSync(path.join(dir, 'themes', file), 'utf8')]));
    await build(dir, files);
    const checked = await themeBuild(files[0], {check: true}, {cwd: dir});
    expect(standalone?.type).toBe('theme.build');
    expect(checked?.data.upToDate).toBe(true);
    // prettier-ignore
    for (const [file, content] of Object.entries(before)) expect(fs.readFileSync(path.join(dir, 'themes', file), 'utf8')).toBe(content);
  });
});
describe('theme build --family CLI', () => {
  it('requires the key exactly with family mode and closes incompatible flags', async () => {
    const dir = makeDir();
    const files = writeFamily(dir);
    // prettier-ignore
    const cases = [
      {args: ['theme', 'build', '--family', ...files], message: /family-key/i},
      {args: ['theme', 'build', ...files, '--family-key', FAMILY_KEY], message: /family/i},
      {args: ['theme', 'build', '--family', ...files, '--family-key', FAMILY_KEY, '--out', 'other.css'], message: /--out/i},
      {args: ['theme', 'build', '--family', ...files, '--family-key', FAMILY_KEY, '--watch'], message: /--watch/i},
    ];
    // prettier-ignore
    for (const testCase of cases) { const result = await runCli(testCase.args, dir); expect(result.status).toBe(1); expect(result.stdout + result.stderr).toMatch(testCase.message); }
  });
  it('builds and checks one family through the existing response contract', async () => {
    const dir = makeDir();
    const files = writeFamily(dir);
    const args = [
      '--json',
      'theme',
      'build',
      '--family',
      ...files,
      '--family-key',
      FAMILY_KEY,
    ];
    const built = await runCli(args, dir);
    expect(built.status).toBe(0);
    expect(JSON.parse(built.stdout)).toMatchObject({
      type: 'theme.build',
      data: {name: 'ocean'},
    });
    const checked = await runCli([...args, '--check'], dir);
    expect(checked.status).toBe(0);
    expect(JSON.parse(checked.stdout)).toMatchObject({
      type: 'theme.build.check',
      data: {name: 'ocean', upToDate: true},
    });
  });
});
