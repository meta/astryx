// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file index.ts
 * @input Imports from AvatarGroup.tsx, AvatarGroupOverflow.tsx, AvatarGroupContext.ts
 * @output Exports AvatarGroup, AvatarGroupOverflow, context hook, and types
 * @position Component entry point; re-exported by /packages/core/src/index.ts
 *
 * SYNC: When modified, update this header and /packages/core/src/AvatarGroup/AvatarGroup.doc.mjs
 */

export {AvatarGroup} from './AvatarGroup';
export type {AvatarGroupProps} from './AvatarGroup';

export {AvatarGroupOverflow} from './AvatarGroupOverflow';
export type {AvatarGroupOverflowProps} from './AvatarGroupOverflow';

export {useAvatarGroup} from './AvatarGroupContext';
export type {AvatarGroupContextValue} from './AvatarGroupContext';
