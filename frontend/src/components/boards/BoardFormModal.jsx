import { useEffect, useState } from 'react';
import { LoaderCircle } from 'lucide-react';

import { useCreateBoardMutation, useUpdateBoardMutation } from '../../api/boardApi.js';
import Modal from '../ui/Modal.jsx';
import { conflictField, describeBoardFailure } from './boardPresentation.js';

/**
 * Add / Edit board modal (T-319; the row's ✏️ reuses it).
 *
 * One component for both because the fields are identical - only `boardId` differs: it is
 * disabled when editing, since it is the MQTT topic level and the InfluxDB tag, so
 * changing it would orphan the board's series (6.2).
 *
 * Client rules mirror the API's Zod schema exactly (same patterns, same ranges), so a bad
 * value is caught before the round trip; the API still has the last word, and its 409
 * (naming the clashing unique column) is shown against that field.
 */
const BOARD_ID_PATTERN = /^[A-Za-z0-9_-]{1,50}$/;
const MAC_ADDRESS_PATTERN = /^[0-9A-Fa-f]{2}(?::[0-9A-Fa-f]{2}){5}$/;
const LATITUDE_RANGE = { min: -90, max: 90 };
const LONGITUDE_RANGE = { min: -180, max: 180 };

const EMPTY_FORM = {
    boardId: '',
    boardMacAddress: '',
    locationName: '',
    latitude: '',
    longitude: '',
};

