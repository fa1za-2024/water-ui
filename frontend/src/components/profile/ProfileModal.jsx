import { useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { Camera, KeyRound, LoaderCircle, User } from 'lucide-react';

import {
    useChangePasswordMutation,
    useGetProfileQuery,
    useUpdateProfileMutation,
    useUploadAvatarMutation,
} from '../../api/authApi.js';
import { userUpdated } from '../../store/slices/authSlice.js';
import { describeApiFailure } from '../../utils/apiError.js';
import Modal from '../ui/Modal.jsx';

/**
 * Update-profile modal (T-324, restated as a modal rather than a page).
 *
 * Opens from the header's avatar menu (§1.2 "profile settings"), so the profile is
 * available from any page without navigating away from it.
 *
 * Endpoints (§6.1):
 *   GET  /api/users/profile          -> 200 { user }
 *   PUT  /api/users/profile          -> 200 { user }  | 400 empty/invalid, 409 duplicate email or phone
 *   PUT  /api/users/password         -> 200 { message } | 401 wrong current, 400 weak/reused
 *   POST /api/users/upload-avatar    -> 200 { profilePictureUrl, user } | 413 >2 MB, 415 not PNG/JPEG/WebP
 *
 * The avatar is uploaded as soon as a file is chosen (the endpoint is a single multipart
 * POST with no "pending" state), and every successful write dispatches `userUpdated` so
 * the header's name and picture refresh immediately.
 *
 * Password change (A21/T-204) is a separate section with its own submit: it needs the
 * current password, a new one and a confirmation, and it deliberately does not touch the
 * profile form or the session.
 */
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const MIN_PASSWORD_LENGTH = 8;
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

const EMPTY_FORM = { firstName: '', lastName: '', email: '', phone: '' };
const EMPTY_PASSWORD_FORM = { current: '', next: '', confirm: '' };

export default function ProfileModal({ open, onClose }) {
    const dispatch = useDispatch();

    // `skip` until it is opened, so the app does not fetch the profile on every page.
    const { data, isLoading, isError, error } = useGetProfileQuery(undefined, { skip: !open });
    const [updateProfile, { isLoading: isSaving }] = useUpdateProfileMutation();
    const [uploadAvatar, { isLoading: isUploading }] = useUploadAvatarMutation();
    const [changePassword, { isLoading: isChangingPassword }] = useChangePasswordMutation();

    const [form, setForm] = useState(EMPTY_FORM);
    const [feedback, setFeedback] = useState(null);
    const [passwordForm, setPasswordForm] = useState(EMPTY_PASSWORD_FORM);
    const [passwordFeedback, setPasswordFeedback] = useState(null);
    const fileInputRef = useRef(null);

    const profile = data?.user ?? null;

    // Clear any leftover message (and never leave a typed password) when the modal is
    // (re)opened.
    useEffect(() => {
        if (!open) return;

        setFeedback(null);
        setPasswordFeedback(null);
        setPasswordForm(EMPTY_PASSWORD_FORM);
    }, [open]);

    /**
     * Seed the fields on open and when the *row* changes - deliberately NOT on every
     * refetch of the profile. Saving invalidates the `User` tag, which refetches
     * `getProfile`; keying this on the profile object reset the form and wiped the
     * "Profile updated." confirmation the instant it appeared (observed in the browser
     * check). `profile?.id` keeps the form stable while still picking up a different
     * profile.
     */
    useEffect(() => {
        if (!open || !profile) return;

        setForm({
            firstName: profile.firstName ?? '',
            lastName: profile.lastName ?? '',
            email: profile.email ?? '',
            phone: profile.phone ?? '',
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, profile?.id]);

    const update = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));
    const updatePassword = (field) => (event) =>
        setPasswordForm((prev) => ({ ...prev, [field]: event.target.value }));

    /**
     * Change the password (A21/T-204). Checked locally first so an obviously invalid
     * submission never leaves the browser - and the same rules the API enforces (>= 8
     * characters, must differ from the current one) are mirrored here.
     */
    async function handlePasswordSubmit(event) {
        event.preventDefault();
        setPasswordFeedback(null);

        if (!passwordForm.current) {
            setPasswordFeedback({ kind: 'error', text: 'Your current password is required.' });
            return;
        }

        if (passwordForm.next.length < MIN_PASSWORD_LENGTH) {
            setPasswordFeedback({
                kind: 'error',
                text: `The new password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
            });
            return;
        }

        if (passwordForm.next === passwordForm.current) {
            setPasswordFeedback({
                kind: 'error',
                text: 'The new password must be different from the current one.',
            });
            return;
        }

        if (passwordForm.next !== passwordForm.confirm) {
            setPasswordFeedback({ kind: 'error', text: 'The two new passwords do not match.' });
            return;
        }

        try {
            await changePassword({
                currentPassword: passwordForm.current,
                newPassword: passwordForm.next,
            }).unwrap();

            // Never leave a password in component state once it is accepted.
            setPasswordForm(EMPTY_PASSWORD_FORM);
            setPasswordFeedback({ kind: 'success', text: 'Password updated.' });
        } catch (failure) {
            const status = failure?.status;

            if (status === 401) {
                setPasswordFeedback({ kind: 'error', text: 'Current password is incorrect.' });
            } else {
                setPasswordFeedback({
                    kind: 'error',
                    text: describeFailure(failure, 'Could not update the password.'),
                });
            }
        }
    }

    async function handleSubmit(event) {
        event.preventDefault();
        setFeedback(null);

        try {
            const result = await updateProfile(form).unwrap();
            dispatch(userUpdated(result.user));
            setFeedback({ kind: 'success', text: 'Profile updated.' });
        } catch (failure) {
            setFeedback({ kind: 'error', text: describeFailure(failure, 'Could not save the profile.') });
        }
    }

    async function handleAvatarChange(event) {
        const file = event.target.files?.[0];
        setFeedback(null);

        if (!file) return;

        // Check locally first so an obviously wrong file never leaves the browser.
        if (!ALLOWED_TYPES.includes(file.type)) {
            setFeedback({ kind: 'error', text: 'Only PNG, JPEG or WebP images are allowed.' });
            event.target.value = '';
            return;
        }

        if (file.size > MAX_AVATAR_BYTES) {
            setFeedback({ kind: 'error', text: 'That image is larger than 2 MB.' });
            event.target.value = '';
            return;
        }

        try {
            const result = await uploadAvatar(file).unwrap();
            dispatch(userUpdated(result.user));
            setFeedback({ kind: 'success', text: 'Profile picture updated.' });
        } catch (failure) {
            setFeedback({ kind: 'error', text: describeFailure(failure, 'Could not upload the picture.') });
        } finally {
            // Allow re-picking the same file.
            event.target.value = '';
        }
    }

    const initials = [profile?.firstName, profile?.lastName]
        .filter(Boolean)
        .map((part) => part[0]?.toUpperCase())
        .join('');

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="Profile"
            description="View and update the single user profile."
            footer={
                <>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200"
                    >
                        Close
                    </button>
                    <button
                        type="submit"
                        form="profile-form"
                        disabled={isSaving || isLoading || !profile}
                        className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {isSaving ? 'Saving…' : 'Save changes'}
                    </button>
                </>
            }
        >
            {isLoading ? (
                <p className="flex items-center gap-2 text-sm text-gray-500" role="status">
                    <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Loading profile…
                </p>
            ) : null}

            {isError ? (
                <p role="alert" className="rounded-md bg-red-50 p-3 text-sm font-medium text-red-600">
                    {describeFailure(error, 'Could not load the profile.')}
                </p>
            ) : null}

            {profile ? (
                <div className="space-y-5">
                    {/* Avatar + upload */}
                    <div className="flex items-center gap-4">
                        {profile.profilePictureUrl ? (
                            <img
                                src={profile.profilePictureUrl}
                                alt="Current profile picture"
                                className="h-16 w-16 rounded-full object-cover"
                            />
                        ) : (
                            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 text-lg font-semibold text-brand-700">
                                {initials || <User className="h-6 w-6" aria-hidden="true" />}
                            </span>
                        )}

                        <div>
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isUploading}
                                className="flex items-center gap-2 rounded-md bg-gray-100 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {isUploading ? (
                                    <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                                ) : (
                                    <Camera className="h-4 w-4" aria-hidden="true" />
                                )}
                                {isUploading ? 'Uploading…' : 'Change picture'}
                            </button>
                            <p className="mt-1 text-xs text-gray-400">PNG, JPEG or WebP · max 2 MB</p>
                            <input
                                ref={fileInputRef}
                                type="file"
                                name="avatar"
                                accept="image/png,image/jpeg,image/webp"
                                onChange={handleAvatarChange}
                                className="hidden"
                            />
                        </div>
                    </div>

                    {/* Editable fields */}
                    <form id="profile-form" className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit} noValidate>
                        <Field
                            id="firstName"
                            label="First name"
                            value={form.firstName}
                            onChange={update('firstName')}
                            autoComplete="given-name"
                        />
                        <Field
                            id="lastName"
                            label="Last name"
                            value={form.lastName}
                            onChange={update('lastName')}
                            autoComplete="family-name"
                        />
                        <Field
                            id="email"
                            label="Email"
                            type="email"
                            value={form.email}
                            onChange={update('email')}
                            autoComplete="email"
                        />
                        <Field
                            id="phone"
                            label="Phone"
                            type="tel"
                            value={form.phone}
                            onChange={update('phone')}
                            autoComplete="tel"
                        />
                    </form>

                    {feedback ? (
                        <p
                            role={feedback.kind === 'error' ? 'alert' : 'status'}
                            className={`rounded-md p-3 text-sm font-medium ${
                                feedback.kind === 'error'
                                    ? 'bg-red-50 text-red-600'
                                    : 'bg-green-50 text-green-700'
                            }`}
                        >
                            {feedback.text}
                        </p>
                    ) : null}

                    {/* Change password (A21 / T-204) - its own form so it cannot be
                        submitted together with the profile fields. */}
                    <form
                        className="space-y-4 border-t border-gray-100 pt-5"
                        onSubmit={handlePasswordSubmit}
                        noValidate
                    >
                        <div className="flex items-center gap-2">
                            <KeyRound className="h-4 w-4 text-gray-400" aria-hidden="true" />
                            <h3 className="text-sm font-semibold text-gray-700">Change password</h3>
                        </div>

                        <p className="text-xs text-gray-400">
                            Your current password is required: it is what stops someone using your saved
                            session from locking you out. Other signed-in devices are not signed out
                            (tokens are not versioned - see §6.1).
                        </p>

                        <div className="grid gap-4 sm:grid-cols-3">
                            <Field
                                id="currentPassword"
                                label="Current password"
                                type="password"
                                value={passwordForm.current}
                                onChange={updatePassword('current')}
                                autoComplete="current-password"
                            />
                            <Field
                                id="newPassword"
                                label="New password"
                                type="password"
                                value={passwordForm.next}
                                onChange={updatePassword('next')}
                                autoComplete="new-password"
                            />
                            <Field
                                id="confirmPassword"
                                label="Verify new password"
                                type="password"
                                value={passwordForm.confirm}
                                onChange={updatePassword('confirm')}
                                autoComplete="new-password"
                            />
                        </div>

                        {passwordFeedback ? (
                            <p
                                role={passwordFeedback.kind === 'error' ? 'alert' : 'status'}
                                className={`rounded-md p-3 text-sm font-medium ${
                                    passwordFeedback.kind === 'error'
                                        ? 'bg-red-50 text-red-600'
                                        : 'bg-green-50 text-green-700'
                                }`}
                            >
                                {passwordFeedback.text}
                            </p>
                        ) : null}

                        <button
                            type="submit"
                            disabled={isChangingPassword}
                            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isChangingPassword ? 'Updating…' : 'Update password'}
                        </button>
                    </form>
                </div>
            ) : null}
        </Modal>
    );
}

function Field({ id, label, type = 'text', value, onChange, autoComplete }) {
    return (
        <div>
            <label className="mb-1 block text-sm text-gray-500" htmlFor={id}>
                {label}
            </label>
            <input
                id={id}
                name={id}
                type={type}
                value={value}
                onChange={onChange}
                autoComplete={autoComplete}
                className="w-full rounded-md bg-gray-100 px-3 py-2 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-purple-500"
            />
        </div>
    );
}

/**
 * Map an RTK Query rejection to something actionable. The cases the API actually produces:
 * 400 (empty body / invalid field), 409 (duplicate email or phone), 404 (no profile yet),
 * 413/415 (avatar), plus the transport failures.
 *
 * Delegates to the shared reader (`src/utils/apiError.js`), which understands the `{ error }`
 * envelope the API really sends - this used to read `data.message` and so quietly lost the
 * API's own text.
 */
function describeFailure(failure, fallback) {
    if (failure?.status === 413) return 'That image is larger than 2 MB.';

    return describeApiFailure(failure, fallback);
}
