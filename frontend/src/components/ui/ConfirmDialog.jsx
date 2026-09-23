import Modal from './Modal.jsx';

/**
 * Confirmation dialog (T-311, built on the Modal primitive).
 *
 * Used for destructive actions - deleting a board is permanent (ui-requirement 7.3 asks for
 * a confirmation modal). The confirm button is typed as a button, not a submit, so it can
 * never be triggered by pressing Enter in a field of the page behind.
 */
export default function ConfirmDialog({
    open,
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    danger = false,
    busy = false,
    onConfirm,
    onClose,
}) {
    return (
        <Modal
            open={open}
            onClose={busy ? () => {} : onClose}
            title={title}
            footer={
                <>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={busy}
                        className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={busy}
                        className={`rounded-md px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 ${
                            danger ? 'bg-red-600 hover:bg-red-700' : 'bg-brand-600 hover:bg-brand-700'
                        }`}
                    >
                        {busy ? 'Working…' : confirmLabel}
                    </button>
                </>
            }
        >
            <div className="text-sm text-gray-600">{message}</div>
        </Modal>
    );
}
