// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file languages/ruby.ts
 * @input Shared grammar builders from ../grammar
 * @output The `ruby` language value for CodeBlock: Ruby: `ruby`, `rb`
 * @position Subpath entry: @astryxdesign/core/CodeBlock/languages/ruby
 */

import {HASH_COMMENT, cLike, defineCodeLanguage} from '../grammar';

/** Ruby: `ruby`, `rb`. */
export const ruby = /* @__PURE__ */ defineCodeLanguage(
  {
    name: 'ruby',
    identifiers: ['ruby', 'rb'],
    fileExtensions: ['rb', 'rake', 'gemspec'],
    fileNames: ['Gemfile', 'Rakefile'],
  },
  () =>
    cLike(
      'alias and begin break case class def defined do else elsif end ensure false for if in module next nil not or redo rescue retry return self super then true undef unless until when while yield require attr_accessor',
      [
        {type: 'constant', regex: /:\w+/},
        {type: 'variable', regex: /@{1,2}\w+|\$\w+/},
      ],
      [HASH_COMMENT],
    ),
);
