// Copyright (c) Meta Platforms, Inc. and affiliates.

'use strict';

/* global module */
module.exports = function rewriteTemplateAssetPaths({types: t}, options) {
  const basePath = options.basePath || '';

  return {
    visitor: {
      StringLiteral(path) {
        if (
          basePath !== '' &&
          path.node.value.startsWith('/template-assets/')
        ) {
          path.replaceWith(
            t.stringLiteral(
              basePath + path.node.value.slice('/template-assets'.length),
            ),
          );
        }
      },
    },
  };
};
