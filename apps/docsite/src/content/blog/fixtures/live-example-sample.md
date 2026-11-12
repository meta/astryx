---
title: 'Live example sample'
description: 'Test fixture for runnable tsx live blocks in blog posts. Never listed.'
date: '2026-11-01'
type: 'engineering'
authors:
  - 'cixzhang'
tags:
  - 'Docs'
draft: true
---

This fixture exercises every case of a `tsx live` block. It is served on the
canary only, and the blog index, feed and sitemap never list it.

## A running example

```tsx live
import {useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {HStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';

export default function Counter() {
  const [count, setCount] = useState(0);
  return (
    <HStack gap={3} style={{alignItems: 'center'}}>
      <Button label="Add one" onClick={() => setCount(c => c + 1)} />
      <Text type="body" data-testid="count">
        Clicked {count} times
      </Text>
    </HStack>
  );
}
```

## An example that imports a post-local asset

```tsx live
import {SampleCard} from './SampleCard';

export default function Spread() {
  return <SampleCard title="The Star" detail="Hope, renewal, calm" />;
}
```

## A broken example stays inside its frame

```tsx live
export default function Broken() {
  throw new Error('This example fails on purpose');
}
```

```tsx live
export default function DoesNotCompile( {
  return <div>never</div>;
}
```

## An ordinary code block

```tsx
export default function NotLive() {
  return null;
}
```

The post keeps rendering after every example above.
