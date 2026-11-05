// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import {createPortal} from 'react-dom';
import {Button} from '@/components/ui/button';
import {Card} from '@/components/ui/card';

const requests = [
  {id: 'REQ-104', owner: 'Avery', status: 'Approved', amount: '$2,400'},
  {id: 'REQ-105', owner: 'Morgan', status: 'Pending', amount: '$980'},
  {id: 'REQ-106', owner: 'Riley', status: 'Declined', amount: '$1,250'},
];

const statusClasses = {
  Approved: 'bg-primary text-primary-foreground',
  Pending: 'bg-secondary text-secondary-foreground',
  Declined: 'bg-destructive text-white',
};

export default function App() {
  const [dark, setDark] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);

  const closeDialog = () => {
    setDialogOpen(false);
    setTooltipOpen(false);
    setPopoverOpen(false);
  };

  return (
    <div className={dark ? 'dark' : ''}>
      <main
        className="min-h-screen bg-background px-6 py-8 text-foreground"
        data-vibe-probe="host-shell">
        <div className="mx-auto max-w-5xl space-y-6">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Review queue</p>
              <h1
                className="text-2xl font-semibold tracking-tight"
                data-vibe-probe="page-title">
                Purchase requests
              </h1>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setDark(value => !value)}>
                Use {dark ? 'light' : 'dark'} mode
              </Button>
              <Button
                data-vibe-probe="primary-action"
                onClick={() => setDialogOpen(true)}>
                New request
              </Button>
            </div>
          </header>

          <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
            <Card className="overflow-hidden">
              <div className="border-b border-border p-5">
                <h2 className="font-semibold">Active requests</h2>
                <p className="text-sm text-muted-foreground">
                  Fixed records for semantic-token checks.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted text-muted-foreground">
                    <tr>
                      <th
                        className="px-5 py-3 font-medium"
                        data-vibe-probe="table-header">
                        Request
                      </th>
                      <th className="px-5 py-3 font-medium">Owner</th>
                      <th className="px-5 py-3 font-medium">Status</th>
                      <th className="px-5 py-3 text-right font-medium">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {requests.map(request => (
                      <tr key={request.id}>
                        <td className="px-5 py-4 font-medium">{request.id}</td>
                        <td className="px-5 py-4">{request.owner}</td>
                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${statusClasses[request.status as keyof typeof statusClasses]}`}
                            data-vibe-probe={
                              request.id === 'REQ-104' ? 'status' : undefined
                            }>
                            {request.status}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right">
                          {request.amount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card className="p-5">
              <h2 className="font-semibold">Approval settings</h2>
              <form className="mt-4 space-y-4">
                <label className="grid gap-1.5 text-sm font-medium">
                  Default reviewer
                  <input
                    className="h-9 rounded-md border border-input bg-background px-3 outline-none focus:ring-2 focus:ring-ring"
                    data-vibe-probe="form-control"
                    defaultValue="Avery"
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-medium">
                  Cost center
                  <select className="h-9 rounded-md border border-input bg-background px-3 outline-none focus:ring-2 focus:ring-ring">
                    <option>Operations</option>
                    <option>Research</option>
                  </select>
                </label>
                <div className="rounded-md bg-accent p-3 text-sm text-accent-foreground">
                  Requests above $2,000 require two reviewers.
                </div>
                <Button className="w-full" type="button" variant="secondary">
                  Save settings
                </Button>
              </form>
            </Card>
          </div>
        </div>
      </main>

      {dialogOpen
        ? createPortal(
            <div className={dark ? 'dark' : ''}>
              <div
                className="fixed inset-0 z-[40] bg-black/50"
                data-vibe-probe="dialog-backdrop"
                onClick={closeDialog}
              />
              <section
                aria-labelledby="request-dialog-title"
                aria-modal="true"
                className="fixed left-1/2 top-1/2 z-[50] w-[min(30rem,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-popover p-6 text-popover-foreground shadow-xl"
                data-vibe-probe="dialog-surface"
                onKeyDown={event => {
                  if (event.key === 'Escape') closeDialog();
                }}
                role="dialog"
                tabIndex={-1}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2
                      className="text-lg font-semibold"
                      id="request-dialog-title">
                      Create purchase request
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Existing portal surfaces must remain above this dialog.
                    </p>
                  </div>
                  <button
                    aria-describedby={tooltipOpen ? 'request-help' : undefined}
                    aria-expanded={tooltipOpen}
                    aria-label="Explain approval routing"
                    className="grid size-8 place-items-center rounded-full border border-border bg-background text-sm font-semibold"
                    data-vibe-probe="tooltip-trigger"
                    onClick={() => setTooltipOpen(value => !value)}
                    type="button">
                    ?
                  </button>
                </div>

                <label className="mt-4 grid gap-1.5 text-sm font-medium">
                  Description
                  <input
                    className="h-9 rounded-md border border-input bg-background px-3"
                    defaultValue="Team supplies"
                  />
                </label>

                <div className="mt-4 flex items-center justify-between gap-3 rounded-md border border-border bg-background p-3">
                  <div>
                    <p className="text-sm font-medium">Approval route</p>
                    <p className="text-xs text-muted-foreground">Operations</p>
                  </div>
                  <button
                    aria-controls="approval-route-menu"
                    aria-expanded={popoverOpen}
                    aria-haspopup="menu"
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm font-medium"
                    data-vibe-probe="popover-trigger"
                    onClick={() => setPopoverOpen(value => !value)}
                    type="button">
                    Choose route
                  </button>
                </div>

                <div className="mt-5 flex justify-end gap-2">
                  <Button onClick={closeDialog} type="button" variant="outline">
                    Cancel
                  </Button>
                  <Button type="button">Create</Button>
                </div>
              </section>

              {tooltipOpen
                ? createPortal(
                    <div
                      className={`${dark ? 'dark ' : ''}fixed left-[calc(50%+7rem)] top-[calc(50%-11rem)] z-[80] max-w-52 rounded-md bg-primary px-3 py-2 text-xs text-primary-foreground shadow-lg`}
                      data-vibe-probe="tooltip-surface"
                      id="request-help"
                      role="tooltip">
                      Requests above $2,000 route to a second reviewer.
                    </div>,
                    document.body,
                  )
                : null}

              {popoverOpen
                ? createPortal(
                    <div
                      aria-label="Approval routes"
                      className={`${dark ? 'dark ' : ''}fixed left-[calc(50%+1rem)] top-[calc(50%+1.75rem)] z-[70] w-56 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-xl`}
                      data-vibe-probe="popover-surface"
                      id="approval-route-menu"
                      role="menu">
                      {['Operations', 'Research', 'Facilities'].map(route => (
                        <button
                          className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-accent"
                          key={route}
                          role="menuitem"
                          type="button">
                          {route}
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
