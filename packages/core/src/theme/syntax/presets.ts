// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file theme/syntax/presets.ts
 * @output 12 community syntax theme presets
 *
 * Color values sourced from each theme's official VS Code extension.
 * All original themes are MIT licensed. Only color values are extracted.
 * See THIRD_PARTY_LICENSES.md for full attribution.
 *
 * @see https://github.com/meta/astryx/issues/1148
 */

import {
  defineSyntaxTheme,
  type SyntaxThemeDefinition,
} from './defineSyntaxTheme';

/** One Dark Pro (Binaryify) — MIT */
export const oneDarkPro: SyntaxThemeDefinition = defineSyntaxTheme({
  name: 'one-dark-pro',
  tokens: {
    keyword: '#c678dd',
    string: '#98c379',
    comment: '#5c6370',
    number: '#d19a66',
    function: '#61afef',
    type: '#e5c07b',
    variable: '#e06c75',
    operator: '#56b6c2',
    constant: '#d19a66',
    tag: '#e06c75',
    attribute: '#d19a66',
    property: '#e06c75',
    punctuation: '#abb2bf',
    background: '#282c34',
  },
});

/** Dracula (Zeno Rocha) — MIT */
export const dracula: SyntaxThemeDefinition = defineSyntaxTheme({
  name: 'dracula',
  tokens: {
    keyword: '#ff79c6',
    string: '#f1fa8c',
    comment: '#6272a4',
    number: '#bd93f9',
    function: '#50fa7b',
    type: '#8be9fd',
    variable: '#f8f8f2',
    operator: '#ff79c6',
    constant: '#bd93f9',
    tag: '#ff79c6',
    attribute: '#50fa7b',
    property: '#66d9ef',
    punctuation: '#f8f8f2',
    background: '#282a36',
  },
});

/** Monokai (Wimer Hazenberg, VS Code built-in) — MIT */
export const monokai: SyntaxThemeDefinition = defineSyntaxTheme({
  name: 'monokai',
  tokens: {
    keyword: '#f92672',
    string: '#e6db74',
    comment: '#75715e',
    number: '#ae81ff',
    function: '#a6e22e',
    type: '#66d9ef',
    variable: '#f8f8f2',
    operator: '#f92672',
    constant: '#ae81ff',
    tag: '#f92672',
    attribute: '#a6e22e',
    property: '#66d9ef',
    punctuation: '#f8f8f2',
    background: '#272822',
  },
});

/** Nord (Arctic Ice Studio / Sven Greb) — MIT */
export const nord: SyntaxThemeDefinition = defineSyntaxTheme({
  name: 'nord',
  tokens: {
    keyword: '#81a1c1',
    string: '#a3be8c',
    comment: '#616e88',
    number: '#b48ead',
    function: '#88c0d0',
    type: '#8fbcbb',
    variable: '#d8dee9',
    operator: '#81a1c1',
    constant: '#b48ead',
    tag: '#81a1c1',
    attribute: '#8fbcbb',
    property: '#88c0d0',
    punctuation: '#d8dee9',
    background: '#2e3440',
  },
});

/** Tokyo Night (enkia) — MIT */
export const tokyoNight: SyntaxThemeDefinition = defineSyntaxTheme({
  name: 'tokyo-night',
  tokens: {
    keyword: '#9d7cd8',
    string: '#9ece6a',
    comment: '#565f89',
    number: '#ff9e64',
    function: '#7aa2f7',
    type: '#2ac3de',
    variable: '#c0caf5',
    operator: '#89ddff',
    constant: '#ff9e64',
    tag: '#f7768e',
    attribute: '#bb9af7',
    property: '#73daca',
    punctuation: '#9abdf5',
    background: '#1a1b26',
  },
});

/** Catppuccin Mocha (Catppuccin contributors) — MIT */
export const catppuccinMocha: SyntaxThemeDefinition = defineSyntaxTheme({
  name: 'catppuccin-mocha',
  tokens: {
    keyword: '#cba6f7',
    string: '#a6e3a1',
    comment: '#6c7086',
    number: '#fab387',
    function: '#89b4fa',
    type: '#f9e2af',
    variable: '#cdd6f4',
    operator: '#89dceb',
    constant: '#fab387',
    tag: '#f38ba8',
    attribute: '#f9e2af',
    property: '#94e2d5',
    punctuation: '#bac2de',
    background: '#1e1e2e',
  },
});

