// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file no-core-internal-import.test.mjs
 */

import {RuleTester} from 'eslint';
import tseslint from 'typescript-eslint';
import rule from './no-core-internal-import.js';

// typescript-eslint's parser reads the JavaScript cases too, and gives the
// `typeof import('…')` case its TSImportType node.
const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    ecmaVersion: 2022,
    sourceType: 'module',
  },
});

const message = source =>
  `'${source}' is one of Core's internal subpaths, reserved for Astryx's own packages (Core and Lab) and outside the compatibility promise. Use Core's public API instead.`;
const deep = source =>
  `'${source}' reaches into Core's internal, gesture, motion or touch-support source, which is for Core and Lab only (architecture:react-component-runtime INV13). Use Core's public API instead.`;

ruleTester.run('no-core-internal-import', rule, {
  valid: [
    // Core's public subpaths stay open.
    {code: `import {List} from '@astryxdesign/core/List';`},
    {code: `import {createReorderable} from '@astryxdesign/core/reorderable';`},
    // A path that only contains the word is not the internal subpath.
    {code: `import {x} from '@astryxdesign/core/internalization';`},
    {code: `import {x} from './internal/reorder';`},
    {code: `const core = require('@astryxdesign/core/List');`},
    // A computed specifier is not a literal subpath.
    {code: `const m = require(name);`},
    {code: `const r = load('@astryxdesign/core/internal/reorder');`},
    {code: `type T = typeof import('@astryxdesign/core/reorderable');`},
    // Names that only start like the deep paths.
    {code: `import {x} from '@astryxdesign/core/motionless';`},
    {code: `import {x} from '@astryxdesign/core/gesturesKit';`},
    {code: `import {x} from '../core/src/gesturesKit/x';`},
    {code: `import {x} from '../core/src/internals/x';`},
    // A code sample in a string is not an import.
    {
      code: "const sample = `import {duration} from '@astryxdesign/core/motion';`;",
    },
  ],
  invalid: [
    {
      code: `import {useReorderSession} from '@astryxdesign/core/internal/reorder';`,
      errors: [{message: message('@astryxdesign/core/internal/reorder')}],
    },
    {
      code: `export {useReorderSession} from '@astryxdesign/core/internal/reorder';`,
      errors: [{message: message('@astryxdesign/core/internal/reorder')}],
    },
    {
      code: `export * from '@astryxdesign/core/internal/touch';`,
      errors: [{message: message('@astryxdesign/core/internal/touch')}],
    },
    {
      code: `const m = import('@astryxdesign/core/internal/reorder');`,
      errors: [{message: message('@astryxdesign/core/internal/reorder')}],
    },
    {
      code: `import '@astryxdesign/core/internal';`,
      errors: [{message: message('@astryxdesign/core/internal')}],
    },
    {
      code: `const touch = require('@astryxdesign/core/internal/touch');`,
      errors: [{message: message('@astryxdesign/core/internal/touch')}],
    },
    {
      code: `type Touch = typeof import('@astryxdesign/core/internal/touch');`,
      errors: [{message: message('@astryxdesign/core/internal/touch')}],
    },
    // The gesture core, motion and touch support, by package path...
    {
      code: `import {GestureArena} from '@astryxdesign/core/gestures';`,
      errors: [{message: deep('@astryxdesign/core/gestures')}],
    },
    {
      code: `import {createAnimator} from '@astryxdesign/core/motion/animator';`,
      errors: [{message: deep('@astryxdesign/core/motion/animator')}],
    },
    {
      code: `export * from '@astryxdesign/core/gestures/PanGestureRecognizer';`,
      errors: [
        {message: deep('@astryxdesign/core/gestures/PanGestureRecognizer')},
      ],
    },
    {
      code: `const m = import('@astryxdesign/core/motion');`,
      errors: [{message: deep('@astryxdesign/core/motion')}],
    },
    {
      code: `const motion = require('@astryxdesign/core/motion');`,
      errors: [{message: deep('@astryxdesign/core/motion')}],
    },
    {
      code: `type G = typeof import('@astryxdesign/core/gestures');`,
      errors: [{message: deep('@astryxdesign/core/gestures')}],
    },
    // ...and by a path into Core's source.
    {
      code: `import {touchModule} from '../../packages/core/src/touch-support/touchModule';`,
      errors: [
        {message: deep('../../packages/core/src/touch-support/touchModule')},
      ],
    },
    {
      code: `import {GestureArena} from '../../../packages/core/src/internal/touch';`,
      errors: [{message: deep('../../../packages/core/src/internal/touch')}],
    },
    // A template literal with no expressions names the module as a string
    // does.
    {
      code: 'const t = import(`@astryxdesign/core/internal/touch`);',
      errors: [{message: message('@astryxdesign/core/internal/touch')}],
    },
    {
      code: 'const t = require(`@astryxdesign/core/internal/touch`);',
      errors: [{message: message('@astryxdesign/core/internal/touch')}],
    },
    {
      code: `const g = require('../core/src/gestures/GestureArena');`,
      errors: [{message: deep('../core/src/gestures/GestureArena')}],
    },
    {
      code: `type M = typeof import('../../core/src/motion/spring');`,
      errors: [{message: deep('../../core/src/motion/spring')}],
    },
  ],
});
