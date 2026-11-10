// Theme sources for `theme build` cases: plain objects, defineTheme modules,
// custom variants, fonts, adaptations, media surfaces, private vars, bad
// names, broken modules, stale outputs, and a theme under src/. The app has
// Core's runtime dependencies so Core's theme entry loads.
import * as fs from 'node:fs';
import * as path from 'node:path';

const RUNTIME = ['react', 'react-dom', 'scheduler', '@stylexjs/stylex', 'styleq', 'invariant', 'css-mediaquery', 'lucide-react', '@heroicons/react'];

/** Copy a package the repository installed (real files, no links). */
function copyInstalled(repo, name, dest) {
  const candidates = [path.join(repo, 'node_modules', name)];
  const pnpm = path.join(repo, 'node_modules/.pnpm');
  if (fs.existsSync(pnpm)) {
    const prefix = `${name.replace('/', '+')}@`;
    for (const entry of fs.readdirSync(pnpm).sort()) {
      if (entry.startsWith(prefix)) candidates.push(path.join(pnpm, entry, 'node_modules', name));
    }
  }
  const from = candidates.find(c => fs.existsSync(path.join(c, 'package.json')));
  if (!from) return;
  fs.cpSync(from, path.join(dest, 'node_modules', name), {recursive: true, dereference: true});
}

