// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file changelogData.ts
 * @input The generated component registry and the package text
 * @output The changelog text of every published package, and the component
 *   names that release notes link
 * @position Server-side input of the changelog routes and the sitemap. The
 *   text is megabytes: no client module imports this file.
 */

import {components} from '../generated/componentRegistry';
import type {ChangelogEntry} from './changelogPages';
import {packageText} from './packageText';

export const changelogEntries: ChangelogEntry[] = packageText.flatMap(
  ({name, changelog}) =>
    changelog != null ? [{pkg: name, content: changelog}] : [],
);

export const changelogComponentNames: string[] = Object.values(components)
  .flat()
  .map(c => c.name);
