// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file index.ts
 * @input Imports CommandPalette components and types
 * @output Exports all CommandPalette components and types
 * @position Component entry point; re-exported by /packages/core/src/index.ts
 *
 * SYNC: When modified, update this header
 */

export {CommandPalette} from './CommandPalette';
export type {CommandPaletteProps} from './CommandPalette';

export {CommandPaletteInput} from './CommandPaletteInput';
export type {CommandPaletteInputProps} from './CommandPaletteInput';

export {CommandPaletteList} from './CommandPaletteList';
export type {CommandPaletteListProps} from './CommandPaletteList';

export {CommandPaletteItem} from './CommandPaletteItem';
export type {CommandPaletteItemProps} from './CommandPaletteItem';

export {CommandPaletteGroup} from './CommandPaletteGroup';
export type {CommandPaletteGroupProps} from './CommandPaletteGroup';

export {CommandPaletteFooter} from './CommandPaletteFooter';
export type {CommandPaletteFooterProps} from './CommandPaletteFooter';

export {CommandPaletteEmpty} from './CommandPaletteEmpty';
export type {CommandPaletteEmptyProps} from './CommandPaletteEmpty';

export {useCommandPaletteContext} from './CommandPaletteContext';
export type {CommandPaletteContextValue} from './CommandPaletteContext';
