// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file themeMotion.test.ts
 * @input vitest, the theme motion knobs, defineTheme and expandMotionScale
 * @output Checks `spec:AST-108` FR1, FR2, FR5 and FR6's resolver: today's
 *   tokens at the defaults, each tempo bound and the clamp, each character's
 *   curves with exits unchanged, `reducedMotion` kept internal, a `MotionScaleConfig` that
 *   renders exactly as before and wins over `tempo`, explicit tokens winning
 *   over both, adaptation rules setting the knobs, and `resolveThemeMotion`
 * @position Testing; validates themeMotion.ts and its use in defineTheme
 */

import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {defineTheme} from './defineTheme';
import {generateAdaptationCSS} from './generateThemeRules';
import {expandMotionScale} from './expandMotionScale';
import {
  CHARACTER_EASE,
  expandThemeMotion,
  resolveMotionKnobs,
  resolveThemeMotion,
  type ThemeMotionKnobs,
} from './themeMotion';
import {durationDefaults, easeDefaults} from './tokens.stylex';

const TODAY_MS = [130, 175, 230, 310, 410, 550, 730, 975, 1300];
const STANDARD = 'cubic-bezier(0.24, 1, 0.4, 1)';

function durationsMs(tokens: Readonly<Record<string, string>>): number[] {
  return Object.keys(durationDefaults).map(name =>
    Number.parseFloat(tokens[name]),
  );
}

describe('the motion knobs (spec:AST-108 FR1)', () => {
  it('default to tempo 1, standard and system', () => {
    expect(resolveMotionKnobs(undefined)).toEqual({
      tempo: 1,
      character: 'standard',
      reducedMotion: 'system',
      tempoIsSet: false,
    });
  });

  it('clamp tempo to 0.75–1.5 and ignore a value that is no number', () => {
    expect(resolveMotionKnobs({tempo: 0.5}).tempo).toBe(0.75);
    expect(resolveMotionKnobs({tempo: 2}).tempo).toBe(1.5);
    expect(resolveMotionKnobs({tempo: 1.2}).tempo).toBe(1.2);
    expect(resolveMotionKnobs({tempo: Number.NaN})).toMatchObject({
      tempo: 1,
      tempoIsSet: false,
    });
  });

  it('resolve reducedMotion to system, which no theme sets until always ships', () => {
    expect(resolveMotionKnobs({}).reducedMotion).toBe('system');
    // @ts-expect-error reducedMotion is not part of the public motion type.
    const knobs: ThemeMotionKnobs = {reducedMotion: 'system'};
    expect(resolveMotionKnobs(knobs).reducedMotion).toBe('system');
  });
});

describe('the CSS motion tokens (spec:AST-108 FR2)', () => {
  it('are today\u2019s at the defaults', () => {
    expect(expandThemeMotion({})).toEqual({});
    const explicit = expandThemeMotion({
      tempo: 1,
      character: 'standard',
    });
    expect(durationsMs(explicit)).toEqual(TODAY_MS);
    expect(explicit['--ease-entrance']).toBe(STANDARD);
    expect(explicit['--ease-move']).toBe(STANDARD);
    const motion = resolveThemeMotion({});
    expect(durationsMs(motion.durations)).toEqual(TODAY_MS);
    expect(motion.easings).toEqual({
      '--ease-standard': STANDARD,
      '--ease-entrance': STANDARD,
      '--ease-move': STANDARD,
    });
    expect(easeDefaults['--ease-entrance']).toBe(STANDARD);
    expect(easeDefaults['--ease-move']).toBe(STANDARD);
  });

  it.each([0.75, 1.2, 1.5])(
    'scale every duration by tempo %s, to the ms',
    tempo => {
      const tokens = expandThemeMotion({tempo});
      expect(durationsMs(tokens)).toEqual(
        TODAY_MS.map(ms => Math.round(ms * tempo)),
      );
    },
  );

  it('clamp the scale: a tempo of 3 is 1.5', () => {
    expect(durationsMs(expandThemeMotion({tempo: 3}))).toEqual(
      TODAY_MS.map(ms => Math.round(ms * 1.5)),
    );
  });

  it.each(['crisp', 'expressive'] as const)(
    'set the entrance and move curves at %s, and leave the standard and exit curves alone',
    character => {
      const tokens = expandThemeMotion({character});
      expect(tokens['--ease-entrance']).toBe(CHARACTER_EASE[character]);
      expect(tokens['--ease-move']).toBe(CHARACTER_EASE[character]);
      expect(tokens).not.toHaveProperty('--ease-standard');
      expect(tokens).not.toHaveProperty('--ease-exit');
      expect(
        Object.keys(tokens).some(name => name.startsWith('--duration')),
      ).toBe(false);
    },
  );

  it('keep entrances and moves on a theme\u2019s own standard curve at standard', () => {
    const easing = 'cubic-bezier(0.2, 0, 0, 1)';
    const tokens = expandThemeMotion({
      fast: 175,
      medium: 410,
      ratio: 0.75,
      easing,
    });
    expect(tokens['--ease-standard']).toBe(easing);
    expect(tokens['--ease-entrance']).toBe(easing);
    expect(tokens['--ease-move']).toBe(easing);
  });
});

