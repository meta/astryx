#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Apply deterministic setup recipes to a copied canonical fixture.
 *
 * These recipes verify the measurement mechanism without invoking an executor.
 * Every edit asserts that the shared React + Vite + Tailwind fixture shape is
 * still present so drift fails loudly.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const CSS = path.join('src', 'index.css');
const MAIN = path.join('src', 'main.tsx');

const read = (app, relative) =>
  fs.readFileSync(path.join(app, relative), 'utf8');
const write = (app, relative, source) =>
  fs.writeFileSync(path.join(app, relative), source);

function edit(app, relative, transform) {
  const before = read(app, relative);
  const after = transform(before);
  if (after === before) {
    throw new Error(`recipe edit did not apply: ${relative}`);
  }
  write(app, relative, after);
}

const ASTRYX_IMPORTS = [
  "@import '@astryxdesign/core/reset.css';",
  "@import '@astryxdesign/core/astryx.css';",
  "@import '@astryxdesign/theme-neutral/theme.css';",
];

function documentedTailwindBlock({bridge}) {
  return [
    '@layer reset, theme, base, astryx-base, astryx-theme, components, utilities;',
    '',
    "@import 'tailwindcss/theme.css' layer(theme);",
    "@import 'tailwindcss/preflight.css' layer(base);",
    ...ASTRYX_IMPORTS,
    ...(bridge ? ["@import '@astryxdesign/core/tailwind-theme.css';"] : []),
    "@import 'tailwindcss/utilities.css' layer(utilities);",
  ].join('\n');
}

function replaceTailwindEntry(app, block) {
  edit(app, CSS, css => {
    if (!/@import ['"]tailwindcss['"];/.test(css)) {
      throw new Error("fixture no longer starts from `@import 'tailwindcss';`");
    }
    return css.replace(/@import ['"]tailwindcss['"];/, block);
  });
}

function addThemeAndProbe(app, {mode}) {
  edit(app, MAIN, source =>
    source
      .replace(
        "import App from './App.tsx';",
        [
          "import {Button as AstryxButton} from '@astryxdesign/core/Button';",
          "import {Theme} from '@astryxdesign/core/theme';",
          "import {neutralTheme} from '@astryxdesign/theme-neutral/built';",
          "import App from './App.tsx';",
        ].join('\n'),
      )
      .replace(
        '    <App />',
        [
          `    <Theme theme={neutralTheme} mode="${mode}">`,
          '      <App />',
          '      <div data-setup-system-probe>',
          '        <AstryxButton label="Deploy" variant="primary" />',
          '      </div>',
          '    </Theme>',
        ].join('\n'),
      ),
  );
}

function appendAtEnd(app) {
  edit(app, CSS, css => {
    if (!/@import ['"]tailwindcss['"];/.test(css)) {
      throw new Error("fixture no longer starts from `@import 'tailwindcss';`");
    }
    return `${css}\n${[
      '/* Astryx */',
      '@layer reset, theme, base, astryx-base, astryx-theme, components, utilities;',
      ...ASTRYX_IMPORTS,
      '',
    ].join('\n')}`;
  });
}

export const RECIPES = {
  'docs-verbatim': (app, options) => {
    replaceTailwindEntry(app, documentedTailwindBlock({bridge: true}));
    addThemeAndProbe(app, options);
  },
  'docs-no-bridge': (app, options) => {
    replaceTailwindEntry(app, documentedTailwindBlock({bridge: false}));
    addThemeAndProbe(app, options);
  },
  'appended-at-end': (app, options) => {
    appendAtEnd(app);
    addThemeAndProbe(app, options);
  },
  'layered-in-place': (app, options) => {
    edit(app, CSS, css => {
      if (!/@import ['"]tailwindcss['"];/.test(css)) {
        throw new Error(
          "fixture no longer starts from `@import 'tailwindcss';`",
        );
      }
      return css.replace(
        /@import ['"]tailwindcss['"];/,
        [
          '@layer reset, theme, base, astryx-base, astryx-theme, components, utilities;',
          '',
          "@import 'tailwindcss';",
          ...ASTRYX_IMPORTS,
        ].join('\n'),
      );
    });
    addThemeAndProbe(app, options);
  },
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const get = name => {
    const index = args.indexOf(`--${name}`);
    return index === -1 ? undefined : args[index + 1];
  };
  const app = path.resolve(get('app') ?? '.');
  const recipeId = get('recipe');
  const recipe = RECIPES[recipeId];
  if (!recipe) {
    console.error(
      `Unknown recipe: ${recipeId}. Known: ${Object.keys(RECIPES).join(', ')}`,
    );
    process.exit(2);
  }
  recipe(app, {mode: get('mode') ?? 'light'});
  console.log(`applied ${recipeId} to ${app}`);
}
