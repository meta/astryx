// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file DeprecatedSwipeLayer.tsx
 * @input The deprecated `swipeActions` and `swipeBehavior` an Item row was
 *   given, and the bridge Item forwards into; SwipeActionsLayer
 * @output Exports DeprecatedSwipeLayer (default): the swipe layer behind the
 *   deprecated props, with their released development warning
 * @position The target of Item.tsx's released loader, the one `import()` of
 *   swipe code, on DEP-0017's deprecated path (`spec:AST-057` DEP-0017,
 *   FR10); leaves with the props (CLN-0025). Tested through Item.test.tsx.
 */

import {useDevWarning} from '../hooks/useDevWarning';
import SwipeActionsLayer from './SwipeActionsLayer';
import type {SwipeLayerProps} from './swipeHost';

export default function DeprecatedSwipeLayer(props: SwipeLayerProps) {
  // The released warning for the released props (`spec:AST-057` FR3).
  useDevWarning(
    'Item',
    '`swipeBehavior="commit"` fires only the outermost entry of a side; the ' +
      'other entries have no touch path. Give a committing side one entry, ' +
      'or use `swipeBehavior="reveal"`.',
    props.behavior === 'commit' &&
      (props.leading.length > 1 || props.trailing.length > 1),
  );
  return <SwipeActionsLayer {...props} />;
}

DeprecatedSwipeLayer.displayName = 'DeprecatedSwipeLayer';
