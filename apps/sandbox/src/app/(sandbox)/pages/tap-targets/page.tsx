// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file page.tsx
 * @position Sandbox page — WCAG 2.5.8 AA tap-target audit.
 *   Overlays are MEASURED from the real rendered control (getBoundingClientRect
 *   + ResizeObserver). The recommended box floors EACH AXIS to >=24 independently
 *   (a dimension that already passes is never shrunk). Specimens are grouped into
 *   "Meets AA today" vs "Needs hardening", each with a concrete recommendation.
 */

import {useState, useRef, useLayoutEffect, type ReactNode} from 'react';

import {VStack, HStack} from '@astryxdesign/core/Layout';
import {Text, Heading} from '@astryxdesign/core/Text';
import {Card} from '@astryxdesign/core/Card';
import {Grid} from '@astryxdesign/core/Grid';
import {Badge} from '@astryxdesign/core/Badge';
import {Divider} from '@astryxdesign/core';
import {CheckboxInput} from '@astryxdesign/core/CheckboxInput';
import {Switch} from '@astryxdesign/core/Switch';
import {RadioList, RadioListItem} from '@astryxdesign/core/RadioList';
import {Slider} from '@astryxdesign/core/Slider';
import {Tokenizer} from '@astryxdesign/core/Tokenizer';
import {TextInput} from '@astryxdesign/core/TextInput';
import {NumberInput} from '@astryxdesign/core/NumberInput';
import {DateInput} from '@astryxdesign/core/DateInput';
import {TimeInput} from '@astryxdesign/core/TimeInput';
import type {ISODateString} from '@astryxdesign/core/Calendar';
import type {ISOTimeString} from '@astryxdesign/core';
import type {SearchableItem, SearchSource} from '@astryxdesign/core/Typeahead';
import * as stylex from '@stylexjs/stylex';

const AA = 24;

const styles = stylex.create({
  container: {
    maxWidth: 980,
    marginInline: 'auto',
    paddingBlock: 32,
    paddingInline: 24,
  },
  measureRoot: {position: 'relative', width: '100%'},
  caption: {fontFamily: 'monospace', fontSize: 11, textAlign: 'center'},
});

const GREEN_BG = 'rgba(46,160,67,0.16)';
const GREEN_BORDER = 'rgba(46,160,67,0.9)';
const RED_BG = 'rgba(248,81,73,0.16)';
const RED_BORDER = 'rgba(248,81,73,0.9)';

type Mode = 'current' | 'recommended';

interface Target {
  selector: string;
  useParent?: boolean;
}

/** Measures the real affordance and draws a hit-area box centered on it. */
function MeasuredOverlay({
  mode,
  show,
  target,
  children,
}: {
  mode: Mode;
  show: boolean;
  target: Target;
  children: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<{
    cx: number;
    cy: number;
    w: number;
    h: number;
  } | null>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }
    let raf = 0;
    const measure = () => {
      let el = root.querySelector(target.selector) as HTMLElement | null;
      if (el && target.useParent) {
        el = el.parentElement as HTMLElement | null;
      }
      if (!el) {
        return;
      }
      const rr = root.getBoundingClientRect();
      const er = el.getBoundingClientRect();
      setRect({
        cx: er.left - rr.left + er.width / 2,
        cy: er.top - rr.top + er.height / 2,
        w: Math.round(er.width),
        h: Math.round(er.height),
      });
    };
    measure();
    raf = requestAnimationFrame(measure);
    const t = setTimeout(measure, 350);
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [target.selector, target.useParent]);

  // Per-axis floor: never shrink a dimension that already passes.
  const drawn = rect
    ? mode === 'recommended'
      ? {w: Math.max(rect.w, AA), h: Math.max(rect.h, AA)}
      : {w: rect.w, h: rect.h}
    : {w: 0, h: 0};
  const passes = rect ? Math.min(drawn.w, drawn.h) >= AA : false;
  const dimLabel = rect ? `${drawn.w}×${drawn.h}` : '—';

  return (
    <VStack gap={1} align="center">
      <div ref={rootRef} {...stylex.props(styles.measureRoot)}>
        {children}
        {show && rect && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: rect.cx,
              top: rect.cy,
              width: drawn.w,
              height: drawn.h,
              transform: 'translate(-50%, -50%)',
              border: `1.5px dashed ${passes ? GREEN_BORDER : RED_BORDER}`,
              backgroundColor: passes ? GREEN_BG : RED_BG,
              borderRadius: 4,
              pointerEvents: 'none',
              zIndex: 5,
            }}
          />
        )}
      </div>
      <span
        {...stylex.props(styles.caption)}
        style={{color: passes ? GREEN_BORDER : RED_BORDER}}>
        {dimLabel} — {passes ? 'passes AA' : 'under 24'}
      </span>
    </VStack>
  );
}

