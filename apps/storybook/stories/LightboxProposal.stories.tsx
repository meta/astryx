// Copyright (c) Meta Platforms, Inc. and affiliates.

// Preview only: demos for the Lightbox item model and chrome proposed in the
// component:Lightbox record. Not for merge.

import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {
  Lightbox,
  LightboxFilmstrip,
  LightboxZoomControl,
  type LightboxItem,
} from '@astryxdesign/core/Lightbox';
import {SAMPLE_IMAGES} from './assets/samples/samples';

const meta: Meta<typeof Lightbox> = {
  title: 'Core/Lightbox/Proposal (preview)',
  component: Lightbox,
};

export default meta;
type Story = StoryObj<typeof Lightbox>;

const noteStyle = {
  width: 'min(90vw, 420px)',
  maxHeight: '70vh',
  overflowY: 'auto',
  padding: 16,
  borderRadius: 12,
  background: 'rgb(32 32 36)',
  color: 'white',
  font: '15px/1.5 system-ui, sans-serif',
} as const;

const tableStyle = {
  width: 'min(90vw, 520px)',
  overflowX: 'auto',
  borderRadius: 12,
  background: 'rgb(32 32 36)',
  color: 'white',
  font: '14px system-ui, sans-serif',
} as const;

function BeforeAfter() {
  return (
    <div style={{display: 'flex', gap: 8, width: 'min(92vw, 720px)'}}>
      <img
        src={SAMPLE_IMAGES.lake1200x800}
        alt="Before"
        style={{width: '50%', borderRadius: 8}}
      />
      <img
        src={SAMPLE_IMAGES.beach1200x800}
        alt="After"
        style={{width: '50%', borderRadius: 8}}
      />
    </div>
  );
}

function Notes() {
  return (
    <div style={noteStyle}>
      <label style={{display: 'block', marginBlockEnd: 12}}>
        A field keeps its own drags and arrow keys:
        <input
          defaultValue="Drag across me"
          style={{display: 'block', width: '100%', marginBlockStart: 6}}
        />
      </label>
      {Array.from({length: 30}, (_, i) => (
        <p key={i} style={{margin: '0 0 8px'}}>
          Line {i + 1}. This list scrolls first; a drag down from its top closes
          the viewer.
        </p>
      ))}
    </div>
  );
}

function WideTable() {
  return (
    <div style={tableStyle}>
      <table style={{borderCollapse: 'collapse', minWidth: 900}}>
        <tbody>
          {Array.from({length: 8}, (_, row) => (
            <tr key={row}>
              {Array.from({length: 10}, (__, column) => (
                <td
                  key={column}
                  style={{padding: '8px 12px', whiteSpace: 'nowrap'}}>
                  Row {row + 1}, column {column + 1}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const MIXED_ITEMS: LightboxItem[] = [
  {src: SAMPLE_IMAGES.forest1200x800, alt: 'Forest path'},
  {
    type: 'custom',
    label: 'Before and after',
    content: <BeforeAfter />,
    caption: 'A custom item pages and closes by drag, like a photo.',
  },
  {type: 'custom', label: 'Notes with a field', content: <Notes />},
  {
    type: 'custom',
    label: 'A wide table',
    content: <WideTable />,
    caption:
      'The table scrolls sideways first; a new drag from its edge pages.',
  },
  {src: SAMPLE_IMAGES.city1200x800, alt: 'City skyline'},
];

function withChrome(
  src: string,
  alt: string,
  name: string,
  origin: string,
): LightboxItem {
  return {
    src,
    alt,
    title: name,
    subtitle: `From ${origin}`,
    actions: [
      {
        label: 'Download',
        icon: 'arrowDown',
        href: src,
        download: name,
      },
      {
        label: 'Open source',
        icon: 'externalLink',
        href: 'https://github.com/meta/astryx',
      },
    ],
  };
}

const CHROME_ITEMS: LightboxItem[] = [
  withChrome(SAMPLE_IMAGES.forest1200x800, 'Forest path', 'forest.jpg', 'Trip'),
  withChrome(SAMPLE_IMAGES.lake1200x800, 'Mountain lake', 'lake.jpg', 'Trip'),
  {
    type: 'custom',
    label: 'Before and after',
    title: 'Before and after',
    subtitle: 'From Edits',
    thumbnail: SAMPLE_IMAGES.beach1200x800,
    content: <BeforeAfter />,
  },
  withChrome(SAMPLE_IMAGES.beach1200x800, 'Beach sunset', 'beach.jpg', 'Trip'),
  withChrome(SAMPLE_IMAGES.city1200x800, 'City skyline', 'city.jpg', 'Work'),
];

function Demo({
  items,
  hasZoom,
  footer,
}: {
  items: LightboxItem[];
  hasZoom?: boolean;
  footer?: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(true);
  return (
    <>
      <button onClick={() => setIsOpen(true)}>Open lightbox</button>
      <Lightbox
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        media={items}
        hasZoom={hasZoom}
        footer={footer}
      />
    </>
  );
}

/** Custom items page and close by drag; their content keeps its own drags. */
export const CustomItems: Story = {
  render: () => <Demo items={MIXED_ITEMS} hasZoom />,
};

/** Each item's title, origin and actions, and the filmstrip in the Footer. */
export const TitleActionsAndFilmstrip: Story = {
  render: () => (
    <Demo items={CHROME_ITEMS} hasZoom footer={<LightboxFilmstrip />} />
  ),
};

/** The zoom control in the Footer, over the zoom's own values. */
export const ZoomControl: Story = {
  render: () => (
    <Demo
      items={CHROME_ITEMS}
      hasZoom
      footer={
        <>
          <LightboxZoomControl />
          <LightboxFilmstrip />
        </>
      }
    />
  ),
};
