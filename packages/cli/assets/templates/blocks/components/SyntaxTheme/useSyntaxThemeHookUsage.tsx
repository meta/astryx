// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {SyntaxTheme, githubLight, useSyntaxTheme} from '@astryxdesign/core/theme/syntax';

function Keyword() {
  const syntax = useSyntaxTheme();
  if (syntax == null) {
    return null;
  }
  return (
    <svg width="120" height="40" role="img" aria-label="Keyword color">
      <text
        x="0"
        y="28"
        fill={syntax.token('keyword')}
        fontSize="24"
        data-syntax-keyword="">
        const
      </text>
    </svg>
  );
}

export default function UseSyntaxThemeHookUsage() {
  return (
    <SyntaxTheme theme={githubLight}>
      <Keyword />
    </SyntaxTheme>
  );
}
