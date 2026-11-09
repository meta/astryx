// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Release boundary for the expanded integration-template conflict schema.
 *
 * @input The CLI package version and an explicit public-schema projection.
 * @output Whether replacement-specific conflict fields may reach the stable API.
 * @position Private compatibility gate for integration authoring diagnostics.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {semverCompare} from '../env/semver.mjs';
import {CLI_ROOT} from '../fs/paths.mjs';

const EXPANDED_TEMPLATE_CONFLICT_SCHEMA_CLI = '0.7.0';
/** @type {'warning-only' | 'expanded'} */
const TEMPLATE_CONFLICT_SCHEMA_PROJECTION = 'warning-only';
const CLI_VERSION = JSON.parse(
  fs.readFileSync(path.join(CLI_ROOT, 'package.json'), 'utf8'),
).version;

/**
 * Whether this release exposes replacement relationships in the public conflict API.
 * Both the supported version and a deliberate projection update are required;
 * a routine package-version bump cannot expand the public shape by itself.
 *
 * @param {string} [version]
 * @param {'warning-only' | 'expanded'} [projection]
 * @returns {boolean}
 */
export function expandedTemplateConflictSchemaActive(
  version = CLI_VERSION,
  projection = TEMPLATE_CONFLICT_SCHEMA_PROJECTION,
) {
  return (
    projection === 'expanded' &&
    semverCompare(version, EXPANDED_TEMPLATE_CONFLICT_SCHEMA_CLI) >= 0
  );
}
