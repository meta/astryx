// Copyright (c) Meta Platforms, Inc. and affiliates.

const activity = [
  {item: 'Quarterly plan', owner: 'Avery', state: 'Ready'},
  {item: 'Partner review', owner: 'Morgan', state: 'In progress'},
  {item: 'Launch checklist', owner: 'Riley', state: 'Blocked'},
];

export default function App() {
  return (
    <div
      className="min-h-screen bg-background text-foreground"
      data-vibe-probe="host-shell">
      <header className="border-b border-zinc-200 bg-zinc-50">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Workspace
            </p>
            <h1 className="text-xl font-semibold" data-vibe-probe="page-title">
              Delivery overview
            </h1>
          </div>
          <nav aria-label="Primary navigation" className="flex gap-4 text-sm">
            <a
              className="font-medium underline underline-offset-4"
              href="#activity">
              Activity
            </a>
            <a className="text-zinc-600" href="#settings">
              Settings
            </a>
          </nav>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-6 px-6 py-8 md:grid-cols-[2fr_1fr]">
        <section
          id="activity"
          className="overflow-hidden rounded-lg border border-zinc-200">
          <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
            <div>
              <h2 className="font-semibold">Recent activity</h2>
              <p className="text-sm text-zinc-600">
                Three fixed records for layout checks.
              </p>
            </div>
            <button
              className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white"
              data-vibe-probe="primary-action">
              Create item
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th
                    className="px-5 py-3 font-medium"
                    data-vibe-probe="table-header">
                    Item
                  </th>
                  <th className="px-5 py-3 font-medium">Owner</th>
                  <th className="px-5 py-3 font-medium">State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {activity.map(row => (
                  <tr key={row.item}>
                    <td
                      className="px-5 py-3 font-medium"
                      data-vibe-probe={
                        row.item === 'Quarterly plan' ? 'table-cell' : undefined
                      }>
                      {row.item}
                    </td>
                    <td className="px-5 py-3 text-zinc-600">{row.owner}</td>
                    <td className="px-5 py-3">
                      <span
                        data-vibe-probe={
                          row.item === 'Quarterly plan' ? 'status' : undefined
                        }>
                        {row.state}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <aside id="settings" className="rounded-lg border border-zinc-200 p-5">
          <h2 className="font-semibold">Review settings</h2>
          <form className="mt-4 space-y-4">
            <label className="block text-sm font-medium">
              Reviewer
              <select className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2">
                <option>Avery</option>
                <option>Morgan</option>
              </select>
            </label>
            <label className="block text-sm font-medium">
              Summary
              <input
                className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2"
                data-vibe-probe="form-control"
                defaultValue="Weekly review"
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" defaultChecked />
              Send a completion notice
            </label>
            <button
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium"
              type="button">
              Save settings
            </button>
          </form>
        </aside>
      </main>
    </div>
  );
}
