import { useEffect, useRef, useState } from 'react';
import { ChevronDown, LogOut, Menu, User } from 'lucide-react';

import { useAuth } from '../../hooks/useAuth.js';
import ProfileModal from '../profile/ProfileModal.jsx';

/**
 * Top header (T-309), matching ui-requirement.md 1.2 - as amended: the application
 * title and subheading sit here, and the user's avatar opens a dropdown for profile
 * settings and logout.
 *
 * Two deliberate choices, both recorded in the docs:
 *
 * 1. **The title replaces the mockup's search field.** The mockup's top bar held a
 *    search box, but §1.2 specified no behaviour for it, no search endpoint exists, and
 *    the user asked for the wordmark instead - so the field was removed and
 *    "Real-Time Water Quality Monitoring System" + "Dashboard for Rainwater Harvesting
 *    Storage in Rural Communities." are displayed here, on every page. That is why
 *    pages must NOT repeat the title (T-232 closed as "removed from the layout").
 *
 * 2. **Profile lives here, not in the sidebar** - that is the A10 resolution: the
 *    sidebar carries the three data pages, the avatar menu carries the single user's
 *    profile and sign-out.
 *
 * The title truncates rather than squeezing the avatar off-screen, and the subheading
 * is hidden on small screens. The avatar shows the user's initials; the picture upload
 * was removed together with MinIO (T-1.1).
 */
export default function Header({ onOpenNav }) {
    const { user, signOut } = useAuth();
    const [menuOpen, setMenuOpen] = useState(false);
    const [profileOpen, setProfileOpen] = useState(false);
    const menuRef = useRef(null);

    // Close on outside click and on Escape - a menu that traps the pointer is worse
    // than no menu.
    useEffect(() => {
        if (!menuOpen) return undefined;

        const onPointerDown = (event) => {
            if (!menuRef.current?.contains(event.target)) setMenuOpen(false);
        };
        const onKeyDown = (event) => {
            if (event.key === 'Escape') setMenuOpen(false);
        };

        document.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);

        return () => {
            document.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [menuOpen]);

    const initials = [user?.firstName, user?.lastName]
        .filter(Boolean)
        .map((part) => part[0]?.toUpperCase())
        .join('');

    return (
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-4">
            {/* Hamburger - the sidebar is a drawer below `md` (ui-requirement.md 7). */}
            <button
                type="button"
                onClick={onOpenNav}
                aria-label="Open navigation"
                className="rounded-md p-2 text-gray-500 hover:bg-gray-100 md:hidden"
            >
                <Menu className="h-5 w-5" aria-hidden="true" />
            </button>

            {/* Application title (replaces the mockup's search field - see the note above). */}
            <div className="min-w-0 flex-1">
                <h1 className="truncate text-sm font-bold text-gray-800 sm:text-base">
                    Real-Time Water Quality Monitoring System
                </h1>
                <p className="truncate text-xs text-gray-500">
                    Dashboard for Rainwater Harvesting Storage in Rural Communities.
                </p>
            </div>

            {/* User profile + dropdown */}
            <div className="relative ml-auto" ref={menuRef}>
                <button
                    type="button"
                    onClick={() => setMenuOpen((open) => !open)}
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    className="flex items-center gap-2 rounded-full p-1 hover:bg-gray-100"
                >
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
                        {initials || <User className="h-5 w-5" aria-hidden="true" />}
                    </span>
                    <span className="hidden text-sm text-gray-600 sm:inline">
                        {user?.firstName ?? 'Profile'}
                    </span>
                    <ChevronDown className="h-4 w-4 text-gray-400" aria-hidden="true" />
                </button>

                {menuOpen ? (
                    <div
                        role="menu"
                        className="absolute right-0 z-50 mt-2 w-56 rounded-md border border-gray-200 bg-white py-1 shadow-lg"
                    >
                        <div className="border-b border-gray-100 px-4 py-2">
                            <p className="text-sm font-medium text-gray-800">
                                {[user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Signed in'}
                            </p>
                            <p className="truncate text-xs text-gray-500">{user?.email}</p>
                        </div>

                        {/* Opens the profile MODAL (T-324) - the profile is not a
                            route any more: it must not take the user off the page. */}
                        <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                                setMenuOpen(false);
                                setProfileOpen(true);
                            }}
                            className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
                        >
                            <User className="h-4 w-4" aria-hidden="true" />
                            Profile
                        </button>

                        <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                                setMenuOpen(false);
                                signOut();
                            }}
                            className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                        >
                            <LogOut className="h-4 w-4" aria-hidden="true" />
                            Sign out
                        </button>
                    </div>
                ) : null}
            </div>

            {/* Rendered by the header so the profile is reachable from every page. */}
            <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
        </header>
    );
}
