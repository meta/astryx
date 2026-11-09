// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Stable provider, artifact, and authored-doc entry contracts.
 *
 * Logical IDs exclude installed/configured/loaded/healthy state. A concrete
 * provider instance adds package version and a content digest, while an
 * artifact ID stays stable across those instances.
 */

import type {AuthoredDocKind} from '../doctypes/base/type.js';
import type {CommandDoc} from '../doctypes/command/type.js';
import type {ComponentDoc} from '../doctypes/component/type.js';
import type {EnumDoc} from '../doctypes/enum/type.js';
import type {FunctionDoc} from '../doctypes/function/type.js';
import type {HookDoc} from '../doctypes/hook/type.js';
import type {IconDefinitionDoc} from '../doctypes/icon-definition/type.js';
import type {NamespaceDoc} from '../doctypes/namespace/type.js';
import type {ReferenceDoc} from '../doctypes/reference/type.js';
import type {SchemaDoc} from '../doctypes/schema/type.js';
import type {TemplateDoc} from '../doctypes/template/type.js';

declare const providerIdBrand: unique symbol;
declare const artifactIdBrand: unique symbol;
declare const docIdBrand: unique symbol;
declare const providerInstanceIdBrand: unique symbol;
declare const contentDigestBrand: unique symbol;

/** Canonical provider identity. It defaults to the normalized npm package name. */
export type ProviderId = string & {readonly [providerIdBrand]: true};

/** Stable provider + contribution kind + artifact-name identity. */
export type ArtifactId = string & {readonly [artifactIdBrand]: true};

/** ArtifactId narrowed to an authored documentation kind. */
export type DocId = ArtifactId & {readonly [docIdBrand]: true};

/** Immutable provider version + source/content digest identity. */
export type ProviderInstanceId = string & {
  readonly [providerInstanceIdBrand]: true;
};

/** Lowercase `sha256:<64 hex characters>` digest. */
export type ContentDigest = string & {readonly [contentDigestBrand]: true};

/**
 * Every artifact kind owned by a provider, each with a stable identity. The
 * `icon-definition` kind is experimental (spec:AST-084): it may change or be
 * removed in a patch release.
 */
export type ContributionKind =
  AuthoredDocKind | 'theme' | 'codemod' | 'agent-doc';

/** Stable logical identity for one provider-owned artifact. */
export interface ArtifactIdentity {
  readonly id: ArtifactId;
  readonly providerId: ProviderId;
  readonly kind: ContributionKind;
  readonly name: string;
}

/** One immutable package instance. Runtime lifecycle state does not belong here. */
export interface ProviderInstance {
  readonly id: ProviderInstanceId;
  readonly providerId: ProviderId;
  readonly packageName: string;
  readonly packageVersion: string;
  readonly sourceDigest: ContentDigest;
}

/** Every authored value accepted by the documentation compiler boundary. */
export type AuthoredDoc =
  | ComponentDoc
  | HookDoc
  | FunctionDoc
  | ReferenceDoc
  | TemplateDoc
  | SchemaDoc
  | CommandDoc
  | EnumDoc
  | NamespaceDoc
  | IconDefinitionDoc;

/** Provenance attached by discovery before compilation. */
export interface AuthoredDocSource {
  /** Provider-local logical discovery group. */
  readonly group: string;
  /** Package-relative source path; excluded from compiled renderer data. */
  readonly path: string;
  /** Digest of the authored source bytes. */
  readonly digest: ContentDigest;
}

/** Authored kind that corresponds to one public document type. */
export type AuthoredDocKindOf<TDoc extends AuthoredDoc> =
  TDoc extends ComponentDoc
    ? 'component'
    : TDoc extends HookDoc | FunctionDoc
      ? 'function'
      : TDoc extends ReferenceDoc
        ? 'generic'
        : TDoc extends TemplateDoc
          ? TDoc['type']
          : TDoc extends SchemaDoc
            ? 'schema'
            : TDoc extends CommandDoc
              ? 'command'
              : TDoc extends EnumDoc
                ? 'enum'
                : TDoc extends NamespaceDoc
                  ? 'namespace'
                  : TDoc extends IconDefinitionDoc
                    ? 'icon-definition'
                    : never;

type DeepReadonly<Value> = Value extends (...args: never[]) => unknown
  ? Value
  : Value extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : Value extends object
      ? {readonly [Key in keyof Value]: DeepReadonly<Value[Key]>}
      : Value;

/** Immutable authored-data snapshot stored in a compiler entry. */
export type AuthoredDocSnapshot<TDoc extends AuthoredDoc = AuthoredDoc> =
  DeepReadonly<TDoc>;

/**
 * One normalized compiler input. Stable identity is provider + authored kind +
 * stable name; provider version and source bytes remain explicit provenance.
 */
export interface AuthoredDocEntry<TDoc extends AuthoredDoc = AuthoredDoc> {
  readonly id: DocId;
  readonly provider: ProviderInstance;
  readonly kind: AuthoredDocKindOf<TDoc>;
  /** Stable provider-local key used in the DocId; it need not equal a display name. */
  readonly stableName: string;
  readonly source: AuthoredDocSource;
  readonly authored: AuthoredDocSnapshot<TDoc>;
}
