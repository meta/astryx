// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file changelogData.ts
 * @input Generated package and component registries
 * @output The changelog text of every published package, and the component
 *   names that release notes link
 * @position Server-side input of the changelog routes and the sitemap. The
 *   text is megabytes: no client module imports this file.
 */

import {components} from '../generated/componentRegistry';
import {packages} from '../generated/packageRegistry';
import type {ChangelogEntry} from './changelogPages';

export const changelogEntries: ChangelogEntry[] = packages
  .filter((p): p is typeof p & {changelog: string} => p.changelog != null)
  .map(p => ({pkg: p.name, content: p.changelog}));

export const changelogComponentNames: string[] = Object.values(components)
  .flat()
  .map(c => c.name);