describe('existing motion configuration (spec:AST-108 FR5)', () => {
  const scale = {fast: 100, medium: 250, ratio: 0.75};

  it('a MotionScaleConfig generates exactly what it did', () => {
    expect(expandThemeMotion(scale)).toEqual(expandMotionScale(scale));
  });

  it('implies no tempo for the animator', () => {
    expect(resolveMotionKnobs(scale).tempoIsSet).toBe(false);
  });

  it('its durations win over tempo; tempo scales the durations it leaves out', () => {
    const tokens = expandThemeMotion({...scale, tempo: 1.5});
    expect(tokens).toMatchObject(expandMotionScale(scale));
    // No slow band in the scale: tempo scales today\u2019s.
    expect(tokens['--duration-slow']).toBe(`${Math.round(975 * 1.5)}ms`);
  });

  it('explicit tokens win over the knobs', () => {
    const theme = defineTheme({
      name: 'Knobbed',
      motion: {tempo: 1.5, character: 'crisp'},
      tokens: {'--duration-medium': '300ms', '--ease-entrance': 'linear'},
    });
    expect(theme.tokens['--duration-medium']).toBe('300ms');
    expect(theme.tokens['--ease-entrance']).toBe('linear');
    expect(theme.tokens['--duration-fast']).toBe(`${Math.round(175 * 1.5)}ms`);
    expect(theme.tokens['--ease-move']).toBe(CHARACTER_EASE.crisp);
  });

  it('a child theme keeps each knob it leaves out and can set one back to its default', () => {
    const base = defineTheme({
      name: 'SlowCrisp',
      motion: {tempo: 0.8, character: 'crisp'},
    });
    const quicker = defineTheme({
      name: 'SlowCrispChild',
      extends: base,
      motion: {tempo: 1.2},
    });
    expect(quicker.tokens['--duration-medium']).toBe(
      `${Math.round(410 * 1.2)}ms`,
    );
    expect(quicker.tokens['--ease-entrance']).toBe(CHARACTER_EASE.crisp);
    const reset = defineTheme({
      name: 'SlowCrispReset',
      extends: base,
      motion: {tempo: 1, character: 'standard'},
    });
    expect(reset.tokens['--duration-medium']).toBe('410ms');
    expect(reset.tokens['--ease-entrance']).toBe(STANDARD);
  });

  it('a partial duration scale beside a knob is refused, not dropped', () => {
    for (const motion of [
      {fast: 100, tempo: 1.2},
      {fast: 100, medium: 250, slow: 700, tempo: 1},
      {easing: 'linear', character: 'standard' as const},
    ]) {
      expect(() => defineTheme({name: 'Partial', motion})).toThrow(
        /must supply `fast`, `medium`, and `ratio`/,
      );
    }
    // A field the child leaves out may come from its base.
    const base = defineTheme({
      name: 'ScaleBase',
      motion: {fast: 175, medium: 410, ratio: 0.75},
    });
    const child = defineTheme({
      name: 'ScaleChild',
      extends: base,
      motion: {fast: 100, tempo: 1.2},
    });
    expect(child.tokens['--duration-fast']).toBe('100ms');
  });

  it('a theme with no motion writes no motion token, so it renders as before', () => {
    const plain = defineTheme({name: 'Plain'});
    expect(
      Object.keys(plain.tokens).filter(
        name => name.startsWith('--duration') || name.startsWith('--ease'),
      ),
    ).toEqual([]);
  });

  it('an adaptation rule sets tempo and character like any motion value', () => {
    const theme = defineTheme({
      name: 'Adaptive',
      adaptations: {
        rules: [{when: {pointer: 'coarse'}, value: {motion: {tempo: 0.8}}}],
      },
    });
    const css = JSON.stringify(theme);
    expect(css).toContain(`${Math.round(410 * 0.8)}ms`);
  });

  it('an adaptation rule cannot set reducedMotion, a theme-wide setting', () => {
    expect(() =>
      defineTheme({
        name: 'Bad',
        adaptations: {
          rules: [
            {
              when: {pointer: 'coarse'},
              value: {
                motion: {reducedMotion: 'system'} as never,
              },
            },
          ],
        },
      }),
    ).toThrow(/reducedMotion is a theme-wide setting/);
  });
});