function Specimen({
  title,
  status,
  recommendation,
  target,
  showRecommended,
  show,
  children,
}: {
  title: string;
  status: 'pass' | 'fix' | 'exempt';
  recommendation: string;
  target: Target;
  showRecommended: boolean;
  show: boolean;
  children: ReactNode;
}) {
  return (
    <Card>
      <VStack gap={3}>
        <HStack gap={2} vAlign="center" justify="between">
          <Text type="body" color="primary">
            <strong>{title}</strong>
          </Text>
          <Badge
            label={
              status === 'pass'
                ? 'Meets AA'
                : status === 'exempt'
                  ? 'Exempt (2.5.8)'
                  : 'Needs hardening'
            }
            variant={
              status === 'pass'
                ? 'success'
                : status === 'exempt'
                  ? 'neutral'
                  : 'warning'
            }
          />
        </HStack>
        <Grid columns={showRecommended ? 2 : 1} gap={6}>
          <VStack gap={2} align="center">
            <Text type="label" color="secondary">
              Measured (current)
            </Text>
            <MeasuredOverlay mode="current" show={show} target={target}>
              {children}
            </MeasuredOverlay>
          </VStack>
          {showRecommended && (
            <VStack gap={2} align="center">
              <Text type="label" color="secondary">
                Recommended (≥24 each axis)
              </Text>
              <MeasuredOverlay mode="recommended" show={show} target={target}>
                {children}
              </MeasuredOverlay>
            </VStack>
          )}
        </Grid>
        <HStack gap={2} vAlign="start">
          <Text type="supporting" color="secondary">
            <strong>Recommendation:</strong> {recommendation}
          </Text>
        </HStack>
      </VStack>
    </Card>
  );
}

const users: SearchableItem[] = [
  {id: '1', label: 'Alice Johnson'},
  {id: '2', label: 'Bob Smith'},
  {id: '3', label: 'Charlie Brown'},
  {id: '4', label: 'Diana Prince'},
  {id: '5', label: 'Eve Williams'},
  {id: '6', label: 'Frank Miller'},
];

const userSource: SearchSource = {
  search: (query: string) =>
    users.filter(u => u.label.toLowerCase().includes(query.toLowerCase())),
  bootstrap: () => users.slice(0, 5),
};

