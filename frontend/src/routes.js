import Boards from './pages/Boards.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Historical from './pages/Historical.jsx';
import Login from './pages/Login.jsx';
import Simulator from './pages/Simulator.jsx';

/**
 * React Router configuration (T-326).
 *
 * Kept as DATA, not JSX: Vite only compiles JSX inside .jsx/.tsx files, so a .js
 * module must export component *references*. `Component` (capital C) is React
 * Router v6+'s own prop for exactly this shape.
 *
 * | Route | Page | Access |
 * | :--- | :--- | :--- |
 * | `/login` | Login | public |
 * | `/` | Dashboard | guarded |
 * | `/boards` | Boards | guarded - placeholder until T-318..T-320 |
 * | `/historical` | Historical Data | guarded |
 * | `/simulator` | ESP32 MQTT Data Simulator | guarded - development tool (T-335) |
 * | `*` | - | redirect to `/` |
 *
 * Every `protected` entry renders inside ProtectedRoute -> AppLayout (the sidebar +
 * header chrome from ui-requirement.md 1), so pages only own their content.
 *
 * The sidebar item list is the A10 resolution - Dashboard, Boards, Historical Data -
 * plus **Simulator** (T-335), added on request by docs/simulator-module.md 2.
 * **Profile has no route at all** - it is a modal opened from the header's avatar menu
 * (`components/profile/ProfileModal.jsx`, T-324), so opening it never leaves the page.
 */
export const routes = [
    { path: '/login', Component: Login },

    { path: '/', Component: Dashboard, protected: true },
    { path: '/boards', Component: Boards, protected: true },
    { path: '/historical', Component: Historical, protected: true },
    { path: '/simulator', Component: Simulator, protected: true },

    { path: '*', redirectTo: '/' },
];

export default routes;
