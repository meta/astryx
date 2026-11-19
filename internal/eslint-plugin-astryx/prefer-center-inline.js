// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file prefer-center-inline.js
 * @description Prefer the shared fixed-centering helper over a correct but
 *   hand-rolled logical anchor plus RTL transform reversal.
 */

import {
  isInsideStylexCreate,
  logicalCenteringStatuses,
} from './no-physical-properties.js';

const INLINE_INSETS = new Set(['insetInlineStart', 'insetInlineEnd']);

const rule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Prefer rtlStyles.centerInline() for fixed 50% centering instead of a hand-rolled logical anchor and RTL transform pair',
      category: 'Consistency',
      recommended: true,
      url: 'https://github.com/meta/astryx/issues/5170',
    },
    messages: {
      preferCenterInline:
        'This fixed 50% centering manually reverses its transform under RTL. ' +
        'Use `rtlStyles.centerInline(blockOffset)` so the direction-safe geometry ' +
        'and its rationale live in one shared utility.',
    },
    schema: [],
  },
  create(context) {
    return {
      Property(node) {
        if (!isInsideStylexCreate(node)) return;
        const property = node.key?.name ?? node.key?.value;
        if (!INLINE_INSETS.has(property)) return;
        if (!logicalCenteringStatuses(node).some((status) => status.compensated)) {
          return;
        }
        context.report({node: node.key, messageId: 'preferCenterInline'});
      },
    };
  },
};

export default rule;
