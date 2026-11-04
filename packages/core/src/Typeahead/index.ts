// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file index.ts
 * @input Typeahead components and types
 * @output Exports all Typeahead module public API
 * @position Entry point for Typeahead module
 *
 * SYNC: When adding new Typeahead files, update exports here
 */

// Shared types
export type {SearchableItem, SearchContext, SearchSource} from './types';

// Search source utilities
export {createStaticSource} from './createStaticSource';
export type {CreateStaticSourceOptions} from './createStaticSource';

// Base (unstyled) typeahead
export {BaseTypeahead} from './BaseTypeahead';
export type {BaseTypeaheadProps} from './BaseTypeahead';

// Styled typeahead
export {Typeahead} from './Typeahead';
export type {
  TypeaheadProps,
  TypeaheadSize,
  TypeaheadStatus,
  TypeaheadStatusType,
} from './Typeahead';

// Typeahead item
export {TypeaheadItem} from './TypeaheadItem';
export type {TypeaheadItemProps} from './TypeaheadItem';
