// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Schema doc types — documentation for an authored/received OBJECT shape
 * (astryx.config, astryx.integration, a codemod, the doc-types themselves, the
 * response envelope). Colocated as a `.doc.mjs` next to the schema it describes.
 */

import type {AuthoredDocGraphFields} from '../base/type.js';
import type {ReferenceContentBlock} from '../reference/type.js';

/**
 * One documented field of a schema. Object fields nest via `fields`, so a whole
 * shape (including `hooks.postCodemod` or `experimental.xle`) is one tree.
 */
export interface SchemaFieldDoc {
  /** Field name, or a dotted path for a nested field (e.g. 'hooks.postCodemod'). */
  name: string;
  /** TypeScript type signature as a string, e.g. 'string[]' | "'a' | 'b'". */
  type: string;
  /** What the field is for, in 1-2 sentences. */
  description: string;
  /** True if the field must be provided. Omit (don't set false) if optional. */
  required?: boolean;
  /** Default value as a string, if any. */
  default?: string;
  /** A short inline example value. */
  example?: string;
  /** Deprecation reason, if the field is deprecated. */
  deprecated?: string;
  /** Set on a field of an experimental surface (spec:AST-017 FR27). The
   *  schema's own section leaves it out; the experimental feature's docs,
   *  under `astryx docs cli/experimental`, document it. */
  stability?: 'experimental';
  /** Nested object fields, for object-typed fields. */
  fields?: SchemaFieldDoc[];
}

/**
 * A schema/object documentation file (.doc.mjs), colocated with the schema.
 *
 *   /\*\* @type {import('@astryxdesign/cli/authoring').SchemaDoc} \*\/
 *   export const doc = { type: 'schema', name: 'config', ... };
 */
export interface SchemaDoc extends AuthoredDocGraphFields {
  /** Doc-kind discriminant. */
  type?: 'schema';
  /** URL-safe identifier, used as the docs slug within its namespace. */
  name: string;
  /** Human-readable title, e.g. 'Astryx Config'. */
  displayName: string;
  /** One-line summary shown in listings. */
  description: string;
  /** The group that reads this doc: 'authoring' for a file an author writes (a section of `astryx docs authoring`), or 'cli/api' for a shape the CLI returns (the docs tree adopts it by kind, as the leaf `cli/api/schemas/<name>`). Every schema doc the CLI ships declares one, and `astryx doctor` fails on one that is missing or that nothing reads. */
  namespace?: string;
  /** Alternate slugs that also resolve to this doc (back-compat). */
  aliases?: string[];
  /** What this schema applies to, e.g. 'astryx.config.{ts,mjs,js}' | 'AstryxConfig'. */
  appliesTo?: string;
  /** The fields that make up the shape. */
  fields: SchemaFieldDoc[];
  /** Full example objects/snippets. */
  examples?: {label?: string; code: string}[];
  /** Freeform prose/notes rendered after the field table. */
  notes?: ReferenceContentBlock[];
}
