// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The component and hook text renderers add no non-ASCII characters of
 * their own: given ASCII-only docs, every view they produce is plain ASCII.
 */

import {describe, it, expect} from 'vitest';
import {
  formatBrief,
  formatCompact,
  formatFull,
  formatProps,
} from './component-format.mjs';
import {
  formatHookBrief,
  formatHookCompact,
  formatHookFull,
  formatHookParams,
} from './hook-format.mjs';

const NON_ASCII = /[\u0080-\uffff]/g;

/** @param {string} out @returns {string[]} */
const nonAscii = out => out.match(NON_ASCII) ?? [];

// Every optional field left empty and every optional path taken, so each
// placeholder, separator, and arrow the renderers emit shows up at least once.
const componentDoc = {
  name: 'Widget',
  description: 'A widget for tests.',
  props: [
    {name: 'variant', type: "'solid' | 'ghost'", description: 'Look.'},
    {name: 'label', type: 'string', description: 'Label.', required: true},
    {name: 'disabled', type: 'boolean', description: 'Disables it.'},
    {name: 'tone', type: 'string', description: 'Tone.'},
  ],
  theming: {
    vars: [{name: '--widget-gap', default: '8px', description: 'Gap.'}],
    derived: [
      {property: 'padding', expand: 'container'},
      {property: 'radius', vars: ['--widget-radius']},
    ],
    targets: [
      {className: 'astryx-widget'},
      {className: 'astryx-widget-v2', visualProps: ['variant']},
    ],
  },
};

const hookDoc = {
  name: 'useWidget',
  importPath: '@astryxdesign/core/useWidget',
  usage: {description: 'Widget behavior.'},
  params: [
    {name: 'options', type: 'object', description: 'Options.', required: true},
    {name: 'delay', type: 'number', description: 'Delay.'},
  ],
  returns: [{name: 'open', type: 'boolean', description: 'Open state.'}],
};

describe('component text output is ASCII', () => {
  it.each([
    ['formatFull', () => formatFull(componentDoc)],
    ['formatCompact', () => formatCompact(componentDoc, 'Widget')],
    [
      'formatBrief',
      () => formatBrief(componentDoc, 'Widget', '@astryxdesign/core/Widget'),
    ],
    ['formatProps', () => formatProps(componentDoc, 'Widget')],
  ])('%s', (_name, render) => {
    expect(nonAscii(render())).toEqual([]);
  });
});

describe('hook text output is ASCII', () => {
  it.each([
    ['formatHookFull', () => formatHookFull(hookDoc)],
    ['formatHookCompact', () => formatHookCompact(hookDoc, hookDoc.importPath)],
    ['formatHookBrief', () => formatHookBrief(hookDoc)],
    ['formatHookParams', () => formatHookParams(hookDoc)],
  ])('%s', (_name, render) => {
    expect(nonAscii(render())).toEqual([]);
  });
});
