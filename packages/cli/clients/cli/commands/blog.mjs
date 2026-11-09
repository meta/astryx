// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file blog command — read the Astryx blog from the published feed.
 *
 * A normal, agent-facing command: it appears in `--help` + the manifest and
 * supports `--json`. It reads the blog the same way any feed reader would — over
 * the public RSS feed — and prints a post's plaintext (.txt) variant. Nothing
 * about the blog's structure has to change for this to work; the CLI is just a
 * consumer of the feed.
 *
 *   astryx blog                    List posts from the feed
 *   astryx blog <slug>             Print a post as plaintext
 *   astryx blog --json             Structured list/detail envelope
 */

import {getCliInvocation} from '../../../foundation/env/package-manager.mjs';
import {jsonOut} from '../../../foundation/response/json.mjs';
import {emit, section, text, record, records, code} from '../formatters/index.mjs';
import {cliError} from '../lib/cli-error.mjs';
import {blog as blogApi} from '../../../api/blog/blog.mjs';
import {defineCommand} from '../lib/define-command.mjs';
import {resultSet} from '../../../foundation/debug/index.mjs';
import {doc as blogCommand} from './blog.doc.mjs';
import {doc as blogFn} from '../../../api/blog/blog.doc.mjs';

/** Every field of a post in the JSON, in order; record() skips empty ones. */
const POST_FIELDS = [
  'slug',
  'title',
  'description',
  'date',
  'type',
  'authors',
  'link',
  'textUrl',
];

/**
 * @param {import('commander').Command} program
 */
export function registerBlog(program) {
  defineCommand(program, blogCommand, {
    fn: blogFn,
    action: async (/** @type {string | undefined} */ slug) => {
      const run = getCliInvocation();
      /** @type {import('../../../api/blog/blog.type.mjs').BlogListResponse | import('../../../api/blog/blog.type.mjs').BlogDetailResponse} */
      let result;
      try {
        result = await blogApi(slug);
      } catch (e) {
        const err = /** @type {import('../../../api/error.mjs').AstryxError} */ (e);
        return cliError(err.message, {
          suggestions: err.suggestions || [],
          code: err.code,
        });
      }

      // A post is a doc: the feed lists them, a slug resolves one.
      const answered =
        result.type === 'blog.list'
          ? resultSet({
              count: result.data.posts.length,
              resultKind: 'doc',
            })
          : resultSet({count: 1, resultKind: 'doc', directMatch: true});

      if (program.opts().json) {
        jsonOut(result);
        return answered;
      }

      if (result.type === 'blog.list') {
        const {feedUrl, posts} = result.data;
        if (posts.length === 0) {
          emit(
            section('Astryx blog'),
            record({feedUrl}),
            text('No posts found in the feed.'),
          );
          return answered;
        }
        emit(
          section('Astryx blog'),
          record({feedUrl}),
          records(posts, {fields: POST_FIELDS}),
          text(`Read one: ${run} blog <slug>`),
        );
      } else {
        // blog.detail — the post's fields and the feed URL, then the body
        // verbatim (code() so article typography/spacing isn't ASCII-normalized).
        emit(
          record(result.data, {fields: [...POST_FIELDS, 'feedUrl']}),
          code(result.data.text),
        );
      }
      return answered;
    },
  });
}
