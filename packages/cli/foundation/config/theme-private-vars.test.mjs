// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {validatePrivateVars} from './theme-private-vars.mjs';

describe('validatePrivateVars', () => {
  it('accepts guaranteed properties that the compiler expands to private variables', () => {
    expect(
      validatePrivateVars({
        name: 'correct',
        tokens: {},
        components: {
          button: {base: {borderRadius: 'var(--radius-full)'}},
          card: {base: {padding: 'var(--spacing-4)'}},
        },
      }),
    ).toEqual([]);
  });

  it('checks a defined theme’s authored input, not the private vars its motion knobs derive (spec:AST-108 FR4)', async () => {
    const {defineTheme} = await import('@astryxdesign/core/theme');
    const derived = defineTheme({
      name: 'motion-knobs',
      motion: {fast: 125, medium: 300, slow: 700, ratio: 0.75, tempo: 1.2},
      adaptations: {
        rules: [{when: {pointer: 'coarse'}, value: {motion: {fast: 100}}}],
      },
    });
    expect(
      Object.keys(derived.tokens).some(name => name.startsWith('--_')),
    ).toBe(true);
    expect(validatePrivateVars(derived)).toEqual([]);
    const authored = defineTheme({
      name: 'authored',
      motion: {tempo: 1.2},
      tokens: {'--_astryx-motion-tempo': '3'},
    });
    expect(validatePrivateVars(authored)).toHaveLength(1);
  });

  it('reports direct private keys on every authored input surface', () => {
    const errors = validatePrivateVars({
      name: 'private-inputs',
      tokens: {'--_root-token': 'red'},
      localTokens: {'--_root-local': 'blue'},
      components: {button: {base: {'--_root-component': '1px'}}},
      onDark: {
        tokens: {'--_dark-token': 'black'},
        components: {card: {base: {'--_dark-component': '2px'}}},
      },
      adaptations: {
        rules: [
          {
            when: {pointer: 'coarse'},
            value: {
              localTokens: {'--_rule-local': '3px'},
              components: {button: {base: {'--_rule-component': '4px'}}},
            },
          },
        ],
      },
    });

    for (const name of [
      '--_root-token',
      '--_root-local',
      '--_root-component',
      '--_dark-token',
      '--_dark-component',
      '--_rule-local',
      '--_rule-component',
    ]) {
      expect(errors.join('\n')).toContain(name);
    }
  });
});
