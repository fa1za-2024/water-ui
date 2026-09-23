import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import Header from './Header.jsx';
import Sidebar from './Sidebar.jsx';

/**
 * Application shell (ui-requirement.md 1: "fixed left sidebar, top navigation header,
 * and a scrollable main content area").
 *
 * Split of responsibilities:
 *   - `ProtectedRoute` guards the session (nothing here renders without a token).
 *   - `AppLayout` draws the chrome and owns the mobile drawer state.
 *   - each page owns its own content and padding.
 *
 * Every guarded route renders through this component (see src/routes.js + App.jsx), so
 * there is exactly one place that decides what the chrome looks like.
 */
export default function AppLayout() {
    const [navOpen, setNavOpen] = useState(false);
    const { pathname } = useLocation();

    // Close the drawer after navigating - otherwise it stays open over the new page on
    // a phone.
    useEffect(() => {
        setNavOpen(false);
    }, [pathname]);

    return (
        <div className="flex min-h-full bg-gray-50">
            <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />

            <div className="flex min-w-0 flex-1 flex-col">
                <Header onOpenNav={() => setNavOpen(true)} />

                {/* The scrollable main content area. */}
                <main className="flex-1 overflow-y-auto">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