describe('resolveThemeMotion (spec:AST-108 FR6)', () => {
  it('returns the knobs, durations and easings with explicit tokens applied', () => {
    const motion = resolveThemeMotion({
      motion: {tempo: 1.2, character: 'expressive'},
      tokens: {'--duration-fast': '200ms'},
    });
    expect(motion.knobs).toEqual({
      tempo: 1.2,
      character: 'expressive',
      reducedMotion: 'system',
      tempoIsSet: true,
    });
    expect(motion.durations['--duration-fast']).toBe('200ms');
    expect(motion.durations['--duration-medium']).toBe(
      `${Math.round(410 * 1.2)}ms`,
    );
    expect(motion.easings['--ease-entrance']).toBe(CHARACTER_EASE.expressive);
    expect(motion.easings['--ease-standard']).toBe(STANDARD);
  });

  it('resolves tokens written as references through the theme\u2019s tokens (architecture:theme-tokens INV6)', () => {
    const motion = resolveThemeMotion({
      tokens: {
        '--duration-fast': '90ms',
        '--duration-medium': 'var(--duration-fast)',
        '--duration-slow': 'var(--duration-unknown, 700ms)',
        '--ease-standard': 'linear',
        '--ease-entrance': 'var(--ease-standard)',
      },
    });
    expect(motion.durations['--duration-medium']).toBe('90ms');
    expect(motion.durations['--duration-slow']).toBe('700ms');
    expect(motion.easings['--ease-entrance']).toBe('linear');
    expect(motion.easings['--ease-move']).toBe('linear');
    expect(JSON.stringify(motion)).not.toContain('var(');
  });

  it('resolves a reference to the theme\u2019s own local token', () => {
    const motion = resolveThemeMotion({
      tokens: {'--duration-medium': 'var(--brand-beat)'},
      localTokens: {'--brand-beat': '333ms'},
    });
    expect(motion.durations['--duration-medium']).toBe('333ms');
  });
});

