// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {Citation} from '@astryxdesign/core/Citation';
import {Stack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {Icon} from '@astryxdesign/core/Icon';
import {CodeBracketIcon} from '@heroicons/react/24/outline';

export default function CitationShowcase() {
  return (
    <Stack direction="vertical" gap={6}>
      <Stack direction="vertical" gap={2}>
        <Text type="supporting" color="secondary">
          Label variant
        </Text>
        <Stack direction="horizontal" gap={2} style={{flexWrap: 'wrap'}}>
          <Citation
            source={{title: 'React Documentation', url: 'https://react.dev'}}
            number={1}
            variant="label"
          />
          <Citation
            source={{
              title: 'GitHub',
              url: 'https://github.com',
              icon: <Icon icon={CodeBracketIcon} size="xsm" />,
            }}
            number={2}
            variant="label"
          />
          <Citation
            source={{title: 'Internal reference'}}
            number={3}
            variant="label"
          />
        </Stack>
      </Stack>
      <Stack direction="vertical" gap={2}>
        <Text type="supporting" color="secondary">
          Number variant
        </Text>
        <Stack direction="horizontal" gap={2}>
          <Citation
            source={{
              title: 'TypeScript Handbook',
              url: 'https://typescriptlang.org',
            }}
            number={1}
            variant="number"
          />
          <Citation
            source={{
              title: 'MDN Web Docs',
              url: 'https://developer.mozilla.org',
            }}
            number={2}
            variant="number"
          />
          <Citation
            source={{title: 'W3C Specification'}}
            number={3}
            variant="number"
          />
        </Stack>
      </Stack>
    </Stack>
  );
}
