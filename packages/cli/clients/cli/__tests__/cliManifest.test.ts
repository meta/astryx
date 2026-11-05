// Copyright (c) Meta Platforms, Inc. and affiliates.

import fs from 'fs';
import path from 'path';
import {describe, it, expect} from 'vitest';
import {discoverBundledThemes} from '../../../foundation/discovery/theme-discovery.mjs';

describe('@astryxdesign/cli bundled theme descriptor validation', () => {
  it('discovers typed descriptors and their same-stem source files', () => {
    const themes = discoverBundledThemes();
    expect(themes.length).toBeGreaterThan(0);

    for (const theme of themes) {
      expect(theme.slug).toBeTruthy();
      expect(theme.displayName).toBeTruthy();
      expect(theme.docPath).toBe(
        path.join(
          theme.sourceDir,
          `${path.basename(theme.entry, path.extname(theme.entry))}.doc.mjs`,
        ),
      );
      expect(fs.existsSync(theme.docPath)).toBe(true);
      expect(fs.existsSync(path.join(theme.sourceDir, theme.entry))).toBe(true);
      for (const file of theme.files) {
        expect(fs.existsSync(path.join(theme.sourceDir, file))).toBe(true);
      }
    }
  });

  it('does not ship the obsolete central theme catalog', () => {
    expect(
      fs.existsSync(
        path.resolve('packages/cli/assets/templates/themes/manifest.json'),
      ),
    ).toBe(false);
  });
});
