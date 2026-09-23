import { Navigate, Route, Routes } from 'react-router-dom';

import AppLayout from './components/layout/AppLayout.jsx';
import ProtectedRoute from './components/layout/ProtectedRoute.jsx';
import { routes } from './routes.js';

/**
 * Application shell (T-326).
 *
 * App is only the router host: the table lives in src/routes.js. Two groups:
 *   - public routes render directly (`/login`);
 *   - every `protected` route renders inside ProtectedRoute -> AppLayout, so a page
 *     can never mount without a session and never has to draw the chrome itself.
 */
export default function App() {
    const openRoutes = routes.filter((route) => !route.protected);
    const guardedRoutes = routes.filter((route) => route.protected);

    return (
        <Routes>
            {openRoutes.map(({ path, Component, redirectTo }) =>
                redirectTo ? (
                    <Route key={path} path={path} element={<Navigate to={redirectTo} replace />} />
                ) : (
                    <Route key={path} path={path} Component={Component} />
                )
            )}

            <Route element={<ProtectedRoute />}>
                <Route element={<AppLayout />}>
                    {guardedRoutes.map(({ path, Component }) => (
                        <Route key={path} path={path} Component={Component} />
                    ))}
                </Route>
            </Route>
        </Routes>
    );
}
