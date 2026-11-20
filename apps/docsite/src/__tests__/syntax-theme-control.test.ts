// Copyright (c) Meta Platforms, Inc. and affiliates.

import {allSyntaxPresets} from '@astryxdesign/core/theme/syntax';
import {describe, expect, it} from 'vitest';
import {
  NO_SYNTAX_THEME,
  selectedSyntaxTheme,
  syntaxThemeChoices,
  syntaxPresetName,
  syntaxThemeFor,
} from '../components/component-detail/syntaxThemeChoices';

describe('the playground syntax theme control', () => {
  it('shows an unset optional prop as None, and None sends nothing', () => {
    expect(syntaxThemeChoices(false)[0].value).toBe(NO_SYNTAX_THEME);
    expect(selectedSyntaxTheme(undefined, false)).toBe(NO_SYNTAX_THEME);
    expect(syntaxThemeFor(NO_SYNTAX_THEME)).toBeUndefined();
  });

  it('offers no None for a required prop, which shows the first preset', () => {
    expect(
      syntaxThemeChoices(true).some(choice => choice.value === NO_SYNTAX_THEME),
    ).toBe(false);
    expect(selectedSyntaxTheme(undefined, true)).toBe(allSyntaxPresets[0].name);
  });

  it('shows and sends a chosen preset', () => {
    const preset = allSyntaxPresets[1];
    expect(selectedSyntaxTheme(preset, false)).toBe(preset.name);
    expect(syntaxThemeFor(preset.name)).toBe(preset);
  });

  it('names the preset a value is', () => {
    const dracula = allSyntaxPresets.find(theme => theme.name === 'dracula');
    const oneDarkPro = allSyntaxPresets.find(
      theme => theme.name === 'one-dark-pro',
    );
    expect(syntaxPresetName(dracula)).toBe('dracula');
    expect(syntaxPresetName(oneDarkPro)).toBe('one-dark-pro');
    expect(syntaxPresetName({name: 'dracula'})).toBeNull();
  });
});
