// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file index.ts
 * @input Imports Link, LinkProvider, useLinkComponent, types
 * @output Exports all public Link components, hooks, and types
 * @position Component entry point; re-exported by /packages/core/src/index.ts
 *
 * SYNC: When modified, update this header and /packages/core/src/Link/Link.doc.mjs
 */

export {Link} from './Link';
export type {LinkProps} from './Link';

export {LinkProvider} from './LinkProvider';
export type {LinkProviderProps} from './LinkProvider';

export {useLinkComponent} from './useLinkComponent';

export type {LinkComponentType} from './types';

export {useLinkify} from './useLinkify';
export type {LinkifyPattern, UseLinkifyOptions} from './useLinkify';
