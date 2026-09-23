import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from '../../hooks/useAuth.js';

/**
 * Route guard (T-325: "protected routing").
 *
 * Three states, in this order:
 *   1. no token                    -> /login, remembering where the user was headed
 *   2. token, profile still loading -> a short "restoring" screen, so a refresh with a
 *      valid persisted token (T-303) does not flash the login form
 *   3. token + profile             -> the page
 *
 * A token that fails re-validation is cleared by useAuth, which drops us back to
 * state 1 on the next render.
 */
export default function ProtectedRoute() {
    const { isAuthenticated, user, isRestoring } = useAuth();
    const location = useLocation();

    if (!isAuthenticated) {
        return <Navigate to="/login" replace state={{ from: location.pathname }} />;
    }

    if (!user && isRestoring) {
        return (
            <div className="flex min-h-full items-center justify-center bg-gray-50 p-6">
                <p className="text-sm text-gray-500" role="status">
                    Restoring your session…
                </p>
            </div>
        );
    }

    return <Outlet />;
}
