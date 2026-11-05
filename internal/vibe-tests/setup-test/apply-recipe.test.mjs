// Copyright (c) Meta Platforms, Inc. and affiliates.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {copyFixture, FIXTURE_IDS} from '../src/fixture-suite.mjs';
import {RECIPES} from './apply-recipe.mjs';

const temporaryDirectories = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

function copiedFixture(fixtureId) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-recipe-test-'));
  temporaryDirectories.push(parent);
  const fixture = path.join(parent, fixtureId);
  copyFixture(fixtureId, fixture);
  return fixture;
}

describe('deterministic setup recipes', () => {
  it.each(FIXTURE_IDS)(
    'applies the candidate recipe to canonical fixture %s',
    fixtureId => {
      const fixture = copiedFixture(fixtureId);
      RECIPES['layered-in-place'](fixture, {mode: 'light'});

      expect(
        fs.readFileSync(path.join(fixture, 'src', 'index.css'), 'utf8'),
      ).toContain(
        '@layer reset, theme, base, astryx-base, astryx-theme, components, utilities;',
      );
      expect(
        fs.readFileSync(path.join(fixture, 'src', 'main.tsx'), 'utf8'),
      ).toContain('<Theme theme={neutralTheme} mode="light">');
    },
  );

  it.each(Object.keys(RECIPES))(
    'keeps recipe %s compatible with the shared fixture entrypoints',
    recipeId => {
      const fixture = copiedFixture('tailwind-v4-control');
      RECIPES[recipeId](fixture, {mode: 'light'});
      expect(
        fs.readFileSync(path.join(fixture, 'src', 'main.tsx'), 'utf8'),
      ).toContain('data-setup-system-probe');
    },
  );

  it('rejects a fixture whose Tailwind entry has drifted', () => {
    const fixture = copiedFixture('tailwind-v4-control');
    const cssFile = path.join(fixture, 'src', 'index.css');
    fs.writeFileSync(
      cssFile,
      fs
        .readFileSync(cssFile, 'utf8')
        .replace("@import 'tailwindcss';", "@import 'other.css';"),
    );

    expect(() => RECIPES['layered-in-place'](fixture, {mode: 'light'})).toThrow(
      /fixture no longer starts/,
    );
  });
});
