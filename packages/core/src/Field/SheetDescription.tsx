// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file SheetDescription.tsx
 * @input Description IDs whose rendered text lives outside a modal sheet
 * @output A text-only description inside the sheet, following current ID owners
 * @position Private field composition; import locally, never from a public barrel
 *
 * SYNC: SheetDescription.test.tsx
 */

import {useLayoutEffect, useRef} from 'react';
import {renderedText} from '../hooks/useAnnounceRenderedText';
import {VisuallyHidden} from '../VisuallyHidden';

/** Keeps external descriptions reachable inside a modal accessibility tree. */
export function SheetDescription({
  id,
  describedBy,
}: {
  id: string;
  describedBy: string;
}) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const target = ref.current;
    if (!target) {
      return;
    }
    const document = target.ownerDocument;
    const sourceIds = describedBy.split(/\s+/).filter(Boolean);
    let sources: HTMLElement[] = [];

    const sync = (records?: MutationRecord[]) => {
      const next = sourceIds
        .map(sourceId => document.getElementById(sourceId))
        // The projection cannot describe itself, directly or via an ancestor.
        .filter(
          (node): node is HTMLElement =>
            node != null && !node.contains(target) && !target.contains(node),
        );
      const changed =
        next.length !== sources.length ||
        next.some((node, index) => node !== sources[index]);
      if (changed) {
        textObserver.disconnect();
        sources = next;
        for (const source of sources) {
          textObserver.observe(source, {
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ['hidden', 'aria-hidden'],
          });
        }
      }
      if (
        records &&
        !changed &&
        !records.some(record =>
          sources.some(source => source.contains(record.target)),
        )
      ) {
        return;
      }
      const text = sources.map(renderedText).filter(Boolean).join(' ');
      if (target.textContent !== text) {
        target.textContent = text;
      }
    };
    const textObserver = new MutationObserver(sync);
    // An absent/replaced ID can appear anywhere in this document. Observe only
    // structure and ID ownership here; text/visibility observation stays on the
    // current sources. Unrelated changes (including our sink) do not reread text.
    const identityObserver = new MutationObserver(sync);
    identityObserver.observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['id'],
    });
    sync();
    return () => {
      identityObserver.disconnect();
      textObserver.disconnect();
    };
  }, [describedBy]);
  return (
    <VisuallyHidden ref={ref} id={id}>
      {null}
    </VisuallyHidden>
  );
}
