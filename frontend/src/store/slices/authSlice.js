import { createSlice } from '@reduxjs/toolkit';

/**
 * Auth state for the SINGLE user profile.
 *
 * Rule 1: there is no RBAC here. No roles, no permissions, no claims to check -
 * just "is there a valid token for the one account?".
 *
 * T-303: the session is persisted in localStorage so a page refresh does not throw
 * the user back to the login screen, and it is re-validated on boot against
 * `GET /api/auth/me` (see hooks/useAuth.js, which clears the session if the token
 * has expired). Storing a JWT in localStorage is acceptable for this single-user
 * dashboard; it is XSS-sensitive, so never render untrusted HTML into the page.
 */
const STORAGE_KEY = 'water-ui.session';

/** Read the persisted session, tolerating a hand-edited or unreadable value. */
function readStoredSession() {
    const empty = { token: null, user: null };

    if (typeof window === 'undefined' || !window.localStorage) return empty;

    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return empty;

        const parsed = JSON.parse(raw);

        return {
            token: typeof parsed?.token === 'string' && parsed.token ? parsed.token : null,
            user: parsed?.user ?? null,
        };
    } catch (error) {
        console.warn('[auth] stored session is unreadable, ignoring it:', error.message);
        return empty;
    }
}

/** Mirror the session into localStorage, or drop the key when it is empty. */
function persistSession(session) {
    if (typeof window === 'undefined' || !window.localStorage) return;

    try {
        if (session.token) {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
        } else {
            window.localStorage.removeItem(STORAGE_KEY);
        }
    } catch (error) {
        // Private-mode quota errors must not break signing in.
        console.warn('[auth] could not persist the session:', error.message);
    }
}

const authSlice = createSlice({
    name: 'auth',
    initialState: readStoredSession(),
    reducers: {
        credentialsReceived(state, action) {
            state.token = action.payload?.token ?? null;
            state.user = action.payload?.user ?? null;

            persistSession({ token: state.token, user: state.user });
        },
        userUpdated(state, action) {
            state.user = action.payload ?? null;

            persistSession({ token: state.token, user: state.user });
        },
        loggedOut() {
            persistSession({ token: null, user: null });

            return { token: null, user: null };
        },
    },
});

export const { credentialsReceived, userUpdated, loggedOut } = authSlice.actions;

// --- Selectors --------------------------------------------------------------
export const selectToken = (state) => state.auth.token;
export const selectUser = (state) => state.auth.user;
export const selectIsAuthenticated = (state) => Boolean(state.auth.token);

export default authSlice.reducer;