export default function BoardFormModal({ open, board, onClose }) {
    const isEdit = Boolean(board);
    const [createBoard, { isLoading: isCreating }] = useCreateBoardMutation();
    const [updateBoard, { isLoading: isUpdating }] = useUpdateBoardMutation();

    const [form, setForm] = useState(EMPTY_FORM);
    const [errors, setErrors] = useState({});
    const [failure, setFailure] = useState(null);

    const saving = isCreating || isUpdating;

    // Seed on open (and when a different board is picked). Not keyed on the whole board
    // object: a refetch after saving would otherwise reset the fields.
    useEffect(() => {
        if (!open) return;

        setErrors({});
        setFailure(null);

        setForm(
            board
                ? {
                      boardId: board.boardId ?? '',
                      boardMacAddress: board.boardMacAddress ?? '',
                      locationName: board.locationName ?? '',
                      latitude: String(board.latitude ?? ''),
                      longitude: String(board.longitude ?? ''),
                  }
                : EMPTY_FORM
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, board?.boardId]);

    const update = (field) => (event) => {
        setForm((previous) => ({ ...previous, [field]: event.target.value }));
        setErrors((previous) => ({ ...previous, [field]: undefined }));
    };

    /** Same checks the API runs, so the user is not made to wait for an obvious error. */
    function validate() {
        const found = {};
        const latitude = Number(form.latitude);
        const longitude = Number(form.longitude);

        if (!isEdit) {
            if (!BOARD_ID_PATTERN.test(form.boardId.trim())) {
                found.boardId = 'Use 1-50 characters: A-Z, a-z, 0-9, "_" or "-".';
            }
        }

        if (!MAC_ADDRESS_PATTERN.test(form.boardMacAddress.trim())) {
            found.boardMacAddress = 'Use the form 00:1A:2B:3C:4D:5E.';
        }

        if (form.locationName.trim().length === 0) {
            found.locationName = 'A location name is required.';
        } else if (form.locationName.trim().length > 100) {
            found.locationName = 'Keep it to 100 characters or fewer.';
        }

        if (form.latitude === '' || Number.isNaN(latitude)) {
            found.latitude = 'Latitude is required.';
        } else if (latitude < LATITUDE_RANGE.min || latitude > LATITUDE_RANGE.max) {
            found.latitude = `Between ${LATITUDE_RANGE.min} and ${LATITUDE_RANGE.max}.`;
        }

        if (form.longitude === '' || Number.isNaN(longitude)) {
            found.longitude = 'Longitude is required.';
        } else if (longitude < LONGITUDE_RANGE.min || longitude > LONGITUDE_RANGE.max) {
            found.longitude = `Between ${LONGITUDE_RANGE.min} and ${LONGITUDE_RANGE.max}.`;
        }

        setErrors(found);
        return Object.keys(found).length === 0;
    }

    async function handleSubmit(event) {
        event.preventDefault();
        setFailure(null);

        if (!validate()) return;

        const payload = {
            boardMacAddress: form.boardMacAddress.trim().toUpperCase(),
            locationName: form.locationName.trim(),
            latitude: Number(form.latitude),
            longitude: Number(form.longitude),
        };

        try {
            if (isEdit) {
                await updateBoard({ boardId: board.boardId, ...payload }).unwrap();
            } else {
                await createBoard({ boardId: form.boardId.trim(), ...payload }).unwrap();
            }

            onClose();
        } catch (error) {
            // A 409 names the clashing column, so point at the offending input.
            const message = describeBoardFailure(
                error,
                isEdit ? 'Could not save the board.' : 'Could not add the board.'
            );
            const field = error?.status === 409 ? conflictField(message) : null;

            if (field) setErrors((previous) => ({ ...previous, [field]: message }));
            else setFailure(message);
        }
    }

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={isEdit ? `Edit ${board?.boardId}` : 'Add board'}
            description={
                isEdit
                    ? 'Update the location and coordinates. The board ID cannot change.'
                    : 'Register a sensor board so its readings are accepted.'
            }
            footer={
                <>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        form="board-form"
                        disabled={saving}
                        className="flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {saving ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                        {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add board'}
                    </button>
                </>
            }
        >
            <form id="board-form" className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit} noValidate>
                <Field
                    id="boardId"
                    label="Board ID"
                    value={form.boardId}
                    onChange={update('boardId')}
                    disabled={isEdit}
                    error={errors.boardId}
                    hint={
                        isEdit
                            ? 'Immutable: it is the MQTT topic level and the InfluxDB tag.'
                            : 'Also the MQTT topic level, e.g. AA240238.'
                    }
                />
                <Field
                    id="boardMacAddress"
                    label="MAC Address"
                    value={form.boardMacAddress}
                    onChange={update('boardMacAddress')}
                    error={errors.boardMacAddress}
                    placeholder="00:1A:2B:3C:4D:5E"
                />
                <Field
                    id="locationName"
                    label="Location Name"
                    value={form.locationName}
                    onChange={update('locationName')}
                    error={errors.locationName}
                    placeholder="Rural community tank"
                />
                <div className="grid grid-cols-2 gap-4">
                    <Field
                        id="latitude"
                        label="Latitude"
                        value={form.latitude}
                        onChange={update('latitude')}
                        error={errors.latitude}
                        placeholder="3.139000"
                    />
                    <Field
                        id="longitude"
                        label="Longitude"
                        value={form.longitude}
                        onChange={update('longitude')}
                        error={errors.longitude}
                        placeholder="101.686900"
                    />
                </div>

                {failure ? (
                    <p
                        role="alert"
                        className="rounded-md bg-red-50 p-3 text-sm font-medium text-red-600 sm:col-span-2"
                    >
                        {failure}
                    </p>
                ) : null}
            </form>
        </Modal>
    );
}

function Field({ id, label, value, onChange, error, hint, placeholder, disabled = false }) {
    return (
        <div>
            <label className="mb-1 block text-sm text-gray-500" htmlFor={id}>
                {label}
            </label>
            <input
                id={id}
                name={id}
                type="text"
                value={value}
                onChange={onChange}
                disabled={disabled}
                placeholder={placeholder}
                aria-invalid={error ? 'true' : undefined}
                aria-describedby={error ? `${id}-error` : undefined}
                className={`w-full rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-500 ${
                    error ? 'bg-red-50 ring-1 ring-red-300' : 'bg-gray-100'
                } ${disabled ? 'cursor-not-allowed text-gray-400' : 'text-gray-800'}`}
            />
            {error ? (
                <p id={`${id}-error`} role="alert" className="mt-1 text-xs font-medium text-red-600">
                    {error}
                </p>
            ) : hint ? (
                <p className="mt-1 text-xs text-gray-400">{hint}</p>
            ) : null}
        </div>
    );
}