export default function make(dir, {makeApp, writeFile, REPO}) {
  makeApp(dir, {name: 'themes-app'});
  for (const name of RUNTIME) {
    if (!fs.existsSync(path.join(dir, 'node_modules', name, 'package.json'))) copyInstalled(REPO, name, dir);
  }
  const t = (rel, text) => writeFile(path.join(dir, rel), text);

  t('themes/alpha.mjs', "export default { name: 'alpha', tokens: { '--color-bg': '#ffffff' } };\n");
  t('themes/beta.mjs', "export default { name: 'beta', tokens: { '--color-bg': '#010203' } };\n");
  t('themes/gamma.mjs', "export default { name: 'gamma', tokens: { '--color-bg': '#ff00ff' } };\n");

  t(
    'themes/ocean.ts',
    `import {defineTheme} from '@astryxdesign/core/theme';

export const oceanTheme = defineTheme({
  name: 'ocean',
  tokens: {
    '--color-accent': ['#0064E0', '#4c9aff'],
    '--font-family-body': '"Inter", system-ui, sans-serif',
  },
  typography: {heading: {family: 'Playfair Display', fallbacks: 'Georgia, serif'}},
  components: {
    button: {base: {borderRadius: '12px'}, 'variant:primary': {backgroundColor: 'red'}, 'tone:fancy': {color: 'blue'}},
    buton: {base: {color: 'red'}},
  },
});
`,
  );

  t(
    'themes/variants.mjs',
    `export default {
  name: 'variants-theme',
  tokens: { '--color-bg': '#fff' },
  components: {
    button: { 'variant:accentOutline': { backgroundColor: 'transparent' }, 'size:jumbo': { paddingBlock: '40px' } },
    text: { 'type:fancy': { fontStyle: 'italic' } },
    heading: { 'type:hero': { fontSize: '64px' }, 'type:display-1': { fontSize: '72px' } },
  },
  onDark: { components: { heading: { 'type:night': { color: 'white' } } } },
};
`,
  );
  t(
    'themes/nonaug.mjs',
    "export default { name: 'nonaug', tokens: { '--color-bg': '#fff' }, components: { button: { 'size:jumbo': { paddingBlock: '40px' } } } };\n",
  );
  t(
    'themes/heading-combo.mjs',
    "export default { name: 'heading-combo', tokens: { '--color-bg': '#fff' }, components: { heading: { 'type:hero+level:1': { color: 'red' }, 'type:empty': { ':hover': {} } } } };\n",
  );
  t(
    'themes/heading-blank.mjs',
    "export default { name: 'heading-blank', tokens: { '--color-bg': '#fff' }, components: { heading: { 'type:hero': { color: '  ' } } } };\n",
  );
  t(
    'themes/private.mjs',
    "export default { name: 'private', tokens: { '--color-bg': '#fff', '--_secret': '1px' }, components: { button: { base: { '--_radius': '4px', ':hover': { '--_bg': 'red' } } } } };\n",
  );
  t('themes/nameless.mjs', "export default { tokens: { '--color-bg': '#fff' } };\n");
  t('themes/traversal.mjs', "export default { name: '../escaped', tokens: { '--color-bg': '#fff' } };\n");
  t('themes/slash.mjs', "export default { name: 'a/b', tokens: { '--color-bg': '#fff' } };\n");
  t('themes/spaces.mjs', "export default { name: 'my theme', tokens: { '--color-bg': '#fff' } };\n");
  t('themes/notheme.mjs', 'export const answer = 42;\n');
  t('themes/throws.mjs', "throw new Error('theme module exploded');\n");
  t('themes/missing-import.mjs', "import {nope} from './does-not-exist.mjs';\nexport default {name: 'x', tokens: {}};\n");
  t('themes/named.mjs', "export const first = 1;\nexport const brandTheme = { name: 'brand-v2.x', tokens: { '--color-accent': '#123456' } };\n");
  t(
    'themes/fonts.mjs',
    "export default { name: 'fonts', tokens: { '--font-family-body': \"'Fira Sans', 'Segoe UI', sans-serif\", '--font-family-code': 'JetBrains Mono, monospace', '--font-family-heading': 'var(--x, Lobster), \"Fira Sans\"' }, components: { button: { base: { fontFamily: 'Comic Neue, cursive' } } } };\n",
  );
  t(
    'themes/system.mjs',
    "export default { name: 'system', tokens: { '--font-family-body': '-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif' } };\n",
  );
  t(
    'themes/scheme.mjs',
    "export default { name: 'scheme', tokens: { '--color-bg': 'light-dark(#fff, #000)' } };\n",
  );
  t(
    'themes/ordered.mjs',
    `export default {
  name: 'ordered',
  tokens: {'--spacing-4': '16px'},
  adaptations: {
    widthBreakpoints: {md: 800, lg: 1100},
    rules: [
      { when: {width: {from: 'md', below: 'lg'}, pointer: 'coarse'}, value: {tokens: {'--spacing-4': '12px'}} },
      { when: {contrast: 'more', motion: 'reduce'}, value: {tokens: {'--spacing-4': '20px'}, components: {button: {base: {borderRadius: '2px'}}}} },
    ],
  },
};
`,
  );
  t(
    'themes/surface.mjs',
    `export default {
  name: 'surface',
  tokens: {'--color-background-body': '#ffffff'},
  adaptations: { rules: [{ when: {contrast: 'more'}, value: {tokens: {'--color-background-body': ['#eeeeee', '#222222']}} }] },
  onDark: {tokens: {'--color-background-body': '#111111'}, components: {button: {base: {color: 'white'}}}},
  onLight: {components: {card: {base: {color: 'black'}}}},
};
`,
  );
  t(
    'themes/enroll.mjs',
    `export default {
  name: 'enroll',
  tokens: {'--color-bg': '#fff'},
  adaptations: { rules: [{ when: {contrast: 'more'}, value: {components: {button: {'variant:brandNew': {color: 'red'}}}} }] },
};
`,
  );
  t(
    'themes/dropped.mjs',
    "export default { name: 'dropped', tokens: { '--color-bg': '#fff' }, components: { button: { base: { color: 'red; background: blue', padding: '4px' } } } };\n",
  );
  t(
    'themes/local.ts',
    `import {defineTheme} from '@astryxdesign/core/theme';
export default defineTheme({
  name: 'local',
  tokens: {'--color-bg': '#fafafa'},
  radius: {base: 6},
  motion: {speed: 'fast'},
});
`,
  );
  t(
    'themes/extends.ts',
    `import {defineTheme} from '@astryxdesign/core/theme';
import {oceanTheme} from './ocean';
export const reefTheme = defineTheme({
  extends: oceanTheme,
  name: 'reef',
  tokens: {'--color-accent': '#ff7f50'},
});
`,
  );
  t('themes/raw-input.mjs', "export default { name: 'raw', color: { accent: '#7c3aed' }, tokens: { '--color-bg': '#fff' } };\n");
  t('themes/fail-define.mjs', "export default { name: 'faildef', extends: 42, tokens: {} };\n");
  t('src/themes/brand.mjs', "export default { name: 'brand', tokens: { '--color-accent': '#123456' } };\n");
  t('stale/alpha.mjs', "export default { name: 'alpha', tokens: { '--color-bg': '#ffffff' } };\n");
  t('stale/alpha.css', '/* hand-edited */\n');
  t('stale/alpha.js', '// old\n');
  t('palette/basic.json', "{\n  \"families\": [\n    {\n      \"id\": \"blue\",\n      \"name\": \"Blue\",\n      \"seed\": \"#0064e0\"\n    },\n    {\n      \"id\": \"gray\",\n      \"kind\": \"neutral\",\n      \"seed\": \"#888\"\n    }\n  ]\n}\n");
  t('palette/custom-stops.json', "{\n  \"families\": [\n    {\n      \"id\": \"teal\",\n      \"seed\": \"#0f9d9a\"\n    }\n  ],\n  \"stops\": [\n    0,\n    2.5,\n    10,\n    33.3,\n    50,\n    72.5,\n    97.5,\n    100\n  ],\n  \"modeStrategy\": \"light-only\"\n}\n");
  t('palette/dark-only.json', "{\n  \"families\": [\n    {\n      \"id\": \"red\",\n      \"seed\": \"#e02424\"\n    },\n    {\n      \"id\": \"warm\",\n      \"kind\": \"neutral\",\n      \"seed\": \"#a0a\"\n    }\n  ],\n  \"modeStrategy\": \"dark-only\",\n  \"neutralProfile\": \"warm-v1\",\n  \"vibrancy\": 80\n}\n");
  t('palette/anchors.json', "{\n  \"families\": [\n    {\n      \"id\": \"brand\",\n      \"name\": \"Brand\",\n      \"seed\": \"#7c3aed\",\n      \"anchors\": [\n        {\n          \"mode\": \"light\",\n          \"stop\": 50,\n          \"color\": \"#7c3aed\",\n          \"policy\": \"exact\"\n        },\n        {\n          \"mode\": \"light\",\n          \"stop\": 80,\n          \"color\": \"#c4b5fd\",\n          \"policy\": \"bounded\",\n          \"maxDeltaE\": 3\n        },\n        {\n          \"mode\": \"dark\",\n          \"stop\": 30,\n          \"color\": \"#4c1d95\",\n          \"policy\": \"flexible\"\n        }\n      ]\n    },\n    {\n      \"id\": \"yellow\",\n      \"seed\": \"#facc15\"\n    },\n    {\n      \"id\": \"blue\",\n      \"seed\": \"#2563eb\"\n    }\n  ],\n  \"stops\": [\n    0,\n    10,\n    20,\n    30,\n    40,\n    50,\n    60,\n    70,\n    80,\n    90,\n    100\n  ],\n  \"vibrancy\": 20\n}\n");
  t('palette/custom-neutral.json', "{\n  \"families\": [\n    {\n      \"id\": \"n\",\n      \"kind\": \"neutral\",\n      \"seed\": \"#556677\"\n    }\n  ],\n  \"neutralProfile\": \"custom\",\n  \"stops\": [\n    0,\n    50,\n    100\n  ]\n}\n");
  t('palette/bad-id.json', "{\n  \"families\": [\n    {\n      \"id\": \"Bad Id\",\n      \"seed\": \"#123\"\n    }\n  ]\n}\n");
  t('palette/reserved.json', "{\n  \"families\": [\n    {\n      \"id\": \"black\",\n      \"seed\": \"#000\"\n    }\n  ]\n}\n");
  t('palette/dup-anchor.json', "{\n  \"families\": [\n    {\n      \"id\": \"x\",\n      \"seed\": \"#123456\",\n      \"anchors\": [\n        {\n          \"mode\": \"light\",\n          \"stop\": 50,\n          \"color\": \"#111\",\n          \"policy\": \"exact\"\n        },\n        {\n          \"mode\": \"light\",\n          \"stop\": 50,\n          \"color\": \"#222\",\n          \"policy\": \"exact\"\n        }\n      ]\n    }\n  ],\n  \"stops\": [\n    0,\n    50,\n    100\n  ]\n}\n");
  t('palette/endpoint.json', "{\n  \"families\": [\n    {\n      \"id\": \"x\",\n      \"seed\": \"#123456\",\n      \"anchors\": [\n        {\n          \"mode\": \"light\",\n          \"stop\": 0,\n          \"color\": \"#111\",\n          \"policy\": \"exact\"\n        }\n      ]\n    }\n  ]\n}\n");
  t('palette/bounded-missing.json', "{\n  \"families\": [\n    {\n      \"id\": \"x\",\n      \"seed\": \"#123456\",\n      \"anchors\": [\n        {\n          \"mode\": \"light\",\n          \"stop\": 50,\n          \"color\": \"#111\",\n          \"policy\": \"bounded\"\n        }\n      ]\n    }\n  ]\n}\n");
  t('palette/bad-stops.json', "{\n  \"families\": [\n    {\n      \"id\": \"x\",\n      \"seed\": \"#123456\"\n    }\n  ],\n  \"stops\": [\n    10,\n    5\n  ]\n}\n");
  t('palette/bad-vibrancy.json', "{\n  \"families\": [\n    {\n      \"id\": \"x\",\n      \"seed\": \"#123456\"\n    }\n  ],\n  \"vibrancy\": \"high\"\n}\n");
  t('palette/bad-color.json', "{\n  \"families\": [\n    {\n      \"id\": \"x\",\n      \"seed\": \"blue\"\n    }\n  ]\n}\n");
  t('palette/not-monotonic.json', "{\n  \"families\": [\n    {\n      \"id\": \"x\",\n      \"seed\": \"#123456\",\n      \"anchors\": [\n        {\n          \"mode\": \"light\",\n          \"stop\": 40,\n          \"color\": \"#ffffff\",\n          \"policy\": \"exact\"\n        },\n        {\n          \"mode\": \"light\",\n          \"stop\": 60,\n          \"color\": \"#000000\",\n          \"policy\": \"exact\"\n        }\n      ]\n    }\n  ],\n  \"stops\": [\n    0,\n    40,\n    60,\n    100\n  ]\n}\n");
  t('palette/empty.json', "{\n  \"families\": []\n}\n");
  t('palette/array.json', "[\n  1,\n  2\n]\n");
  t('palette/broken.json', '{"families": [\n  {"id": "x",}\n]}\n');
  t('palette/empty-file.json', '');
  t('themes/icons/registry.tsx', "import React from 'react';\nexport const appIcons = { check: React.createElement('span', null, 'ok') };\nexport const moreIcons = { close: React.createElement('span', null, 'x') };\nexport const fnIcons = { check: ({size}) => React.createElement('span', null, size) };\nexport default appIcons;\n");
  t('themes/icons/slots.tsx', "import React from 'react';\nexport const slotFns = { chevron: ({size}) => React.createElement('span', null, size) };\nexport const chevron = slotFns.chevron;\n");
  t('themes/icons/basic.ts', "import {appIcons} from './registry';\nexport default { name: 'iconic', tokens: { '--color-bg': '#fff' }, icons: appIcons };\n");
  t('themes/icons/default-import.ts', "import reg from './registry';\nexport default { name: 'iconic-default', tokens: { '--color-bg': '#fff' }, icons: reg };\n");
  t('themes/icons/namespace.ts', "import * as reg from './registry';\nexport default { name: 'iconic-ns', tokens: { '--color-bg': '#fff' }, icons: reg.appIcons };\n");
  t('themes/icons/spread.ts', "import {appIcons, moreIcons} from './registry';\nexport default { name: 'iconic-spread', tokens: { '--color-bg': '#fff' }, icons: {...appIcons, ...moreIcons} };\n");
  t('themes/icons/aliased.ts', "import {appIcons as icons} from './registry';\nconst registry = icons;\nexport const aliasedTheme = { name: 'iconic-alias', tokens: { '--color-bg': '#fff' }, icons: registry };\n");
  t('themes/icons/inline.ts', "export default { name: 'iconic-inline', tokens: { '--color-bg': '#fff' }, icons: { check: 'x' } };\n");
  t('themes/icons/mutated.ts', "import {appIcons} from './registry';\nconst mine = appIcons;\nmine.extra = 1;\nexport default { name: 'iconic-mut', tokens: { '--color-bg': '#fff' }, icons: mine };\n");
  t('themes/icons/child.ts', "import {defineTheme} from '@astryxdesign/core/theme';\nimport base from './basic';\nexport default defineTheme({ extends: base, name: 'iconic-child', tokens: { '--color-bg': '#000' } });\n");
  t('themes/icons/child-own.ts', "import {defineTheme} from '@astryxdesign/core/theme';\nimport base from './basic';\nimport {moreIcons} from './registry';\nexport default defineTheme({ extends: base, name: 'iconic-child-own', tokens: { '--color-bg': '#000' }, icons: moreIcons });\n");
  t('themes/icons/fn.ts', "import {defineTheme} from '@astryxdesign/core/theme';\nimport {fnIcons} from './registry';\nexport default defineTheme({ name: 'iconic-fn', tokens: { '--color-bg': '#fff' }, icons: fnIcons });\n");
  t('themes/icons/slots.ts', "import {defineTheme} from '@astryxdesign/core/theme';\nimport {chevron} from './slots';\nexport default defineTheme({ name: 'slotted', tokens: { '--color-bg': '#fff' }, componentIcons: { chevronDown: chevron, close: 'x-mark', spare: null } });\n");
  t('themes/icons/slots-local.ts', "import {defineTheme} from '@astryxdesign/core/theme';\nexport default defineTheme({ name: 'slotted-local', tokens: { '--color-bg': '#fff' }, componentIcons: { chevronDown: () => null } });\n");
  t('themes/icons/slots-static.mjs', "export default { name: 'slotted-static', tokens: { '--color-bg': '#fff' }, componentIcons: { chevronDown: 'chevron-down', close: null } };\n");
  t('themes/icons/slotfns.tsx', "import React from 'react';\nexport const slotFns = { chevron: ({size}) => React.createElement('span', null, size) };\nexport const chevron = slotFns.chevron;\n");
  t('themes/icons/slotted.ts', "import {defineTheme} from '@astryxdesign/core/theme';\nimport {chevron, slotFns} from './slotfns';\nexport default defineTheme({ name: 'slotted2', tokens: { '--color-bg': '#fff' }, componentIcons: { chevronDown: chevron, close: 'x-mark', spare: null, ...{ more: slotFns.chevron } } });\n");
  t('themes/icons/slotted-whole.ts', "import {defineTheme} from '@astryxdesign/core/theme';\nimport {slotFns} from './slotfns';\nexport default defineTheme({ name: 'slotted3', tokens: { '--color-bg': '#fff' }, componentIcons: slotFns });\n");

  // A selected theme family (the CLI's own family contract fixture).
  (() => { const themes=path.join(dir,'fam/themes'); const hidden=path.join(themes,'.hidden');
const write=(root,name,src)=>fs.writeFileSync(path.join(root,name),src);
const helper=path.join(dir,'node_modules/@fixture/static-helper');
fs.mkdirSync(hidden,{recursive:true}); fs.mkdirSync(helper,{recursive:true});
fs.writeFileSync(path.join(helper,'package.json'),JSON.stringify({name:'@fixture/static-helper',type:'module',exports:{import:'./index.mjs'}}));
fs.writeFileSync(path.join(helper,'index.mjs'),`export const marker=true;\n`);
for (const [root, name, source] of [[themes, 'base-icons.mjs', `import '@fixture/static-helper';export {icons} from './base-icons-leaf.mjs';\n`], [themes, 'base-icons-leaf.mjs', `export const icons={close:'base-close',menu:'base-menu'};\n`], [hidden, 'child-icons.mjs', `export const icons={close:'child-close'};\n`], [themes, 'base-indicators.mjs', `export const indicators={check:'base-check',radio:'base-radio'};\n`], [hidden, 'child-indicators.mjs', `export const indicators={check:'child-check'};\n`]]) write(root, name, source);
write(themes,'ocean.mjs',`import {defineTheme} from '@astryxdesign/core/theme';
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
});export default oceanTheme;\n`);
write(themes,'ocean-barrel.mjs',`export {oceanTheme} from './ocean.mjs';\n`);
write(hidden,'ocean-calm.mjs',`import {defineTheme} from '@astryxdesign/core/theme';
import {oceanTheme} from '../ocean-barrel.mjs';
import {icons as brandIcons} from './child-icons.mjs';
import {indicators as brandIndicators} from './child-indicators.mjs';
export const resolvedOceanCalmTheme=defineTheme({
 name:'ocean-calm',extends:oceanTheme,icons:brandIcons,indicators:brandIndicators,
 tokens:{'--color-accent':['rgb(0 150 170)','rgb(0 170 190)']},
 localTokens:{'--tide':'10px','--wash':'linear-gradient(\\nred,\\ngreen\\n)','--payload':'[one; three]'},
 components:{button:{base:{backgroundColor:'rgb(220 250 250)',borderColor:'rgb(0 0 0)',minHeight:'28px'},'variant:lagoon':{backgroundColor:'rgb(0 90 110)'}},card:{base:{padding:'24px'}}},
 adaptations:{widthBreakpoints:{md:900}},
});export const oceanCalmTheme={...resolvedOceanCalmTheme};export default oceanCalmTheme;\n`);
write(hidden,'ocean-calm-deep.mjs',`import {defineTheme} from '@astryxdesign/core/theme';\nimport {oceanCalmTheme} from './ocean-calm.mjs';\nexport const oceanCalmDeepTheme=defineTheme({name:'ocean-calm-deep',extends:oceanCalmTheme});\n`);
write(themes,'ocean-midnight.mjs',`import {oceanTheme} from './ocean.mjs';\nexport const oceanMidnightTheme={name:'ocean-midnight',extends:oceanTheme,tokens:{'--color-background-body':'rgb(4 20 32)'},components:{button:{base:{color:'rgb(235 250 255)'}}}};export default oceanMidnightTheme;\n`);

  write(themes, 'lone.mjs', `export default {name:'lone', tokens:{'--color-bg':'#fff'}};\n`);
  write(themes, 'stranger.mjs', `import {defineTheme} from '@astryxdesign/core/theme';\nexport default defineTheme({name:'stranger', extends:{name:'ghost', tokens:{}}, tokens:{'--color-bg':'#111'}});\n`);
  write(themes, 'dupe.mjs', `export default {name:'ocean', tokens:{'--color-bg':'#222'}};\n`);
  })();

  // Family registry graphs: installed, local, broken and CSS-importing registries.
  (() => {
    const pkg = (name, files) => {
      const root = path.join(dir, 'node_modules', name);
      fs.mkdirSync(root, {recursive: true});
      for (const [f, src] of Object.entries(files)) fs.writeFileSync(path.join(root, f), src);
    };
    pkg('@acme/broken-icons', {'package.json': '{"name":"@acme/broken-icons","type":"module","exports":"./index.mjs"}', 'index.mjs': "throw new Error('registry exploded');\n"});
    pkg('@acme/thin-icons', {'package.json': '{"name":"@acme/thin-icons","type":"module","exports":"./index.mjs"}', 'index.mjs': 'export const other = {};\n'});
    pkg('@acme/good-icons', {'package.json': '{"name":"@acme/good-icons","type":"module","exports":"./index.mjs"}', 'index.mjs': "export const icons = {close:'x'};\n"});
    pkg('@acme/split-icons', {'package.json': '{"name":"@acme/split-icons","exports":{"import":"./index.mjs","require":"./index.cjs"}}', 'index.mjs': "throw new Error('esm registry exploded');\n", 'index.cjs': "exports.icons = {close:'x'};\n"});
    const reg = path.join(dir, 'reg');
    fs.mkdirSync(reg, {recursive: true});
    const w = (f, src) => fs.writeFileSync(path.join(reg, f), src);
    const mk = (n, spec) => {
      w(`${n}.mjs`, `import {defineTheme} from '@astryxdesign/core/theme';\nimport {icons} from '${spec}';\nexport const rootTheme = defineTheme({name:'r-${n}', icons, tokens:{'--color-bg':'#fff'}});\nexport default rootTheme;\n`);
      w(`${n}-child.mjs`, `import base from './${n}.mjs';\nexport default {name:'c-${n}', extends: base, tokens:{'--color-bg':'#000'}};\n`);
    };
    for (const n of ['broken', 'thin', 'good', 'split']) mk(n, `@acme/${n}-icons`);
    w('local-missing-icons.mjs', 'export const nope = {};\n'); mk('lmiss', './local-missing-icons.mjs');
    w('extless-icons.mjs', 'export const icons = {};\n'); mk('extless', './extless-icons');
    w('css-icons.mjs', "import './x.css';\nexport const icons = {a:'b'};\n"); w('x.css', ''); mk('css', './css-icons.mjs');
    w('dyn-icons.mjs', "const m = './good-leaf.mjs';\nexport const load = () => import(m);\nexport const icons = {a:'b'};\n"); mk('dyn', './dyn-icons.mjs');
    w('sdyn-icons.mjs', "export const load = () => import('./good-leaf.mjs');\nexport const icons = {a:'b'};\n"); mk('sdyn', './sdyn-icons.mjs');
    w('good-leaf.mjs', "export const icons={q:'r'};\n");
    w('star-icons.mjs', "export * from './good-leaf.mjs';\n"); mk('star', './star-icons.mjs');
  })();
}
