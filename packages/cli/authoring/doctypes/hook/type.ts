// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Hook/function doc types.
 */

import type {
  AuthoredDocGraphFields,
  ComponentAccessibilityRequirement,
  ComponentBestPractice,
  HookParamDoc,
  HookReturnDoc,
  RegistryDocIdentity,
  UsageDoc,
} from '../base/type.js';

/**
 * Documentation for a standalone hook's .doc.mjs file.
 *
 * Hooks that are part of a component's API (e.g. useImperativeDialog)
 * should be documented in the component's MultiComponentDoc.components array.
 *
 * Standalone hooks (e.g. useMediaQuery, useFocusTrap, useOverflow) get
 * their own {hookName}.doc.mjs file and use this type.
 *
 * Every new hook .doc.mjs default-exports a stamped object:
 *
 *   /\*\* @type {import('@astryxdesign/cli/authoring').HookDoc} \*\/
 *   export default { type: 'function', ... };
 */
export interface HookDoc extends AuthoredDocGraphFields {
  /** Doc-kind discriminant for the stamped default-export format
   *  (`export default { type: 'function', ... }`). Optional: legacy
   *  `export const docs = {...}` docs omit it. */
  type?: 'function';
  /** Hook name exactly as exported, e.g. 'useMediaQuery', 'useFocusTrap'. */
  name: string;
  /** Human-readable display name for the hook. Hooks read better as the
   *  raw identifier ('useMediaQuery') than spaced ('use Media Query'), so
   *  the codemod keeps the identifier verbatim. See `ComponentBaseDoc.displayName`. */
  displayName: string;
  /** Optional group for sidebar/docs organization — same as ComponentDoc.group. */
  group?: string;
  /** Search keywords for CLI discovery. */
  keywords?: string[];
  /** Optional stable slug override and prior aliases for registry output. */
  registry?: RegistryDocIdentity;
  /** Hook parameters or options object fields. */
  params: HookParamDoc[];
  /** Return value documentation. For object returns, list each field.
   *  For primitive returns, use a single entry. */
  returns: HookReturnDoc[];
  /** Usage documentation — description, best practices. */
  usage: UsageDoc;
  /** Component names this hook is commonly used with.
   *  Enables cross-referencing: \`astryx component Toast\` can mention useToast,
   *  and \`astryx hook useToast\` can link back to Toast. */
  relatedComponents?: string[];
  /** Other hook names this hook is commonly used with. */
  relatedHooks?: string[];
  /** Import path, e.g. '@astryxdesign/core/hooks' or '@astryxdesign/core/Toast'. */
  importPath?: string;
  /** Category for grouping in listings. */
  category?: string;
}

/**
 * Translation overlay for hook documentation.
 */
export interface HookTranslationDoc {
  /** Optional exact name from the base doc. Ignored at render time. */
  name?: string;
  /** Optional translated displayName. Ignored at render time. */
  displayName?: string;
  /** Compressed/translated description. */
  description?: string;
  /** Param descriptions keyed by param name. */
  paramDescriptions?: Record<string, string>;
  /** Return descriptions keyed by field name. */
  returnDescriptions?: Record<string, string>;
  /** Translated usage. */
  usage?: {
    description?: string;
    bestPractices?: ComponentBestPractice[];
    accessibility?: ComponentAccessibilityRequirement[];
  };
}
