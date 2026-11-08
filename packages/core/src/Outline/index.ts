// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file index.ts
 * @input Imports Outline, outline hooks, parser utility, and types
 * @output Exports Outline component, OutlineItem type, and outline helpers
 * @position Component entry point for Outline
 *
 * SYNC: When modified, update /packages/core/src/Outline/Outline.doc.mjs
 */

export {Outline} from './Outline';
export type {OutlineProps} from './Outline';
export type {OutlineItem} from './types';
export {parseOutlineFromMarkdown} from './parseOutlineFromMarkdown';
export type {ParseOutlineFromMarkdownOptions} from './parseOutlineFromMarkdown';
export {useOutlineFromMarkdown} from './useOutlineFromMarkdown';
export {useOutlineFromDOM} from './useOutlineFromDOM';
