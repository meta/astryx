// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Enum doc types — a closed vocabulary (error codes, response-type
 * discriminants). Colocated next to the source of truth it documents.
 */

import type {AuthoredDocGraphFields} from '../base/type.js';

/** One member of an enumerated vocabulary. */
export interface EnumMemberDoc {
  /** The literal value, e.g. 'ERR_UNKNOWN_TOPIC' | 'component.list'. */
  value: string;
  /** What the value means / when it occurs. */
  description: string;
  /** Deprecation reason, if deprecated. */
  deprecated?: string;
  /** Set on a value of an experimental surface (spec:AST-017 FR27). The
   *  enum's own section leaves it out; the experimental feature's docs,
   *  under `astryx docs cli/experimental`, document it. */
  stability?: 'experimental';
}

/**
 * An enumeration documentation file (.doc.mjs).
 *
 *   /\*\* @type {import('@astryxdesign/cli/authoring').EnumDoc} \*\/
 *   export const doc = { type: 'enum', name: 'error-codes', ... };
 */
export interface EnumDoc extends AuthoredDocGraphFields {
  /** Doc-kind discriminant. */
  type?: 'enum';
  /** URL-safe identifier, used as the docs slug within its namespace. */
  name: string;
  /** Human-readable title. */
  displayName: string;
  /** One-line summary shown in listings. */
  description: string;
  /** The group that reads this doc. The CLI's enums use 'cli/api', which the docs tree adopts by kind: each is the leaf `cli/api/enums/<name>`. Every enum doc the CLI ships declares one, and `astryx doctor` fails on one that is missing or that nothing reads. */
  namespace?: string;
  /** Alternate slugs that also resolve to this doc. */
  aliases?: string[];
  /** The enumerated members. */
  members: EnumMemberDoc[];
}
