import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { useGetMeQuery, useLoginMutation } from '../api/authApi.js';
import {
    credentialsReceived,
    loggedOut,
    selectToken,
    selectUser,
    userUpdated,
} from '../store/slices/authSlice.js';

/**
 * The single place that knows how a session is created, restored and destroyed
 * (T-304 + T-303).
 *
 * Pages and guards use this instead of touching the slice or the endpoints directly,
 * so the rules live in one file:
 *   - `signIn` posts through RTK Query and stores `{ token, user }` (the 6.1 contract).
 *   - On boot, a persisted token with no cached `user` is re-validated with
 *     `GET /api/auth/me`; a 401 clears the session, which sends the user to /login.
 *   - `isRestoring` is true during that check, so a guard can wait instead of
 *     bouncing a valid session to the login screen.
 */
export function useAuth() {
    const dispatch = useDispatch();
    const token = useSelector(selectToken);
    const user = useSelector(selectUser);

    const {
        data: me,
        isFetching: isRestoring,
        isError: restoreFailed,
    } = useGetMeQuery(undefined, {
        // Only when there is a token that we have not resolved to a profile yet.
        skip: !token || Boolean(user),
    });

    useEffect(() => {
        if (me?.user) dispatch(userUpdated(me.user));
    }, [me, dispatch]);

    useEffect(() => {
        if (restoreFailed) dispatch(loggedOut());
    }, [restoreFailed, dispatch]);

    const [loginRequest, { isLoading: isSigningIn }] = useLoginMutation();

    const signIn = async ({ email, password }) => {
        const result = await loginRequest({ email, password }).unwrap();
        dispatch(credentialsReceived(result));
        return result;
    };

    const signOut = () => dispatch(loggedOut());

    return {
        token,
        user,
        isAuthenticated: Boolean(token),
        isRestoring: Boolean(token) && !user && isRestoring,
        isSigningIn,
        signIn,
        signOut,
    };
}

export default useAuth;
