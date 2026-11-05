// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file index.ts
 * @input Imports TimeInput components and types
 * @output Exports TimeInput and related types
 * @position Component entry point; re-exported by /packages/core/src/index.ts
 *
 * SYNC: When modified, update this header and /packages/core/src/TimeInput/TimeInput.doc.mjs
 */

export {TimeInput} from './TimeInput';
export type {
  TimeInputProps,
  TimeInputSize,
  TimeInputHourFormat,
  TimeInputNativePicker,
  TimeInputPresentation,
  TimeInputStatus,
  TimeInputStatusType,
} from './TimeInput';
export type {ISOTimeString} from '../utils';
