// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file no-physical-properties.test.mjs
 */

import assert from 'node:assert/strict';
import {RuleTester} from 'eslint';
import rule from './no-physical-properties.js';

// Relationship checks have no configuration escape hatch.
assert.deepEqual(rule.meta.schema, []);

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
});

/** Wrap a style-object body in a stylex.create() call. */
function inStylex(body) {
  return `
    import * as stylex from '@stylexjs/stylex';
    const styles = stylex.create({
      base: { ${body} },
    });
  `;
}

ruleTester.run('no-physical-properties', rule, {
  valid: [
    // Logical margin/padding are fine
    {code: inStylex(`marginInlineStart: 8`)},
    {code: inStylex(`paddingInlineEnd: 12`)},
    // Logical inset is fine
    {code: inStylex(`insetInlineStart: 0`)},
    // A variable-position logical anchor may pair with an explicit RTL transform.
    {
      code: inStylex(`
        insetInlineStart: '50%',
        transform: {
          default: 'translate(-50%, -50%)',
          ':is([dir="rtl"] *)': 'translate(50%, -50%)',
        }
      `),
    },
    // The same compensation may live inside the media branch that activates it.
    {
      code: inStylex(`
        insetInlineStart: { default: null, '@media (pointer: coarse)': '50%' },
        transform: {
          default: null,
          '@media (pointer: coarse)': {
            default: 'translate(-50%, -50%)',
            ':is([dir="rtl"] *)': 'translate(50%, -50%)',
          },
        }
      `),
    },
    // A block-only translation does not create the logical-anchor mismatch.
    {
      code: inStylex(
        `insetInlineStart: '50%', transform: 'translate(0, -50%)'`,
      ),
    },
    // Logical border longhands are fine
    {code: inStylex(`borderInlineStartWidth: 1, borderInlineEndColor: 'red'`)},
    // Logical corner radii are fine
    {code: inStylex(`borderStartStartRadius: 4, borderEndEndRadius: 4`)},
    // textAlign with a logical value is fine
    {code: inStylex(`textAlign: 'start'`)},
    // float/clear with logical values are fine
    {code: inStylex(`float: 'inline-start'`)},
    {code: inStylex(`clear: 'inline-end'`)},
    // textAlign with a non-physical value (center) is fine
    {code: inStylex(`textAlign: 'center'`)},
    // Block-direction properties are never physical — fine
    {code: inStylex(`marginTop: 4, paddingBottom: 8`)},
    // SCOPING: physical key on a plain object OUTSIDE stylex.create — fine
    {code: `const x = { left: 5, marginLeft: 10, borderTopLeftRadius: 4 };`},
    // SCOPING: physical VALUE on a plain object outside stylex — fine
    {code: `const x = { textAlign: 'left', float: 'right' };`},
    // SCOPING: `left`/`right` as ordinary variable names — fine
    {code: `const left = 5; const right = 10; const sum = left + right;`},

    // --- TRANSFORM READING: a transform proven to leave the inline axis alone
    // does not make a logical anchor suspect. ---
    {code: inStylex(`insetInlineStart: '50%', transform: 'none'`)},
    {code: inStylex(`insetInlineStart: '50%', transform: 'rotate(45deg)'`)},
    {
      code: inStylex(
        `insetInlineStart: '50%', transform: 'translateY(-50%) skewX(3deg)'`,
      ),
    },
    // Zero horizontal translation moves nothing, in any spelling.
    {code: inStylex(`insetInlineStart: '50%', transform: 'translateX(0px)'`)},
    // COMPOSITION: a rotate AFTER a translation spins the element in place,
    // leaving the translation measured on the axes it was written for.
    {
      code: inStylex(
        `insetInlineStart: '50%', transform: 'translateY(-50%) rotate(45deg)'`,
      ),
    },
    {
      code: inStylex(
        `insetInlineStart: '50%', transform: 'translate3d(-0, -50%, 0)'`,
      ),
    },
    // An RTL-only translation has no default arm to contradict.
    {
      code: inStylex(`
        insetInlineStart: '50%',
        transform: {default: null, ':is([dir="rtl"] *)': 'translateX(50%)'}
      `),
    },
    // translate3d is read as the horizontal translation it is, so its RTL
    // reversal counts as compensation exactly like translate()'s.
    {
      code: inStylex(`
        insetInlineStart: '50%',
        transform: {
          default: 'translate3d(-50%, -50%, 0)',
          ':is([dir="rtl"] *)': 'translate3d(50%, -50%, 0)',
        }
      `),
    },
    // A variable anchor is a position, not the fixed centering idiom. This is
    // Avatar's status-dot shape: the offset is computed from `size`, and the
    // RTL arm already mirrors the outward push.
    {
      code: inStylex(`
        insetInlineEnd: size * 0.07,
        transform: {
          default: 'translate(50%, 50%)',
          ':is([dir="rtl"] *)': 'translate(-50%, 50%)',
        }
      `),
    },
  ],
  invalid: [
    // --- KEY-BASED: margin (autofix renames the key) ---
    {
      code: inStylex(`marginLeft: 8`),
      output: inStylex(`marginInlineStart: 8`),
      errors: [
        {
          messageId: 'physicalKey',
          data: {physical: 'marginLeft', logical: 'marginInlineStart'},
        },
      ],
    },
    {
      code: inStylex(`marginRight: 8`),
      output: inStylex(`marginInlineEnd: 8`),
      errors: [
        {
          messageId: 'physicalKey',
          data: {physical: 'marginRight', logical: 'marginInlineEnd'},
        },
      ],
    },
    // --- KEY-BASED: padding ---
    {
      code: inStylex(`paddingLeft: 8`),
      output: inStylex(`paddingInlineStart: 8`),
      errors: [
        {
          messageId: 'physicalKey',
          data: {physical: 'paddingLeft', logical: 'paddingInlineStart'},
        },
      ],
    },
    {
      code: inStylex(`paddingRight: 8`),
      output: inStylex(`paddingInlineEnd: 8`),
      errors: [
        {
          messageId: 'physicalKey',
          data: {physical: 'paddingRight', logical: 'paddingInlineEnd'},
        },
      ],
    },
    // --- KEY-BASED: border side shorthands ---
    {
      code: inStylex(`borderLeft: '1px solid red'`),
      output: inStylex(`borderInlineStart: '1px solid red'`),
      errors: [
        {
          messageId: 'physicalKey',
          data: {physical: 'borderLeft', logical: 'borderInlineStart'},
        },
      ],
    },
    {
      code: inStylex(`borderRight: '1px solid red'`),
      output: inStylex(`borderInlineEnd: '1px solid red'`),
      errors: [
        {
          messageId: 'physicalKey',
          data: {physical: 'borderRight', logical: 'borderInlineEnd'},
        },
      ],
    },
    // --- KEY-BASED: border side longhands (width/style/color) ---
    {
      code: inStylex(`borderLeftWidth: 1`),
      output: inStylex(`borderInlineStartWidth: 1`),
      errors: [
        {
          messageId: 'physicalKey',
          data: {
            physical: 'borderLeftWidth',
            logical: 'borderInlineStartWidth',
          },
        },
      ],
    },
    {
      code: inStylex(`borderLeftStyle: 'solid'`),
      output: inStylex(`borderInlineStartStyle: 'solid'`),
      errors: [
        {
          messageId: 'physicalKey',
          data: {
            physical: 'borderLeftStyle',
            logical: 'borderInlineStartStyle',
          },
        },
      ],
    },
    {
      code: inStylex(`borderLeftColor: 'red'`),
      output: inStylex(`borderInlineStartColor: 'red'`),
      errors: [
        {
          messageId: 'physicalKey',
          data: {
            physical: 'borderLeftColor',
            logical: 'borderInlineStartColor',
          },
        },
      ],
    },
    {
      code: inStylex(`borderRightWidth: 1`),
      output: inStylex(`borderInlineEndWidth: 1`),
      errors: [
        {
          messageId: 'physicalKey',
          data: {physical: 'borderRightWidth', logical: 'borderInlineEndWidth'},
        },
      ],
    },
    {
      code: inStylex(`borderRightStyle: 'solid'`),
      output: inStylex(`borderInlineEndStyle: 'solid'`),
      errors: [
        {
          messageId: 'physicalKey',
          data: {physical: 'borderRightStyle', logical: 'borderInlineEndStyle'},
        },
      ],
    },
    {
      code: inStylex(`borderRightColor: 'red'`),
      output: inStylex(`borderInlineEndColor: 'red'`),
      errors: [
        {
          messageId: 'physicalKey',
          data: {physical: 'borderRightColor', logical: 'borderInlineEndColor'},
        },
      ],
    },
    // --- KEY-BASED: inset left/right ---
    {
      code: inStylex(`left: 0`),
      output: inStylex(`insetInlineStart: 0`),
      errors: [
        {
          messageId: 'physicalKey',
          data: {physical: 'left', logical: 'insetInlineStart'},
        },
      ],
    },
    {
      code: inStylex(`right: 0`),
      output: inStylex(`insetInlineEnd: 0`),
      errors: [
        {
          messageId: 'physicalKey',
          data: {physical: 'right', logical: 'insetInlineEnd'},
        },
      ],
    },
    // --- KEY-BASED: string-literal key preserves quoting on rename ---
    {
      code: inStylex(`'left': 0`),
      output: inStylex(`'insetInlineStart': 0`),
      errors: [
        {
          messageId: 'physicalKey',
          data: {physical: 'left', logical: 'insetInlineStart'},
        },
      ],
    },
    // --- INLINE-CENTERING EXCEPTION: left:'50%' + translate must NOT be
    // logicalized (breaks RTL centering); flagged with a distinct, non-fixing
    // message pointing to rtlStyles.centerInline. output:null = unchanged. ---
    {
      code: inStylex(`left: '50%', transform: 'translate(-50%, 100%)'`),
      output: null,
      errors: [{messageId: 'inlineCentering', data: {value: '50%'}}],
    },
    {
      code: inStylex(`left: '50%', transform: 'translateX(-50%)'`),
      output: null,
      errors: [{messageId: 'inlineCentering', data: {value: '50%'}}],
    },
    {
      // template-literal transform (the dynamic-style form) is also detected
      code: inStylex("left: '50%', transform: `translate(-50%, ${o})`"),
      output: null,
      errors: [{messageId: 'inlineCentering', data: {value: '50%'}}],
    },
    {
      // left:'50%' WITHOUT a translate is NOT the centering idiom — normal
      // physicalKey rename still applies.
      code: inStylex(`left: '50%'`),
      output: inStylex(`insetInlineStart: '50%'`),
      errors: [
        {
          messageId: 'physicalKey',
          data: {physical: 'left', logical: 'insetInlineStart'},
        },
      ],
    },
    {
      // Conditional physical centering must also point at centerInline rather
      // than being autofixed into the broken logical-anchor form.
      code: inStylex(`
        left: { default: null, '@media (pointer: coarse)': '50%' },
        transform: { default: null, '@media (pointer: coarse)': 'translate(-50%, -50%)' }
      `),
      output: null,
      errors: [{messageId: 'inlineCentering', data: {value: '50%'}}],
    },
    // --- LOGICAL-CENTERING MISMATCH: a logical 50% anchor flips in RTL but a
    // physical horizontal translate does not. These are non-fixing errors. ---
    {
      code: inStylex(
        `insetInlineStart: '50%', transform: 'translate(-50%, -50%)'`,
      ),
      output: null,
      errors: [
        {
          messageId: 'logicalCenteringTransform',
          data: {property: 'insetInlineStart', value: '50%'},
        },
      ],
    },
    {
      code: inStylex(`insetInlineEnd: '50%', transform: 'translateX(50%)'`),
      output: null,
      errors: [
        {
          messageId: 'logicalCenteringTransform',
          data: {property: 'insetInlineEnd', value: '50%'},
        },
      ],
    },
    {
      // An RTL branch must actually reverse the horizontal translation.
      code: inStylex(`
        insetInlineStart: '50%',
        transform: {
          default: 'translate(-50%, -50%)',
          ':is([dir="rtl"] *)': 'translate(-50%, -50%)',
        }
      `),
      output: null,
      errors: [
        {
          messageId: 'logicalCenteringTransform',
          data: {property: 'insetInlineStart', value: '50%'},
        },
      ],
    },
    {
      // This is the production shape from CheckboxInput, RadioListItem, and
      // Switch: the bug exists only inside the coarse-pointer branch.
      code: inStylex(`
        insetInlineStart: { default: null, '@media (pointer: coarse)': '50%' },
        transform: { default: null, '@media (pointer: coarse)': 'translate(-50%, -50%)' }
      `),
      output: null,
      errors: [
        {
          messageId: 'logicalCenteringTransform',
          data: {property: 'insetInlineStart', value: '50%'},
        },
      ],
    },
    {
      // A nested default transform without an RTL sibling is still broken.
      code: inStylex(`
        insetInlineStart: { default: null, '@media (pointer: coarse)': '50%' },
        transform: {
          default: null,
          '@media (pointer: coarse)': { default: 'translate(-50%, -50%)' },
        }
      `),
      output: null,
      errors: [
        {
          messageId: 'logicalCenteringTransform',
          data: {property: 'insetInlineStart', value: '50%'},
        },
      ],
    },
    // --- KEY-BASED: corner radii (verify the diagonal mapping) ---
    {
      code: inStylex(`borderTopLeftRadius: 4`),
      output: inStylex(`borderStartStartRadius: 4`),
      errors: [
        {
          messageId: 'physicalKey',
          data: {
            physical: 'borderTopLeftRadius',
            logical: 'borderStartStartRadius',
          },
        },
      ],
    },
    {
      code: inStylex(`borderTopRightRadius: 4`),
      output: inStylex(`borderStartEndRadius: 4`),
      errors: [
        {
          messageId: 'physicalKey',
          data: {
            physical: 'borderTopRightRadius',
            logical: 'borderStartEndRadius',
          },
        },
      ],
    },
    {
      code: inStylex(`borderBottomLeftRadius: 4`),
      output: inStylex(`borderEndStartRadius: 4`),
      errors: [
        {
          messageId: 'physicalKey',
          data: {
            physical: 'borderBottomLeftRadius',
            logical: 'borderEndStartRadius',
          },
        },
      ],
    },
    {
      code: inStylex(`borderBottomRightRadius: 4`),
      output: inStylex(`borderEndEndRadius: 4`),
      errors: [
        {
          messageId: 'physicalKey',
          data: {
            physical: 'borderBottomRightRadius',
            logical: 'borderEndEndRadius',
          },
        },
      ],
    },
    // --- KEY-BASED CONFLICT: both physical + logical present → no autofix ---
    {
      code: inStylex(`marginLeft: 8, marginInlineStart: 4`),
      // Fix is skipped: `output: null` asserts the code is left unchanged.
      output: null,
      errors: [
        {
          messageId: 'physicalKeyConflict',
          data: {physical: 'marginLeft', logical: 'marginInlineStart'},
        },
      ],
    },
    // Conflict also detected when the logical key is a string literal.
    {
      code: inStylex(`left: 0, 'insetInlineStart': 10`),
      output: null,
      errors: [
        {
          messageId: 'physicalKeyConflict',
          data: {physical: 'left', logical: 'insetInlineStart'},
        },
      ],
    },
    // --- VALUE-BASED: textAlign (autofix replaces the value only) ---
    {
      code: inStylex(`textAlign: 'left'`),
      output: inStylex(`textAlign: 'start'`),
      errors: [
        {
          messageId: 'physicalValue',
          data: {prop: 'textAlign', physical: 'left', logical: 'start'},
        },
      ],
    },
    {
      code: inStylex(`textAlign: 'right'`),
      output: inStylex(`textAlign: 'end'`),
      errors: [
        {
          messageId: 'physicalValue',
          data: {prop: 'textAlign', physical: 'right', logical: 'end'},
        },
      ],
    },
    // --- VALUE-BASED: float ---
    {
      code: inStylex(`float: 'left'`),
      output: inStylex(`float: 'inline-start'`),
      errors: [
        {
          messageId: 'physicalValue',
          data: {prop: 'float', physical: 'left', logical: 'inline-start'},
        },
      ],
    },
    {
      code: inStylex(`float: 'right'`),
      output: inStylex(`float: 'inline-end'`),
      errors: [
        {
          messageId: 'physicalValue',
          data: {prop: 'float', physical: 'right', logical: 'inline-end'},
        },
      ],
    },
    // --- VALUE-BASED: clear ---
    {
      code: inStylex(`clear: 'left'`),
      output: inStylex(`clear: 'inline-start'`),
      errors: [
        {
          messageId: 'physicalValue',
          data: {prop: 'clear', physical: 'left', logical: 'inline-start'},
        },
      ],
    },
    {
      code: inStylex(`clear: 'right'`),
      output: inStylex(`clear: 'inline-end'`),
      errors: [
        {
          messageId: 'physicalValue',
          data: {prop: 'clear', physical: 'right', logical: 'inline-end'},
        },
      ],
    },

    // --- AUTOFIX WITHHELD: a `left` anchor whose transform this rule reads as
    // horizontal, or cannot read at all. Renaming any of these to
    // `insetInlineStart` silently breaks RTL centering, so `output: null`
    // asserts the code is left exactly as written. ---
    {
      // translate3d IS a horizontal translation; the old scan matched only
      // `translate(`/`translateX(` and autofixed this into the broken form.
      code: inStylex(`left: '50%', transform: 'translate3d(-50%, -50%, 0)'`),
      output: null,
      errors: [{messageId: 'inlineCentering', data: {value: '50%'}}],
    },
    {
      // matrix() carries its translation in the 5th argument.
      code: inStylex(`left: '50%', transform: 'matrix(1, 0, 0, 1, -50, 0)'`),
      output: null,
      errors: [{messageId: 'inlineCenteringUnknown'}],
    },
    {
      code: inStylex(`
        left: '50%',
        transform: 'matrix3d(1,0,0,0, 0,1,0,0, 0,0,1,0, -50,0,0,1)'
      `),
      output: null,
      errors: [{messageId: 'inlineCenteringUnknown'}],
    },
    {
      // scaleX(-1) mirrors the axis the translation is measured on.
      code: inStylex(`left: '50%', transform: 'scaleX(-1) translateX(-50%)'`),
      output: null,
      errors: [{messageId: 'inlineCenteringUnknown'}],
    },
    {
      // The horizontal argument is interpolated, so nothing about it is known.
      code: inStylex("left: '50%', transform: `translateX(${x})`"),
      output: null,
      errors: [{messageId: 'inlineCenteringUnknown'}],
    },
    {
      // The transform is a value only the runtime resolves.
      code: inStylex(`left: '50%', transform: dynamicTransform`),
      output: null,
      errors: [{messageId: 'inlineCenteringUnknown'}],
    },
    {
      // Two horizontal translations would have to be summed to be judged.
      code: inStylex(
        `left: '50%', transform: 'translateX(-50%) translateX(4px)'`,
      ),
      output: null,
      errors: [{messageId: 'inlineCenteringUnknown'}],
    },
    {
      // Syntax the parser cannot read is unknown, never "no translation".
      code: inStylex(`left: '50%', transform: 'translateX(-50%'`),
      output: null,
      errors: [{messageId: 'inlineCenteringUnknown'}],
    },
    {
      // An anchor only the runtime resolves may be the centering 50%.
      code: inStylex(`left: OFFSET, transform: 'translateX(-50%)'`),
      output: null,
      errors: [{messageId: 'inlineCenteringUnknown'}],
    },
    {
      // A calc() horizontal translation is still definitely a translation.
      code: inStylex(`left: '50%', transform: 'translateX(calc(-50% + 4px))'`),
      output: null,
      errors: [{messageId: 'inlineCentering', data: {value: '50%'}}],
    },
    {
      // ...and so is a var() one.
      code: inStylex(`left: '50%', transform: 'translateX(var(--nudge))'`),
      output: null,
      errors: [{messageId: 'inlineCentering', data: {value: '50%'}}],
    },
    // --- AUTOFIX STILL APPLIES: conservatism must not swallow the rename when
    // the transform provably leaves the inline axis alone. ---
    {
      code: inStylex(
        `left: '50%', transform: 'translateY(-50%) rotate(45deg)'`,
      ),
      output: inStylex(
        `insetInlineStart: '50%', transform: 'translateY(-50%) rotate(45deg)'`,
      ),
      errors: [
        {
          messageId: 'physicalKey',
          data: {physical: 'left', logical: 'insetInlineStart'},
        },
      ],
    },
    {
      code: inStylex(`left: '50%', transform: 'translateX(0px)'`),
      output: inStylex(`insetInlineStart: '50%', transform: 'translateX(0px)'`),
      errors: [
        {
          messageId: 'physicalKey',
          data: {physical: 'left', logical: 'insetInlineStart'},
        },
      ],
    },
    {
      // An edge anchor is not the fixed-centering idiom, translate or not.
      code: inStylex(`left: 0, transform: 'translateX(-50%)'`),
      output: inStylex(`insetInlineStart: 0, transform: 'translateX(-50%)'`),
      errors: [
        {
          messageId: 'physicalKey',
          data: {physical: 'left', logical: 'insetInlineStart'},
        },
      ],
    },

    // --- RELATIONSHIP: translations the old check could not see, and RTL arms
    // it wrongly accepted as compensation. ---
    {
      // translate3d was invisible to the old scan, so this shipped unflagged.
      code: inStylex(
        `insetInlineStart: '50%', transform: 'translate3d(-50%, -50%, 0)'`,
      ),
      output: null,
      errors: [
        {
          messageId: 'logicalCenteringTransform',
          data: {property: 'insetInlineStart', value: '50%'},
        },
      ],
    },
    {
      code: inStylex(
        `insetInlineEnd: '-50%', transform: 'translate3d(50%, 0, 0)'`,
      ),
      output: null,
      errors: [
        {
          messageId: 'logicalCenteringTransform',
          data: {property: 'insetInlineEnd', value: '-50%'},
        },
      ],
    },
    {
      // A percentage of the element's own width and a fixed length do not
      // cancel; the old check read the unit mismatch as compensation.
      code: inStylex(`
        insetInlineStart: '50%',
        transform: {
          default: 'translate(-50%, -50%)',
          ':is([dir="rtl"] *)': 'translate(50px, -50%)',
        }
      `),
      output: null,
      errors: [
        {
          messageId: 'logicalCenteringTransform',
          data: {property: 'insetInlineStart', value: '50%'},
        },
      ],
    },
    {
      // calc() resolves at layout time: neither compensation nor a proven
      // break. The old check called it compensation and said nothing.
      code: inStylex(`
        insetInlineStart: '50%',
        transform: {
          default: 'translateX(calc(-50% - 4px))',
          ':is([dir="rtl"] *)': 'translateX(calc(50% + 4px))',
        }
      `),
      output: null,
      errors: [
        {
          messageId: 'logicalCenteringUnverified',
          data: {property: 'insetInlineStart'},
        },
      ],
    },
    {
      code: inStylex(`
        insetInlineStart: '50%',
        transform: {
          default: 'translateX(var(--shift))',
          ':dir(rtl)': 'translateX(var(--shift-rtl))',
        }
      `),
      output: null,
      errors: [
        {
          messageId: 'logicalCenteringUnverified',
          data: {property: 'insetInlineStart'},
        },
      ],
    },
    {
      code: inStylex(
        `insetInlineStart: '50%', transform: 'matrix(1, 0, 0, 1, -50, 0)'`,
      ),
      output: null,
      errors: [
        {
          messageId: 'logicalCenteringUnverified',
          data: {property: 'insetInlineStart'},
        },
      ],
    },
    {
      code: inStylex(
        `insetInlineStart: '50%', transform: 'translateX(-50%) translateX(4px)'`,
      ),
      output: null,
      errors: [
        {
          messageId: 'logicalCenteringUnverified',
          data: {property: 'insetInlineStart'},
        },
      ],
    },
    {
      // An interpolated RTL arm cannot be compared with its default.
      code: inStylex(
        "insetInlineStart: '50%', transform: {default: 'translateX(-50%)', ':dir(rtl)': `translateX(${x})`}",
      ),
      output: null,
      errors: [
        {
          messageId: 'logicalCenteringUnverified',
          data: {property: 'insetInlineStart'},
        },
      ],
    },

    // --- COMPOSITION: a transform list composes, so a translation written
    // AFTER a rotate or a skew is measured on axes this rule can no longer
    // identify. `rotate(90deg) translateY(-50%)` moves the element sideways by
    // half its height — the old reader called both functions harmless and
    // AUTOFIXED the anchor into the broken logical form. ---
    {
      code: inStylex(
        `left: '50%', transform: 'rotate(90deg) translateY(-50%)'`,
      ),
      output: null,
      errors: [{messageId: 'inlineCenteringUnknown'}],
    },
    {
      code: inStylex(`left: '50%', transform: 'skewX(20deg) translateY(-50%)'`),
      output: null,
      errors: [{messageId: 'inlineCenteringUnknown'}],
    },
    {
      code: inStylex(
        `left: '50%', transform: 'rotate(90deg) translateX(-50%)'`,
      ),
      output: null,
      errors: [{messageId: 'inlineCenteringUnknown'}],
    },
    {
      code: inStylex(
        `left: '50%', transform: 'translateY(-50%) rotate(90deg) translateY(-50%)'`,
      ),
      output: null,
      errors: [{messageId: 'inlineCenteringUnknown'}],
    },
    {
      code: inStylex(
        `insetInlineStart: '50%', transform: 'rotate(90deg) translateY(-50%)'`,
      ),
      output: null,
      errors: [
        {
          messageId: 'logicalCenteringUnverified',
          data: {property: 'insetInlineStart'},
        },
      ],
    },
    {
      // Even an RTL arm that looks like a reversal cannot be verified once the
      // axes have turned: neither side's direction is known.
      code: inStylex(`
        insetInlineStart: '50%',
        transform: {
          default: 'rotate(90deg) translateY(-50%)',
          ':is([dir="rtl"] *)': 'rotate(90deg) translateY(50%)',
        }
      `),
      output: null,
      errors: [
        {
          messageId: 'logicalCenteringUnverified',
          data: {property: 'insetInlineStart'},
        },
      ],
    },
  ],
});

console.log('All tests passed!');
