// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file datePickerTouch.ts
 * @input The date and time pickers' touch-only pieces
 * @output Re-exports what the date and time sheets use only under a finger:
 *   TimeWheels and MonthPager
 * @position The pickers' touch layer. The sheets import touch behaviour from
 *   here only, so a desktop build can replace this one module.
 *
 * SYNC: When modified, update TouchTimeField.tsx, TouchDateTimeField.tsx and
 * TouchDateField.tsx.
 */

export {TimeWheels} from '../TimeInput/TimeWheels';
export type {TimeWheelsProps} from '../TimeInput/TimeWheels';
export {MonthPager} from './MonthPager';
