// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import {createPortal} from 'react-dom';

type Mode = 'light' | 'dark';
type Health = 'Healthy' | 'Attention' | 'Failed';

const services: Array<{
  name: string;
  owner: string;
  region: string;
  health: Health;
  latency: string;
}> = [
  {
    name: 'Aster',
    owner: 'Avery',
    region: 'North',
    health: 'Healthy',
    latency: '42 ms',
  },
  {
    name: 'Briar',
    owner: 'Morgan',
    region: 'West',
    health: 'Attention',
    latency: '118 ms',
  },
  {
    name: 'Cedar',
    owner: 'Riley',
    region: 'East',
    health: 'Failed',
    latency: '—',
  },
  {
    name: 'Dahlia',
    owner: 'Casey',
    region: 'South',
    health: 'Healthy',
    latency: '57 ms',
  },
];

const healthClasses: Record<Health, string> = {
  Healthy: 'bg-success/15 text-success',
  Attention: 'bg-warning/15 text-warning',
  Failed: 'bg-error/15 text-error',
};

export default function App() {
  const [mode, setMode] = useState<Mode>('light');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);

  const closeDialog = () => {
    setDialogOpen(false);
    setPopoverOpen(false);
  };

  return (
    <div
      className="fixture-shell min-h-screen bg-background text-foreground"
      data-mode={mode}
      data-vibe-probe="host-shell">
      <header className="border-b border-border bg-panel">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-secondary-ink">
              Portfolio console
            </p>
            <h1 className="text-xl font-semibold" data-vibe-probe="page-title">
              Service controls
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-success/15 px-2.5 py-1 text-xs font-semibold text-success">
              2 healthy
            </span>
            <button
              className="rounded-md border border-border bg-panel px-3 py-2 text-sm font-medium"
              data-vibe-probe="mode-control"
              onClick={() =>
                setMode(current => (current === 'light' ? 'dark' : 'light'))
              }
              type="button">
              {mode === 'light' ? 'Dark' : 'Light'} mode
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-6 py-6 xl:grid-cols-[minmax(0,2fr)_22rem]">
        <section aria-labelledby="service-heading" className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="service-heading" className="text-lg font-semibold">
                Service inventory
              </h2>
              <p className="text-sm text-secondary-ink">
                Fixed operational data for dense-layout checks.
              </p>
            </div>
            <div className="flex gap-2">
              <label className="grid gap-1 text-xs font-medium text-secondary-ink">
                Region
                <select className="rounded-md border border-border bg-panel px-3 py-2 text-sm text-foreground">
                  <option>All regions</option>
                  <option>North</option>
                  <option>West</option>
                </select>
              </label>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-border bg-panel">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-subtle text-xs uppercase tracking-wide text-secondary-ink">
                <tr>
                  <th
                    className="px-4 py-3 font-semibold"
                    data-vibe-probe="table-header">
                    Service
                  </th>
                  <th className="px-4 py-3 font-semibold">Owner</th>
                  <th className="px-4 py-3 font-semibold">Region</th>
                  <th className="px-4 py-3 font-semibold">Health</th>
                  <th className="px-4 py-3 text-right font-semibold">
                    Latency
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {services.map(service => (
                  <tr key={service.name}>
                    <td className="px-4 py-3 font-semibold">{service.name}</td>
                    <td className="px-4 py-3 text-secondary-ink">
                      {service.owner}
                    </td>
                    <td className="px-4 py-3">{service.region}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded px-2 py-1 text-xs font-semibold ${healthClasses[service.health]}`}
                        data-vibe-probe={
                          service.name === 'Aster' ? 'status' : undefined
                        }>
                        {service.health}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs">
                      {service.latency}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <section
            aria-labelledby="settings-heading"
            className="rounded-lg border border-border bg-panel p-5">
            <div className="mb-4">
              <h2 id="settings-heading" className="font-semibold">
                Alert settings
              </h2>
              <p className="text-sm text-secondary-ink">
                Host controls remain outside the guest subtree.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <label className="grid gap-1 text-sm font-medium">
                Escalation owner
                <input
                  className="rounded-md border border-border bg-background px-3 py-2"
                  data-vibe-probe="settings-control"
                  defaultValue="Avery"
                />
              </label>
              <label className="grid gap-1 text-sm font-medium">
                Warning threshold
                <input
                  className="rounded-md border border-border bg-background px-3 py-2"
                  defaultValue="100 ms"
                />
              </label>
              <label className="grid gap-1 text-sm font-medium">
                Error threshold
                <input
                  className="rounded-md border border-border bg-background px-3 py-2"
                  defaultValue="250 ms"
                />
              </label>
            </div>
          </section>
        </section>

        {/* Guest design-system subtree: generic token names must stay bounded here. */}
        <aside
          aria-labelledby="guest-heading"
          className="h-fit rounded-lg border border-border bg-panel p-5 shadow-sm"
          data-guest-design-system
          data-vibe-probe="guest-boundary">
          <p className="text-xs font-semibold uppercase tracking-[0.16em]">
            Guest subtree
          </p>
          <h2 id="guest-heading" className="mt-1 text-lg font-semibold">
            Integration preview
          </h2>
          <p className="mt-2 text-sm opacity-75">
            This subtree intentionally redefines accent, border, panel,
            foreground, subtle, and error.
          </p>
          <div
            className="mt-4 rounded-md border border-border bg-subtle p-3 text-sm"
            data-vibe-probe="guest-callout">
            <strong
              className="block text-accent"
              data-vibe-probe="guest-callout-heading">
              Scoped notice
            </strong>
            Host rows and settings should not inherit this palette.
          </div>
          <button
            className="mt-4 w-full rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white"
            data-vibe-probe="dialog-trigger"
            onClick={() => setDialogOpen(true)}
            type="button">
            Guest actions
          </button>
        </aside>
      </main>

      {dialogOpen
        ? createPortal(
            <div className="fixture-shell" data-mode={mode}>
              <div
                className="fixed inset-0 z-[40] bg-overlay"
                data-vibe-probe="dialog-backdrop"
                onClick={closeDialog}
              />
              <section
                aria-labelledby="service-dialog-title"
                aria-modal="true"
                className="fixed left-1/2 top-1/2 z-[50] w-[min(30rem,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-panel p-6 text-foreground shadow-2xl"
                data-guest-design-system
                data-vibe-probe="dialog-surface"
                onKeyDown={event => {
                  if (event.key === 'Escape') closeDialog();
                }}
                role="dialog"
                tabIndex={-1}>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] opacity-75">
                    Guest action
                  </p>
                  <h2
                    className="text-lg font-semibold"
                    id="service-dialog-title">
                    Service actions
                  </h2>
                </div>
                <p
                  className="mt-3 text-sm opacity-75"
                  data-vibe-probe="dialog-body">
                  This guest dialog is portaled across the host boundary.
                </p>
                <div
                  className="mt-4 rounded-md border border-border bg-subtle p-3 text-sm"
                  data-vibe-probe="dialog-callout">
                  Restarting a service pauses its queued work.
                </div>
                <div className="mt-4 flex items-center justify-between gap-3 rounded-md border border-border bg-panel p-3">
                  <div>
                    <p className="text-sm font-semibold">Target service</p>
                    <p className="text-xs opacity-75">Aster · North</p>
                  </div>
                  <button
                    aria-controls="guest-service-menu"
                    aria-expanded={popoverOpen}
                    aria-haspopup="menu"
                    className="rounded-md border border-border bg-panel px-3 py-2 text-sm font-medium"
                    data-vibe-probe="popover-trigger"
                    onClick={() => setPopoverOpen(value => !value)}
                    type="button">
                    Select service
                  </button>
                </div>
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    className="rounded-md border border-border px-3 py-2 text-sm font-medium"
                    onClick={closeDialog}
                    type="button">
                    Cancel
                  </button>
                  <button
                    className="rounded-md bg-error px-3 py-2 text-sm font-semibold text-white"
                    data-vibe-probe="destructive-action"
                    type="button">
                    Restart service
                  </button>
                </div>
              </section>

              {popoverOpen
                ? createPortal(
                    <div
                      aria-label="Guest service options"
                      className="fixture-shell fixed left-[calc(50%+1.5rem)] top-[calc(50%+2rem)] z-[70] w-52 rounded-md border border-border bg-panel p-1 text-foreground shadow-2xl"
                      data-guest-design-system
                      data-mode={mode}
                      data-vibe-probe="popover-surface"
                      id="guest-service-menu"
                      role="menu">
                      {['Aster', 'Briar', 'Cedar'].map(service => (
                        <button
                          className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-subtle"
                          data-vibe-probe={
                            service === 'Aster'
                              ? 'popover-menu-item'
                              : undefined
                          }
                          key={service}
                          role="menuitem"
                          type="button">
                          {service}
                        </button>
                      ))}
                    </div>,
                    document.body,
                  )
                : null}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
