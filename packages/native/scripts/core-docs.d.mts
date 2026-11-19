// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {ComponentDocLike} from '../src/contract/fromComponentDoc.js';

export declare const CORE_ROOT: string;
export declare function loadCoreDoc(name: string): Promise<ComponentDocLike>;
export declare function readCoreIconNames(): string[];
