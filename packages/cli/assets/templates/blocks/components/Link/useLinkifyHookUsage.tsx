// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useLinkify, type LinkifyPattern} from '@astryxdesign/core/Link';
import {VStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';

const COMMENTS = [
  'See https://example.com/spec or email support@example.com.',
  'Fixed by #123, tracking the regression in #456.',
  'No links here, just a plain note.',
];

// Issue references like #123 link into the tracker; the capture group maps
// onto its URL scheme, showing the patterns option.
const ISSUE_PATTERN: LinkifyPattern = {
  pattern: /#(\d+)/g,
  href: match => `https://example.com/issues/${match[1]}`,
};

function Comment({children}: {children: string}) {
  const nodes = useLinkify(children, {patterns: [ISSUE_PATTERN]});
  return (
    <Text type="body" color="secondary">
      {nodes}
    </Text>
  );
}

export default function UseLinkifyHookUsage() {
  return (
    <VStack gap={3} style={{width: '100%', maxWidth: 360}}>
      {COMMENTS.map(comment => (
        <Comment key={comment}>{comment}</Comment>
      ))}
    </VStack>
  );
}
