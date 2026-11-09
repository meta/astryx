// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Stable, machine-readable error codes carried on every CLI error envelope
 * and every thrown AstryxError. Consumers should branch on these — never on the
 * human-readable `error` string, which can change at any time.
 *
 * Append-only: a code's meaning never changes and codes are never removed.
 * See packages/cli/README.md for the documented contract and meanings.
 */
export type ErrorCode =
  | 'ERR_UNKNOWN'
  | 'ERR_UNKNOWN_COMMAND'
  | 'ERR_UNKNOWN_SUBCOMMAND'
  | 'ERR_INVALID_OPTION'
  | 'ERR_INVALID_ARGUMENT'
  | 'ERR_MISSING_ARGUMENT'
  | 'ERR_INVALID_LANG'
  | 'ERR_INVALID_DETAIL'
  | 'ERR_NODE_VERSION'
  | 'ERR_CORE_NOT_FOUND'
  | 'ERR_CORE_INCOMPATIBLE'
  | 'ERR_UNKNOWN_COMPONENT'
  | 'ERR_UNKNOWN_HOOK'
  | 'ERR_UNKNOWN_TOPIC'
  | 'ERR_UNKNOWN_SECTION'
  | 'ERR_UNKNOWN_CATEGORY'
  | 'ERR_UNKNOWN_TEMPLATE'
  | 'ERR_AMBIGUOUS_TEMPLATE'
  | 'ERR_AMBIGUOUS_COMPONENT'
  | 'ERR_UNKNOWN_THEME'
  | 'ERR_UNKNOWN_PACKAGE'
  | 'ERR_UNKNOWN_AGENT'
  | 'ERR_UNKNOWN_FEATURE'
  | 'ERR_UNKNOWN_CODEMOD'
  | 'ERR_CODEMOD_FAILED'
  | 'ERR_CODEMOD_PROTECTED'
  | 'ERR_CODEMOD_PROTECTION_SOURCE'
  | 'ERR_NOT_FOUND'
  | 'ERR_NO_DOC'
  | 'ERR_NO_SHOWCASE'
  | 'ERR_NO_SOURCE'
  | 'ERR_INVALID_DOC'
  | 'ERR_FILE_NOT_FOUND'
  | 'ERR_FILE_EXISTS'
  | 'ERR_PATH_TRAVERSAL'
  | 'ERR_WRITE_FAILED'
  | 'ERR_THEME_INVALID'
  | 'ERR_THEME_LOAD'
  | 'ERR_VERSION_DETECT'
  | 'ERR_INVALID_VERSION'
  | 'ERR_DEP_MISSING'
  | 'ERR_GH_CLI'
  | 'ERR_LAYOUT_PARSE'
  | 'ERR_LAYOUT_INVALID';

/** The frozen runtime map of all error codes (keys === values). */
export declare const ERROR_CODES: Readonly<Record<ErrorCode, ErrorCode>>;

/** Type guard: is `value` a known error code? */
export declare function isErrorCode(value: unknown): value is ErrorCode;

/** All error code string values, sorted. */
export declare function allErrorCodes(): ErrorCode[];