describe('a layer\u2019s own durations reach the busy loops under an enclosing tempo (spec:AST-108 FR4)', () => {
  it('a theme with a duration scale and no tempo writes the loops\u2019 copies of its durations', () => {
    const theme = defineTheme({
      name: 'ScaledNested',
      motion: {fast: 100, medium: 250, ratio: 0.75},
    });
    for (const name of ['--duration-fast', '--duration-medium-max']) {
      expect(
        theme.tokens[
          name.replace('--duration-', '--_astryx-pre-tempo-duration-')
        ],
      ).toBe(theme.tokens[name]);
    }
  });

  it('an explicit duration with no tempo writes its copy too', () => {
    const theme = defineTheme({
      name: 'ExplicitNested',
      tokens: {'--duration-slow': '800ms'},
    });
    expect(theme.tokens['--_astryx-pre-tempo-duration-slow']).toBe('800ms');
  });

  it('an adaptation rule\u2019s own durations write their copies', () => {
    const css = generateAdaptationCSS(
      defineTheme({
        name: 'AdaptiveDurations',
        adaptations: {
          rules: [
            {
              when: {pointer: 'coarse'},
              value: {tokens: {'--duration-medium': '300ms'}},
            },
          ],
        },
      }),
    ).component;
    expect(css).toContain('--_astryx-pre-tempo-duration-medium: 300ms');
  });
});

describe('a child of an installed built theme (spec:AST-108 FR5, INV15)', () => {
  it('resolves base first, then generated, as a child of a defined theme does', () => {
    const base = defineTheme({
      name: 'BuiltBase',
      motion: {tempo: 0.8},
      tokens: {'--duration-medium': '333ms', '--ease-entrance': 'linear'},
    });
    // A built module carries the resolved tokens and the axes, not the input.
    const built = {...base, __inputTokens: undefined};
    const child = defineTheme({
      name: 'BuiltChild',
      extends: built,
      motion: {tempo: 1.2},
    });
    // The child's tempo regenerates every duration over the base's tokens,
    // its explicit one included (`architecture:theme-authoring-contract`).
    expect(child.tokens['--duration-medium']).toBe(
      `${Math.round(410 * 1.2)}ms`,
    );
    expect(child.tokens['--duration-fast']).toBe(`${Math.round(175 * 1.2)}ms`);
    // It generates no entrance curve without a character, so the base's stays.
    expect(child.tokens['--ease-entrance']).toBe('linear');
  });
});

describe('an explicit --ease-standard (spec:AST-108 FR2)', () => {
  it('is what --ease-entrance and --ease-move equal at standard, in the tokens and resolveThemeMotion alike', () => {
    const curve = 'cubic-bezier(0.3, 0, 0.2, 1)';
    for (const motion of [
      undefined,
      {character: 'standard' as const},
      {tempo: 1.2},
    ]) {
      const theme = defineTheme({
        name: 'OwnStandard',
        motion,
        tokens: {'--ease-standard': curve},
      });
      expect(theme.tokens['--ease-entrance'], JSON.stringify(motion)).toBe(
        curve,
      );
      expect(theme.tokens['--ease-move'], JSON.stringify(motion)).toBe(curve);
      expect(resolveThemeMotion(theme).easings['--ease-entrance']).toBe(curve);
    }
    // A child, and a rule, that set 'standard' match the --ease-standard
    // beneath them: the base's, or the theme's.
    const base = defineTheme({
      name: 'EaseBase',
      tokens: {'--ease-standard': curve},
    });
    const standard = {character: 'standard' as const};
    const child = defineTheme({
      name: 'EaseChild',
      extends: base,
      motion: standard,
    });
    const ruled = defineTheme({
      name: 'EaseRule',
      tokens: {'--ease-standard': curve},
      adaptations: {
        rules: [{when: {pointer: 'coarse'}, value: {motion: standard}}],
      },
    });
    for (const tokens of [child.tokens, ruled.__adaptationRules?.[0]?.tokens]) {
      expect(tokens?.['--ease-entrance']).toBe(curve);
      expect(tokens?.['--ease-move']).toBe(curve);
    }
  });
});

describe('resolveThemeMotion reads a defined theme\u2019s motion (spec:AST-108 FR6)', () => {
  it('takes the knobs a child inherits from its base', () => {
    const base = defineTheme({name: 'KnobBase', motion: {tempo: 1.2}});
    const child = defineTheme({name: 'KnobChild', extends: base});
    expect(resolveThemeMotion(child).knobs.tempo).toBe(1.2);
  });
});

