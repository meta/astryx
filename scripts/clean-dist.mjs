// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Remove a workspace package's generated distribution directory.
 * @input The package directory as the current working directory.
 * @output Removes ./dist when present.
 * @position Shared, cross-platform build cleanup used by package build scripts.
 */

import {rmSync} from 'node:fs';

rmSync('dist', {force: true, recursive: true});