/** GitHub Light (GitHub Primer team) — MIT */
export const githubLight: SyntaxThemeDefinition = defineSyntaxTheme({
  name: 'github-light',
  tokens: {
    keyword: '#cf222e',
    string: '#0a3069',
    comment: '#6e7781',
    number: '#0550ae',
    function: '#8250df',
    type: '#953800',
    variable: '#24292f',
    operator: '#cf222e',
    constant: '#0550ae',
    tag: '#116329',
    attribute: '#0550ae',
    property: '#0550ae',
    punctuation: '#24292f',
    background: '#ffffff',
  },
});

/** GitHub Dark (GitHub Primer team) — MIT */
export const githubDark: SyntaxThemeDefinition = defineSyntaxTheme({
  name: 'github-dark',
  tokens: {
    keyword: '#ff7b72',
    string: '#a5d6ff',
    comment: '#8b949e',
    number: '#79c0ff',
    function: '#d2a8ff',
    type: '#ffa657',
    variable: '#e6edf3',
    operator: '#ff7b72',
    constant: '#79c0ff',
    tag: '#7ee787',
    attribute: '#79c0ff',
    property: '#79c0ff',
    punctuation: '#c9d1d9',
    background: '#0d1117',
  },
});

/** Solarized Light (Ethan Schoonover) — MIT */
export const solarizedLight: SyntaxThemeDefinition = defineSyntaxTheme({
  name: 'solarized-light',
  tokens: {
    keyword: '#859900',
    string: '#2aa198',
    comment: '#93a1a1',
    number: '#d33682',
    function: '#268bd2',
    type: '#b58900',
    variable: '#657b83',
    operator: '#859900',
    constant: '#cb4b16',
    tag: '#268bd2',
    attribute: '#b58900',
    property: '#268bd2',
    punctuation: '#586e75',
    background: '#fdf6e3',
  },
});

/** One Light (GitHub / Atom team) — MIT */
export const oneLight: SyntaxThemeDefinition = defineSyntaxTheme({
  name: 'one-light',
  tokens: {
    keyword: '#a626a4',
    string: '#50a14f',
    comment: '#a0a1a7',
    number: '#986801',
    function: '#4078f2',
    type: '#c18401',
    variable: '#e45649',
    operator: '#0184bc',
    constant: '#986801',
    tag: '#e45649',
    attribute: '#986801',
    property: '#e45649',
    punctuation: '#383a42',
    background: '#fafafa',
  },
});

/** Catppuccin Latte (Catppuccin contributors) — MIT */
export const catppuccinLatte: SyntaxThemeDefinition = defineSyntaxTheme({
  name: 'catppuccin-latte',
  tokens: {
    keyword: '#8839ef',
    string: '#40a02b',
    comment: '#9ca0b0',
    number: '#fe640b',
    function: '#1e66f5',
    type: '#df8e1d',
    variable: '#4c4f69',
    operator: '#179299',
    constant: '#fe640b',
    tag: '#d20f39',
    attribute: '#df8e1d',
    property: '#179299',
    punctuation: '#6c6f85',
    background: '#eff1f5',
  },
});

/** Tokyo Night Light (enkia) — MIT */
export const tokyoNightLight: SyntaxThemeDefinition = defineSyntaxTheme({
  name: 'tokyo-night-light',
  tokens: {
    keyword: '#8c4351',
    string: '#485e30',
    comment: '#9699a3',
    number: '#965027',
    function: '#34548a',
    type: '#166775',
    variable: '#343b58',
    operator: '#34548a',
    constant: '#965027',
    tag: '#8c4351',
    attribute: '#8f5e15',
    property: '#33635c',
    punctuation: '#343b58',
    background: '#d5d6db',
  },
});

/** All dark syntax theme presets */
export const darkSyntaxPresets = [
  oneDarkPro,
  dracula,
  monokai,
  nord,
  tokyoNight,
  catppuccinMocha,
  githubDark,
] as const;

/** All light syntax theme presets */
export const lightSyntaxPresets = [
  githubLight,
  solarizedLight,
  oneLight,
  catppuccinLatte,
  tokyoNightLight,
] as const;

/** All syntax theme presets */
export const allSyntaxPresets = [
  ...darkSyntaxPresets,
  ...lightSyntaxPresets,
] as const;