export default function TapTargetsPage() {
  const [show, setShow] = useState(true);
  const [sliderValue, setSliderValue] = useState(40);
  const [tokens, setTokens] = useState<SearchableItem[]>([users[0], users[2]]);
  const [tokensB, setTokensB] = useState<SearchableItem[]>([
    users[0],
    users[2],
  ]);
  const [check, setCheck] = useState(false);
  const [toggle, setToggle] = useState(false);
  const [radio, setRadio] = useState('email');
  const [text, setText] = useState('Ada Lovelace');
  const [num, setNum] = useState<number | null>(42);
  const [date, setDate] = useState<ISODateString | undefined>(
    '2026-01-25' as ISODateString,
  );
  const [time, setTime] = useState<ISOTimeString | undefined>(
    '14:30' as ISOTimeString,
  );

  return (
    <div {...stylex.props(styles.container)}>
      <VStack gap={6}>
        <VStack gap={2}>
          <Heading level={1}>Tap Targets — WCAG 2.5.8 AA</Heading>
          <Text type="body" color="secondary">
            AA requires a 24×24 CSS px minimum tap target (met by size OR
            spacing). Every box below is measured from the real rendered
            control. The recommended box floors each axis to 24 independently —
            a dimension that already passes (e.g. a 32px-wide switch) is never
            shrunk.
          </Text>
        </VStack>

        <HStack gap={4} vAlign="center" wrap="wrap">
          <CheckboxInput
            label="Show hit-area overlay"
            value={show}
            onChange={setShow}
          />
        </HStack>

        <Divider />

        {/* GROUP B — needs hardening */}
        <VStack gap={3}>
          <Text type="label" color="secondary">
            NEEDS HARDENING
          </Text>

          {/* Tokenizer in context — two-column current vs recommended */}
          <Card>
            <VStack gap={3}>
              <HStack gap={2} vAlign="center" justify="between">
                <Text type="body" color="primary">
                  <strong>Tokenizer (in context)</strong>
                </Text>
                <Badge label="Needs hardening" variant="warning" />
              </HStack>
              <Grid columns={2} gap={6}>
                <VStack gap={2}>
                  <Text type="label" color="secondary">
                    Measured (current)
                  </Text>
                  <MeasuredOverlay
                    mode="current"
                    show={show}
                    target={{selector: '[aria-label="Clear all"]'}}>
                    <Tokenizer
                      label="Team members"
                      searchSource={userSource}
                      value={tokens}
                      onChange={setTokens}
                      hasClear
                      presentation="popover"
                    />
                  </MeasuredOverlay>
                </VStack>
                <VStack gap={2}>
                  <Text type="label" color="secondary">
                    Recommended (≥24 each axis)
                  </Text>
                  <MeasuredOverlay
                    mode="recommended"
                    show={show}
                    target={{selector: '[aria-label="Clear all"]'}}>
                    <Tokenizer
                      label="Team members"
                      searchSource={userSource}
                      value={tokensB}
                      onChange={setTokensB}
                      hasClear
                      presentation="popover"
                    />
                  </MeasuredOverlay>
                </VStack>
              </Grid>
              <Text type="supporting" color="secondary">
                <strong>Recommendation:</strong> The trailing clear-all “×”
                measures 20×20 — expand its hit area to 28 via a ::after inset
                on the shared InputClearButton (see the core hit-area PR). The
                per-token remove “×” is 16×16 visually but already passes via a
                44px ::after hit area — no change.
              </Text>
            </VStack>
          </Card>

          {/* Self-rolled input clear buttons — the audit's key surprise.
              TextInput / NumberInput / DateInput / TimeInput each roll their own
              clearButton style (padding:0, no ::after) → bare 16×16 hit target.
              Typeahead & Tokenizer route through the shared InputClearButton and
              already pass (28×28). Fix: route these through InputClearButton too. */}
          <Specimen
            title="TextInput — clear button"
            status="fix"
            recommendation="Clear × is 16×16 — this input rolls its own clearButton (no ::after) instead of using the shared InputClearButton (which Typeahead/Tokenizer use and which passes at 28×28). Fix: route through InputClearButton for a 28×28 hit area (visual × unchanged)."
            target={{selector: '[aria-label="Clear Full name"]'}}
            showRecommended
            show={show}>
            <div style={{minWidth: 240}}>
              <TextInput
                label="Full name"
                value={text}
                onChange={setText}
                hasClear
              />
            </div>
          </Specimen>

          {/* NumberInput clear */}
          <Specimen
            title="NumberInput — clear button"
            status="fix"
            recommendation="Same as TextInput — self-rolled 16×16 clear ×. Adopt the shared InputClearButton (::after inset:-4px → 28×28)."
            target={{selector: '[aria-label="Clear Amount"]'}}
            showRecommended
            show={show}>
            <div style={{minWidth: 240}}>
              <NumberInput
                label="Amount"
                value={num}
                onChange={setNum}
                hasClear
              />
            </div>
          </Specimen>

          {/* DateInput — clear AND calendar toggle, both 16×16 */}
          <Specimen
            title="DateInput — clear button"
            status="fix"
            recommendation="Clear × is 16×16 (self-rolled). Adopt InputClearButton → 28×28. Note: the calendar-toggle glyph beside it is ALSO 16×16 (see next)."
            target={{selector: '[aria-label="Clear Appointment"]'}}
            showRecommended
            show={show}>
            <div style={{minWidth: 260}}>
              <DateInput
                label="Appointment"
                value={date}
                onChange={setDate}
                hasClear
              />
            </div>
          </Specimen>

          {/* DateInput calendar-toggle */}
          <Specimen
            title="DateInput — calendar toggle"
            status="exempt"
            recommendation="EXEMPT under WCAG 2.5.8 (equivalent control). The 16×16 toggle opens the calendar, but so does clicking the field itself (role=combobox, 442×32 — measured & hit-tested). The function has an equivalent target ≥24, so the small glyph is permitted. No change required — a redundant affordance, not a failure."
            target={{selector: '[aria-label="Open calendar"]'}}
            showRecommended={false}
            show={show}>
            <div style={{minWidth: 260}}>
              <DateInput label="Due date" value={date} onChange={setDate} />
            </div>
          </Specimen>

          {/* TimeInput clear */}
          <Specimen
            title="TimeInput — clear button"
            status="fix"
            recommendation="Self-rolled 16×16 clear ×. Adopt the shared InputClearButton (::after inset:-4px → 28×28)."
            target={{selector: '[aria-label="Clear Start time"]'}}
            showRecommended
            show={show}>
            <div style={{minWidth: 240}}>
              <TimeInput
                label="Start time"
                value={time}
                onChange={setTime}
                hasClear
              />
            </div>
          </Specimen>

          {/* Slider thumb */}
          <Specimen
            title="Slider thumb"
            status="fix"
            recommendation="Thumb is 20×20 with no hit expansion. Add a ::after inset to reach a 28×28 hit area (visual thumb unchanged)."
            target={{selector: '[role="slider"]'}}
            showRecommended
            show={show}>
            <div style={{minWidth: 240}}>
              <Slider
                label="Volume"
                isLabelHidden
                value={sliderValue}
                onChange={setSliderValue}
              />
            </div>
          </Specimen>

          {/* Checkbox sm */}
          <Specimen
            title="Checkbox (sm, label hidden)"
            status="fix"
            recommendation="Box is 20×20 on sm. Make the whole box the target (fill the input) and floor to 24×24 on pointer: coarse."
            target={{selector: 'input[type="checkbox"]', useParent: true}}
            showRecommended
            show={show}>
            <CheckboxInput
              label="Accept terms"
              isLabelHidden
              size="sm"
              value={check}
              onChange={setCheck}
            />
          </Specimen>

          {/* Radio sm — same 20px box as checkbox */}
          <Specimen
            title="Radio (sm, list item)"
            status="fix"
            recommendation="Radio circle is 20×20 on sm (24×24 on md, which passes). Make the whole circle the target (fill the input) and floor to 24×24 on pointer: coarse — same fix as Checkbox."
            target={{selector: 'input[type="radio"]', useParent: true}}
            showRecommended
            show={show}>
            <RadioList
              label="Notify me via"
              isLabelHidden
              size="sm"
              value={radio}
              onChange={setRadio}>
              <RadioListItem label="Email" value="email" />
              <RadioListItem label="SMS" value="sms" />
            </RadioList>
          </Specimen>

          {/* Switch sm — per-axis: 32 wide stays, height 20 -> 24 */}
          <Specimen
            title="Switch (sm, label hidden)"
            status="fix"
            recommendation="Track is 32×20 — width already passes, only the height fails. Make the whole switch the target (fill the input) and floor the HEIGHT to 24 on coarse; keep the 32px width."
            target={{selector: '[role="switch"]', useParent: true}}
            showRecommended
            show={show}>
            <Switch
              label="Dark mode"
              isLabelHidden
              size="sm"
              value={toggle}
              onChange={setToggle}
            />
          </Specimen>
        </VStack>
      </VStack>
    </div>
  );
}
