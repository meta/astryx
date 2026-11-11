// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useEffect, useRef} from 'react';
import {Card} from '@astryxdesign/core/Card';
import {
  SyntaxTheme,
  githubLight,
  useSyntaxTheme,
} from '@astryxdesign/core/theme/syntax';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/Layout';

const LINES: Array<Array<[string, string]>> = [
  [
    ['keyword', 'const'],
    ['plain', ' deliver = '],
    ['plain', '('],
    ['parameter', 'pkg'],
    ['plain', ') =>'],
  ],
  [
    ['plain', '  '],
    ['keyword', 'return'],
    ['string', ' `ship ${pkg.name}`'],
    ['plain', ';'],
  ],
  [
    ['plain', '  '],
    ['comment', '// paint code with the theme in scope'],
  ],
  [['plain', '};']],
];

function CodeCanvas() {
  const syntax = useSyntaxTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!syntax || !canvasRef.current) {
      return;
    }
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) {
      return;
    }
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    ctx.font = '13px monospace';
    LINES.forEach((line, index) => {
      let x = 14;
      const y = 26 + index * 22;
      for (const [tokenName, text] of line) {
        ctx.fillStyle = syntax.token(
          tokenName as Parameters<typeof syntax.token>[0],
        );
        ctx.fillText(text, x, y);
        x += ctx.measureText(text).width;
      }
    });
  }, [syntax]);

  if (!syntax) {
    return (
      <Text type="supporting" color="secondary">
        No SyntaxTheme provider above this card.
      </Text>
    );
  }
  return <canvas ref={canvasRef} width={420} height={110} />;
}

export default function UseSyntaxThemeHookUsage() {
  return (
    <Card padding={4} width={480}>
      <VStack gap={3}>
        <SyntaxTheme theme={githubLight}>
          <CodeCanvas />
        </SyntaxTheme>
      </VStack>
    </Card>
  );
}