describe('the press release follows tempo (spec:AST-108 FR4, component:Button FR15)', () => {
  it('writes the tempo beside the duration tokens for the release fade, and nothing without one', () => {
    expect(expandThemeMotion({tempo: 1.5})['--_astryx-motion-tempo']).toBe(
      '1.5',
    );
    expect(
      expandThemeMotion({character: 'crisp'})['--_astryx-motion-tempo'],
    ).toBeUndefined();
  });
});

describe('busy loops read the duration before tempo (spec:AST-108 FR4)', () => {
  it.each([0.75, 1.5])(
    'at tempo %s the pre-tempo durations stay today\u2019s while the tokens scale',
    tempo => {
      const tokens = expandThemeMotion({tempo});
      expect(tokens['--_astryx-pre-tempo-duration-slow-min']).toBe('730ms');
      expect(tokens['--_astryx-pre-tempo-duration-medium-max']).toBe('550ms');
      expect(tokens['--duration-slow-min']).toBe(
        `${Math.round(730 * tempo)}ms`,
      );
    },
  );

  it('a duration scale still times the loops, and an explicit token too', () => {
    const scale = {fast: 100, medium: 250, ratio: 0.75};
    const tokens = expandThemeMotion({...scale, tempo: 1.5});
    expect(tokens['--_astryx-pre-tempo-duration-medium-max']).toBe(
      expandMotionScale(scale)['--duration-medium-max'],
    );
    const theme = defineTheme({
      name: 'LoopTimed',
      motion: {tempo: 1.5},
      tokens: {'--duration-medium-max': '600ms'},
    });
    expect(theme.tokens['--_astryx-pre-tempo-duration-medium-max']).toBe(
      '600ms',
    );
  });

  it('names every property it writes beside the core tokens privately, with --_astryx- (architecture:theme-tokens INV1)', () => {
    const core = new Set([
      ...Object.keys(durationDefaults),
      ...Object.keys(easeDefaults),
    ]);
    const tokens = expandThemeMotion({
      fast: 100,
      medium: 250,
      ratio: 0.75,
      tempo: 1.2,
      character: 'crisp',
    });
    const extra = Object.keys(tokens).filter(name => !core.has(name));
    expect(extra.length).toBeGreaterThan(0);
    for (const name of extra) {
      expect(name).toMatch(/^--_astryx-/);
    }
  });

  it('Spinner and Skeleton read the pre-tempo duration first', () => {
    const read = (file: string) =>
      fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    expect(read('Spinner/Spinner.tsx')).toContain(
      "`var(--_astryx-pre-tempo-duration-slow-min, ${durationVars['--duration-slow-min']})`",
    );
    expect(read('Skeleton/Skeleton.tsx')).toContain(
      "`var(--_astryx-pre-tempo-duration-medium-max, ${durationVars['--duration-medium-max']})`",
    );
  });
});

