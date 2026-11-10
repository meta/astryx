// Theme sources for `theme build` cases: plain objects, defineTheme modules,
// custom variants, fonts, adaptations, media surfaces, private vars, bad
// names, broken modules, stale outputs, and a theme under src/. The app has
// Core's runtime dependencies so Core's theme entry loads.
import * as fs from 'node:fs';
import * as path from 'node:path';

const RUNTIME = ['react', 'react-dom', 'scheduler', '@stylexjs/stylex', 'styleq', 'invariant', 'css-mediaquery'];

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
}
