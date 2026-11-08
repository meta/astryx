// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Type surface for the `@astryxdesign/cli/json` export — the out-of-process
 * consumer's view of `astryx --json` output.
 *
 * It re-exports every command's response types (the same colocated
 * `api/<cmd>/<cmd>.type.mjs` source of truth the in-process `./api` surface
 * uses) plus the shared response contract: the envelope/error/suggestion base
 * (foundation/response/base), the error-code union (foundation/response/error-codes),
 * and the manifest types (clients/cli/lib/manifest). This keeps `./json` and
 * `./api` describing the same data from one source, with no drift.
 */

export type * from '../component/component.type.mjs';
export type * from '../docs/docs.type.mjs';
export type * from '../blog/blog.type.mjs';
export type * from '../discover/discover.type.mjs';
export type * from '../template/template.type.mjs';
export type * from '../theme/theme.type.mjs';
export type * from '../hook/hook.type.mjs';
export type * from '../search/search.type.mjs';
export type * from '../build/build.type.mjs';
export type * from '../swizzle/swizzle.type.mjs';
export type * from '../gap-report/gap-report.type.mjs';
export type * from '../upgrade/upgrade.type.mjs';
export type * from '../init/init.type.mjs';
export type * from '../doctor/doctor.type.mjs';
export type * from '../integration/validate-integration.type.mjs';
export type * from '../integration/authoring-checks.type.mjs';
export type * from '../integration/pack-check.type.mjs';
export type * from '../../foundation/response/base';
export type * from '../../foundation/response/error-codes';
export type * from '../../clients/cli/lib/manifest';