describe('an extending theme inherits motion field by field (spec:AST-108 FR5)', () => {
  it('a child that sets no easing keeps its base\u2019s --ease-standard, an explicit one included', () => {
    const base = defineTheme({
      name: 'EasingBase',
      motion: {fast: 150, medium: 300, ratio: 0.75, easing: 'ease-in'},
      tokens: {'--ease-standard': 'linear'},
    });
    expect(base.tokens['--ease-standard']).toBe('linear');
    const child = defineTheme({
      name: 'EasingChild',
      extends: base,
      motion: {tempo: 1.2},
    });
    expect(child.tokens['--ease-standard']).toBe('linear');
    // A child that sets its own easing generates it.
    const own = defineTheme({
      name: 'EasingOwn',
      extends: base,
      motion: {fast: 150, medium: 300, ratio: 0.75, easing: 'ease-out'},
    });
    expect(own.tokens['--ease-standard']).toBe('ease-out');
  });

  it('a grandchild that adds only a knob keeps the slow band its parent inherited', () => {
    const base = defineTheme({
      name: 'SlowBase',
      motion: {fast: 100, medium: 250, slow: 700, ratio: 0.75},
    });
    // The child's own ratio regenerates its fast and medium bands only. Its
    // unrelated token gives it authored input tokens of its own.
    const child = defineTheme({
      name: 'RatioChild',
      extends: base,
      motion: {fast: 100, medium: 250, ratio: 0.8},
      tokens: {'--radius-element': '6px'},
    });
    expect(child.tokens['--duration-slow-min']).toBe('525ms');
    for (const knob of [{character: 'expressive' as const}, {tempo: 1.2}]) {
      const grandchild = defineTheme({
        name: 'KnobGrandchild',
        extends: child,
        motion: knob,
      });
      for (const band of [
        '--duration-slow-min',
        '--duration-slow',
        '--duration-slow-max',
      ] as const) {
        expect(grandchild.tokens[band]).toBe(child.tokens[band]);
      }
    }
  });

  it('an explicit --ease-standard without motion of its own keeps an inherited character\u2019s curves', () => {
    const crisp = defineTheme({name: 'Crisp', motion: {character: 'crisp'}});
    const crispEase = crisp.tokens['--ease-entrance'];
    const child = defineTheme({
      name: 'EaseChild',
      extends: crisp,
      tokens: {'--ease-standard': 'cubic-bezier(0.4, 0, 0.6, 1)'},
    });
    expect(child.tokens['--ease-standard']).toBe(
      'cubic-bezier(0.4, 0, 0.6, 1)',
    );
    expect(child.tokens['--ease-entrance']).toBe(crispEase);
    expect(child.tokens['--ease-move']).toBe(crispEase);
    const adaptive = defineTheme({
      name: 'EaseRule',
      motion: {character: 'expressive'},
      adaptations: {
        rules: [
          {
            when: {pointer: 'coarse'},
            value: {
              tokens: {'--ease-standard': 'cubic-bezier(0.4, 0, 0.6, 1)'},
            },
          },
        ],
      },
    });
    const rule = adaptive.__adaptationRules?.[0];
    expect(rule?.tokens['--ease-standard']).toBe(
      'cubic-bezier(0.4, 0, 0.6, 1)',
    );
    expect(rule?.tokens['--ease-entrance']).toBeUndefined();
    expect(rule?.tokens['--ease-move']).toBeUndefined();
  });

  it('a base duration scale keeps winning over a child\u2019s tempo', () => {
    const base = defineTheme({
      name: 'ScaledBase',
      motion: {fast: 100, medium: 250, slow: 800, ratio: 0.75},
    });
    const child = defineTheme({
      name: 'ScaledChild',
      extends: base,
      motion: {tempo: 1.2},
    });
    for (const name of [
      '--duration-fast',
      '--duration-medium',
      '--duration-slow',
    ]) {
      expect(child.tokens[name], name).toBe(base.tokens[name]);
    }
  });

  it('a child\u2019s knobs regenerate over its base\u2019s explicit durations: base first, then generated', () => {
    const base = defineTheme({
      name: 'ExplicitBase',
      motion: {tempo: 0.8},
      tokens: {'--duration-medium': '300ms'},
    });
    const quicker = defineTheme({
      name: 'ExplicitChild',
      extends: base,
      motion: {tempo: 1.2},
    });
    expect(quicker.tokens['--duration-medium']).toBe(
      `${Math.round(410 * 1.2)}ms`,
    );
    expect(quicker.tokens['--duration-fast']).toBe(
      `${Math.round(175 * 1.2)}ms`,
    );
    const crisper = defineTheme({
      name: 'ExplicitCrisp',
      extends: base,
      motion: {character: 'crisp'},
    });
    // The inherited tempo regenerates it too.
    expect(crisper.tokens['--duration-medium']).toBe(
      `${Math.round(410 * 0.8)}ms`,
    );
    expect(crisper.tokens['--duration-fast']).toBe(
      `${Math.round(175 * 0.8)}ms`,
    );
    expect(crisper.tokens['--ease-entrance']).toBe(CHARACTER_EASE.crisp);
  });
});
