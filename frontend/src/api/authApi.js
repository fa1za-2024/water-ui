import { apiSlice } from './apiSlice.js';

/**
 * Auth endpoints (T-302 - auth module).
 *
 * Rule: RTK Query for ALL calls, so the login form never touches fetch/axios.
 * Endpoints are injected into the shared `apiSlice` (src/api/apiSlice.js) rather
 * than creating a second cache.
 *
 * Contract (MASTER_CONTEXT.md 6.1, verified against the running API):
 *   POST /api/auth/login -> 200 { token, user }   | 401 { error: "Invalid email or password" }
 *   GET  /api/auth/me    -> 200 { user }          | 401 when the token is missing/expired
 *
 * NOT exposed here: `POST /api/auth/register`. It only bootstraps the single profile
 * and answers 409 once a user exists, so there is nothing for a page to call (A20) -
 * the account is created by `npm run prisma:seed` or that one-off bootstrap call.
 */
export const authApi = apiSlice.injectEndpoints({
    endpoints: (builder) => ({
        login: builder.mutation({
            query: (credentials) => ({
                url: '/auth/login',
                method: 'POST',
                body: credentials,
            }),
            // A fresh login can change who /api/auth/me returns.
            invalidatesTags: ['User'],
        }),

        // Used on boot to confirm a persisted token is still valid (T-303).
        getMe: builder.query({
            query: () => '/auth/me',
            providesTags: ['User'],
        }),

        // --- Users module (§6.1) - the profile endpoints live in this file ---------
        // Two routers back this module (A20): /api/auth for auth and /api/users for the
        // profile. They are the same feature, so they share one api file rather than
        // inventing a usersApi.js the documented structure does not list.

        getProfile: builder.query({
            query: () => '/users/profile',
            providesTags: ['User'],
        }),

        updateProfile: builder.mutation({
            // Body: at least one of firstName / lastName / email / phone (the API
            // rejects an empty object with 400 and a duplicate with 409).
            query: (changes) => ({
                url: '/users/profile',
                method: 'PUT',
                body: changes,
            }),
            invalidatesTags: ['User'],
        }),

        uploadAvatar: builder.mutation({
            query: (file) => {
                // FormData must be passed through untouched: fetchBaseQuery leaves the
                // Content-Type alone so the browser can add the multipart boundary.
                const body = new FormData();
                body.append('avatar', file);

                return { url: '/users/upload-avatar', method: 'POST', body };
            },
            invalidatesTags: ['User'],
        }),

        changePassword: builder.mutation({
            /**
             * PUT /api/users/password (A21/T-204).
             *
             * Body is `{ currentPassword, newPassword }` - the current one is required even
             * though the request is already authenticated, so a stolen token cannot lock the
             * owner out. The API answers 401 when it does not match, and 400 when the new
             * password breaks the rule (>= 8 characters) or equals the current one.
             *
             * Deliberately does NOT invalidate the `User` tag: nothing about the profile
             * changed, and a refetch would only make the modal flicker.
             */
            query: (passwords) => ({
                url: '/users/password',
                method: 'PUT',
                body: passwords,
            }),
        }),
    }),
});

export const {
    useLoginMutation,
    useGetMeQuery,
    useLazyGetMeQuery,
    useGetProfileQuery,
    useUpdateProfileMutation,
    useUploadAvatarMutation,
    useChangePasswordMutation,
} = authApi;
