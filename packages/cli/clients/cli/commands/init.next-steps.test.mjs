// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Regression tests for `astryx init` app-theme next steps.
 *
 * The guidance follows the generated-module workflow: base CSS once, add an
 * installed theme, import the generated record once, extend to customize, and
 * eject only to make an independent source fork.
 */

import {describe, it, expect} from 'vitest';
import {getNextSteps} from '../../../api/init/init.mjs';

describe('init Next steps theme guidance', () => {
  const text = getNextSteps('npx astryx').join('\n');

  it('mentions the base CSS imports so the app is not left unstyled', () => {
    expect(text).toContain("'@astryxdesign/core/reset.css'");
    expect(text).toContain("'@astryxdesign/core/astryx.css'");
  });

  it('adds an installed theme through the CLI', () => {
    expect(text).toContain('npm install @astryxdesign/theme-neutral');
    expect(text).toContain('npx astryx theme add neutral');
  });

  it('wires the generated theme record once', () => {
    expect(text).toContain("{ themes, defaultThemeSlug } from './astryx-themes'");
    expect(text).toContain('themes[defaultThemeSlug]');
  });

  it('names extension for customization and eject only for a source fork', () => {
    expect(text).toContain('Extend an imported theme');
    expect(text).toContain('npx astryx theme eject <slug>');
    expect(text).toContain('only to fork source');
  });

  it('does not teach a direct package theme import', () => {
    expect(text).not.toContain("from '@astryxdesign/theme-neutral");
  });
});
