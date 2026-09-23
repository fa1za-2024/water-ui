import { Beaker, Droplets, LineChart, LayoutDashboard, Radio } from 'lucide-react';
import { NavLink } from 'react-router-dom';

/**
 * Sidebar navigation (T-308), matching ui-requirement.md 1.1.
 *
 * The item list is the **resolution of A10**: the mockup's three labels
 * (`Dashboards` / `System Analytics` / `System Health`) do not describe any real page,
 * so the sidebar lists concrete destinations instead - Dashboard, Boards and
 * Historical Data - while the single user profile is reached from the avatar menu in
 * the header (T-309). Do not re-add the mockup's labels without reopening A10.
 *
 * Visual spec: logo area (water drop + "Water UI"), active item
 * `bg-purple-50 text-purple-700 border-l-4 border-purple-600`, inactive
 * `text-gray-500 hover:bg-gray-100`.
 *
 * Responsive (ui-requirement.md 7): from `md` up the sidebar is a static column; on
 * small screens it slides in as a drawer over a backdrop, opened by the header's
 * hamburger button.
 */
export const NAV_ITEMS = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/boards', label: 'Boards', icon: Radio },
    { to: '/historical', label: 'Historical Data', icon: LineChart },
    // The Simulator Control Module (T-335). A development tool, so it sits last.
    { to: '/simulator', label: 'Simulator', icon: Beaker },
];

export default function Sidebar({ open = false, onClose }) {
    return (
        <>
            {/* Backdrop - small screens only, and only while the drawer is open. */}
            {open ? (
                <button
                    type="button"
                    aria-label="Close navigation"
                    onClick={onClose}
                    className="fixed inset-0 z-30 bg-gray-900/40 md:hidden"
                />
            ) : null}

            <aside
                className={`fixed inset-y-0 left-0 z-40 flex w-64 transform flex-col border-r border-gray-200 bg-white transition-transform duration-200 md:static md:translate-x-0 ${
                    open ? 'translate-x-0' : '-translate-x-full'
                }`}
                aria-label="Main navigation"
            >
                {/* Logo area */}
                <div className="flex items-center gap-3 px-4 py-5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                        <Droplets className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="text-lg font-bold text-gray-800">Water UI</span>
                </div>

                <nav className="flex-1 space-y-1 px-2 py-2">
                    {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
                        <NavLink
                            key={to}
                            to={to}
                            end={end}
                            onClick={onClose}
                            className={({ isActive }) =>
                                `flex items-center gap-3 border-l-4 px-3 py-2 text-sm font-medium transition-colors ${
                                    isActive
                                        ? 'border-purple-600 bg-purple-50 text-purple-700'
                                        : 'border-transparent text-gray-500 hover:bg-gray-100'
                                }`
                            }
                        >
                            <Icon className="h-4 w-4" aria-hidden="true" />
                            {label}
                        </NavLink>
                    ))}
                </nav>

                <p className="px-4 py-4 text-xs text-gray-400">
                    Real-Time Water Quality Monitoring
                </p>
            </aside>
        </>
    );
}
