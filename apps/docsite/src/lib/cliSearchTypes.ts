// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {SearchResultEntry} from '@astryxdesign/cli/api';

/** One `astryx search` result, with the site destination it opens and, for a
 *  registered doc page, the title and category the site shows for it. */
export type SiteSearchResult = SearchResultEntry & {
  href: string;
  siteTitle?: string;
  siteCategory?: string;
};
