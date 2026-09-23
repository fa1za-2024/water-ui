import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { useLocation, useNavigate } from 'react-router-dom';
import { Droplets, Eye, EyeOff, LoaderCircle } from 'lucide-react';

import { useAuth } from '../hooks/useAuth.js';
import { apiErrorMessage } from '../utils/apiError.js';

/**
 * Login page (T-325).
 *
 * NOTE ON THE MOCKUP: `docs/Water UI.png` shows only the signed-in dashboard - there
 * is no login screen in it, and section 1 of ui-requirement.md covers only the app
 * shell. This page therefore reuses the mockup's *visual language* (white rounded
 * card on the light-gray canvas, purple/lavender brand accent, teal water icon,
 * Inter-like type) without inventing a layout the spec does not describe.
 *
 * After a successful sign-in it goes to the page the guard remembered, or to `/`
 * (the Dashboard - the page the mockup actually depicts).
 *
 * The request itself goes through RTK Query (`useAuth` -> `authApi.login`), per the
 * stack rule - no fetch/axios in a component.
 */
export default function Login() {
    const navigate = useNavigate();
    const location = useLocation();
    const { signIn, isSigningIn, isAuthenticated, isRestoring } = useAuth();
    // Read directly from the slice: the profile is dropped on logout, so this page
    // must not depend on `useAuth().user` being populated.
    const user = useSelector((state) => state.auth.user);

    const [form, setForm] = useState({ email: '', password: '' });
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');

    const from = location.state?.from ?? '/';

    // Already signed in (or the persisted token re-validated) - go straight through.
    useEffect(() => {
        if (isAuthenticated && !isRestoring) navigate(from, { replace: true });
    }, [isAuthenticated, isRestoring, from, navigate]);

    const update = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));

    async function handleSubmit(event) {
        event.preventDefault();
        setError('');

        try {
            await signIn({ email: form.email.trim(), password: form.password });
            // Navigation happens in the effect above, once the token is in the store.
        } catch (failure) {
            setError(describeSignInFailure(failure));
        }
    }

    return (
        <div className="flex min-h-full items-center justify-center bg-gray-50 px-4 py-10">
            <div className="w-full max-w-md">
                {/* Brand */}
                <div className="mb-6 flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                        <Droplets className="h-6 w-6" aria-hidden="true" />
                    </span>
                    <div>
                        <p className="text-xl font-bold text-gray-800">Water UI</p>
                        <p className="text-xs text-gray-500">Real-Time Water Quality Monitoring</p>
                    </div>
                </div>

                <div className="rounded-2xl bg-white p-6 shadow-sm sm:p-8">
                    <h1 className="text-lg font-semibold text-gray-800">Sign in</h1>
                    <p className="mt-1 text-sm text-gray-500">
                        Dashboard for Rainwater Harvesting Storage in Rural Communities.
                    </p>

                    {user && !isRestoring ? (
                        <p className="mt-4 rounded-md bg-brand-50 p-3 text-sm text-brand-700">
                            Signed in as {user.email} - redirecting…
                        </p>
                    ) : null}

                    <form className="mt-6 space-y-4" onSubmit={handleSubmit} noValidate>
                        <div>
                            <label className="mb-1 block text-sm text-gray-500" htmlFor="email">
                                Email
                            </label>
                            <input
                                id="email"
                                name="email"
                                type="email"
                                autoComplete="email"
                                required
                                value={form.email}
                                onChange={update('email')}
                                placeholder="you@example.com"
                                className="w-full rounded-md bg-gray-100 px-3 py-2 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-purple-500"
                            />
                        </div>

                        <div>
                            <label className="mb-1 block text-sm text-gray-500" htmlFor="password">
                                Password
                            </label>
                            <div className="relative">
                                <input
                                    id="password"
                                    name="password"
                                    type={showPassword ? 'text' : 'password'}
                                    autoComplete="current-password"
                                    required
                                    value={form.password}
                                    onChange={update('password')}
                                    placeholder="••••••••"
                                    className="w-full rounded-md bg-gray-100 px-3 py-2 pr-10 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-purple-500"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword((visible) => !visible)}
                                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                                    className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600"
                                >
                                    {showPassword ? (
                                        <EyeOff className="h-4 w-4" aria-hidden="true" />
                                    ) : (
                                        <Eye className="h-4 w-4" aria-hidden="true" />
                                    )}
                                </button>
                            </div>
                        </div>

                        {error ? (
                            <p role="alert" className="rounded-md bg-red-50 p-3 text-sm font-medium text-red-600">
                                {error}
                            </p>
                        ) : null}

                        <button
                            type="submit"
                            disabled={isSigningIn}
                            className="flex w-full items-center justify-center gap-2 rounded-md bg-brand-600 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isSigningIn ? (
                                <>
                                    <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                                    Signing in…
                                </>
                            ) : (
                                'Sign in'
                            )}
                        </button>
                    </form>
                </div>

                {/* Development hint only - the seeded account from backend/prisma/seed.ts.
                    Vite removes this branch from a production build. */}
                {import.meta.env.DEV ? (
                    <p className="mt-4 text-center text-xs text-gray-400">
                        Dev fixture: <code>admin@waterui.local</code> / <code>waterui123</code>
                    </p>
                ) : null}
            </div>
        </div>
    );
}

/**
 * Turn an RTK Query rejection into something the user can act on.
 *
 * Every branch below was observed while testing, and the distinction matters:
 *   - `401`  - the credentials really are wrong (the only case where retrying the
 *              form helps).
 *   - `502` / `504` - the Vite dev proxy (or nginx) could not reach the API. Its body
 *              is **plain text, not JSON**, so it must not be reported as a bad
 *              password. This is the "backend not running" case.
 *   - `429`  - the API's own rate limiter (300 req/min/IP in index.ts).
 *   - `FETCH_ERROR` / `TIMEOUT_ERROR` - nothing was serving the request at all.
 */
function describeSignInFailure(failure) {
    const status = failure?.status;
    // The API's envelope is `{ error }` - see src/utils/apiError.js.
    const apiMessage = apiErrorMessage(failure);

    if (status === 401) return 'Incorrect email or password.';

    if (status === 'FETCH_ERROR' || status === 502 || status === 504) {
        return import.meta.env.DEV
            ? 'The API is not answering, so the request never reached it. Start the backend ' +
                  '(cd backend, then `npm run start:host`) and sign in again.'
            : 'The service is temporarily unavailable. Please try again shortly.';
    }

    if (status === 'TIMEOUT_ERROR') return 'The API took too long to answer. Please try again.';

    if (status === 429) {
        return apiMessage ?? 'Too many sign-in attempts. Wait a minute and try again.';
    }

    if (typeof status === 'number' && status >= 500) {
        return apiMessage ?? `The API returned an error (HTTP ${status}). Check the backend log.`;
    }

    return apiMessage ?? 'Sign-in failed. Please try again.';
}
