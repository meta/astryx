// Copyright (c) Meta Platforms, Inc. and affiliates.

import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {
  SWIFT_IOS_STRINGS_DIR,
  renderSwiftIOSStrings,
} from '../../scripts/swift-ios-strings.mjs';

describe('swift-ios localized strings', () => {
  it("speaks core's catalog message in each locale", () => {
    const files = renderSwiftIOSStrings();
    expect(files['en.lproj/Localizable.strings']).toContain(
      '"@astryx.button.loading" = "Loading";',
    );
    expect(files['de.lproj/Localizable.strings']).toContain(
      '"@astryx.button.loading" = "Wird geladen";',
    );
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining([
        'pt-BR.lproj/Localizable.strings',
        'pt-PT.lproj/Localizable.strings',
        'zh-Hans.lproj/Localizable.strings',
        'nb.lproj/Localizable.strings',
      ]),
    );
    expect(Object.keys(files).some(name => name.startsWith('pseudo'))).toBe(
      false,
    );
  });

  it('carries the field messages TextInput speaks, falling back to English where a catalog lacks one', () => {
    const files = renderSwiftIOSStrings();
    const english = files['en.lproj/Localizable.strings'] ?? '';
    for (const line of [
      '"@astryx.field.optional" = "Optional";',
      '"@astryx.field.required" = "Required";',
      '"@astryx.textInput.clearLabel" = "Clear {label}";',
      '"@astryx.spinner.loading" = "Loading";',
      '"@astryx.input.statusButton.error" = "Error details";',
    ]) {
      expect(english).toContain(line);
    }
    // af-ZA has no clear tip yet; the app reads the English value in code.
    expect(files['af.lproj/Localizable.strings']).not.toContain(
      '@astryx.inputClearButton.tooltip',
    );
  });

  it("keeps the committed files in sync with core's catalogs", () => {
    const files = renderSwiftIOSStrings();
    const committed = fs
      .readdirSync(SWIFT_IOS_STRINGS_DIR)
      .map(dir => `${dir}/Localizable.strings`)
      .sort();
    expect(
      committed,
      'Localizable.strings files are stale; run pnpm -F @astryxdesign/native generate:swift-ios',
    ).toEqual(Object.keys(files).sort());
    for (const [relative, text] of Object.entries(files)) {
      expect(
        fs.readFileSync(path.join(SWIFT_IOS_STRINGS_DIR, relative), 'utf8'),
      ).toBe(text);
    }
  });
});
