// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file fieldStatusPlacement.ts
 * @input The FieldStatus variant map
 * @output FieldStatusPlacement, where a field control shows its status
 * @position Field family type behind every field control's `statusVariant`
 *
 * A field control places its status message as a FieldStatus variant, or under
 * `'tooltip'`, which the Field family consumes before rendering FieldStatus and
 * shows through the control's on-field status icon (`component:FieldStatus`
 * FR7, DEC-2). `'tooltip'` belongs here, not to FieldStatus itself, whose map
 * keeps it only as a deprecated entry until the next minor.
 */

import type {FieldStatusVariantMap} from '../FieldStatus';

export type FieldStatusPlacement = keyof FieldStatusVariantMap | 'tooltip';
