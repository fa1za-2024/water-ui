/**
 * Placeholder for a page that is tracked but not built yet.
 *
 * The sidebar links to Boards / Historical Data, and the avatar menu to Profile, so
 * those routes must exist or every click would silently redirect to the dashboard.
 * Rather than fake a screen, this renders the page's title, the task that will fill it
 * and what it will contain - so the navigation is honest and each page task (T-318,
 * T-321, T-324) has an obvious slot to replace.
 */
export default function PlaceholderPage({ title, task, description, planned = [] }) {
    return (
        <div className="p-6">
            <header className="mb-6">
                <h2 className="text-2xl font-bold text-gray-800">{title}</h2>
                <p className="text-sm text-gray-500">{description}</p>
            </header>

            <section className="rounded-lg border border-dashed border-gray-300 bg-white p-5">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
                        Planned
                    </span>
                    <span className="text-xs font-medium text-gray-500">{task}</span>
                </div>

                <h2 className="mt-4 text-sm font-semibold text-gray-700">What this page will contain</h2>
                <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-gray-500">
                    {planned.map((item) => (
                        <li key={item}>{item}</li>
                    ))}
                </ul>
            </section>
        </div>
    );
}
