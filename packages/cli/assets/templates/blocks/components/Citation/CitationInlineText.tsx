// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {Citation} from '@astryxdesign/core/Citation';
import {Text} from '@astryxdesign/core/Text';
import {Stack} from '@astryxdesign/core/Layout';
import {Icon} from '@astryxdesign/core/Icon';
import {BookIcon} from '@astryxdesign/template-icons';

export default function CitationInlineText() {
  return (
    <Stack direction="vertical" gap={4} style={{maxWidth: 560}}>
      <Text type="body">
        React uses a virtual DOM to minimize expensive DOM operations
        <Citation
          source={{title: 'React Documentation', url: 'https://react.dev'}}
          number={1}
          variant="number"
        />
        . This approach was inspired by earlier functional UI frameworks
        <Citation
          source={{
            title: 'Elm Architecture',
            url: 'https://guide.elm-lang.org/architecture/',
          }}
          number={2}
          variant="number"
        />
        .
      </Text>
      <Text type="body">
        TypeScript adds static types to JavaScript for safer refactoring
        <Citation
          source={{
            title: 'TypeScript Documentation',
            url: 'https://www.typescriptlang.org',
            icon: <Icon icon={BookIcon} size="xsm" />,
          }}
          number={3}
          variant="label"
        />
        .
      </Text>
    </Stack>
  );
}
