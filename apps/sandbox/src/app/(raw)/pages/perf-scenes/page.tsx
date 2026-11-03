// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file page.tsx
 * @input `?scene=` (one of the ids in sceneIds.ts; the first by default)
 * @output A bare page with Mount and Unmount buttons around one perf scene
 * @position The page the perf driver drives in real Chromium
 *   (apps/sandbox/perf/). It is a raw page, with no sandbox chrome, so the
 *   measurements count only the scene. Also usable by hand: open a scene,
 *   record a DevTools performance profile, press Mount scene.
 */

import {Suspense, useEffect, useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import {Button} from '@astryxdesign/core/Button';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Link} from '@astryxdesign/core/Link';
import {Heading, Text} from '@astryxdesign/core/Text';
import {PerfScene} from './scenes';
import {PERF_SCENE_LABELS, PERF_SCENES, parsePerfScene} from './sceneIds';

function PerfScenes() {
  const [searchParams] = useSearchParams();
  const scene = parsePerfScene(searchParams.get('scene'));
  const [isMounted, setIsMounted] = useState(false);
  // The prerendered buttons exist before React owns them; the driver waits
  // for this mark so its first click is never lost to hydration.
  useEffect(() => {
    document.documentElement.dataset.perfPage = 'interactive';
  }, []);
  return (
    <VStack gap={4} padding={4}>
      <VStack gap={1}>
        <Heading level={1}>Perf scenes</Heading>
        <Text color="secondary">{PERF_SCENE_LABELS[scene]}</Text>
        <HStack gap={3}>
          {PERF_SCENES.map(id => (
            <Link key={id} href={`?scene=${id}`}>
              {id}
            </Link>
          ))}
        </HStack>
      </VStack>
      <HStack gap={2}>
        <Button
          label="Mount scene"
          variant="primary"
          isDisabled={isMounted}
          onClick={() => setIsMounted(true)}
        />
        <Button
          label="Unmount scene"
          variant="secondary"
          isDisabled={!isMounted}
          onClick={() => setIsMounted(false)}
        />
      </HStack>
      {isMounted ? <PerfScene scene={scene} /> : null}
    </VStack>
  );
}

export default function PerfScenesPage() {
  return (
    <Suspense>
      <PerfScenes />
    </Suspense>
  );
}
