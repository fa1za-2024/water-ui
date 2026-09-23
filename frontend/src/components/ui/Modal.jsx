import { useCallback, useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

/**
 * Modal primitive (T-311, first of the `ui/` components).
 *
 * Hand-rolled on purpose: T-311 still has to choose between Shadcn/ui and Headless UI,
 * and neither is installed. Rather than pull in a dependency ahead of that decision, this
 * implements the behaviour the app needs and nothing more:
 *
 *   - `role="dialog"` + `aria-modal` + `aria-labelledby`, so the title names it
 *   - Escape closes; clicking the backdrop closes; clicking inside does not
 *   - focus moves into the panel on open and returns to the trigger on close
 *   - Tab cycles inside the panel (a simple trap - no focus escapes to the page behind)
 *   - the page behind cannot scroll while it is open
 *
 * If T-311 later adopts a library, this file is the one to replace.
 */
const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Modal({ open, onClose, title, description, children, footer }) {
    const panelRef = useRef(null);
    const titleId = useId();
    const descriptionId = useId();

    // Remember what had focus, so closing returns it (otherwise the keyboard user is
    // dropped back at the top of the document).
    useEffect(() => {
        if (!open) return undefined;

        const previouslyFocused = document.activeElement;

        return () => {
            if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
        };
    }, [open]);

    // Move focus into the panel as soon as it appears.
    useEffect(() => {
        if (!open) return undefined;

        const first = panelRef.current?.querySelector(FOCUSABLE);
        (first ?? panelRef.current)?.focus();

        return undefined;
    }, [open]);

    // Lock background scrolling.
    useEffect(() => {
        if (!open) return undefined;

        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        return () => {
            document.body.style.overflow = previous;
        };
    }, [open]);

    /**
     * Escape closes from anywhere.
     *
     * This listens on `document` rather than on the panel: a handler on the panel only
     * fires while focus is inside it, so Escape silently does nothing if focus has moved
     * (or was never moved). The browser check caught exactly that.
     */
    useEffect(() => {
        if (!open) return undefined;

        const onKeyDown = (event) => {
            if (event.key === 'Escape') onClose();
        };

        document.addEventListener('keydown', onKeyDown);

        return () => document.removeEventListener('keydown', onKeyDown);
    }, [open, onClose]);

    // Tab cycles inside the panel - this one must stay on the panel so it can wrap focus.
    const onKeyDown = useCallback(
        (event) => {
            if (event.key !== 'Tab') return;

            const focusable = [...(panelRef.current?.querySelectorAll(FOCUSABLE) ?? [])];
            if (focusable.length === 0) return;

            const first = focusable[0];
            const last = focusable[focusable.length - 1];

            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        },
        [onClose]
    );

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-gray-900/40 p-4"
            // Only a click on the backdrop itself closes - a click that started inside the
            // panel and ended on the backdrop (text selection drag) must not.
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={description ? descriptionId : undefined}
                tabIndex={-1}
                onKeyDown={onKeyDown}
                className="w-full max-w-lg rounded-xl bg-white shadow-xl outline-none"
            >
                <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-4">
                    <div>
                        <h2 id={titleId} className="text-lg font-semibold text-gray-800">
                            {title}
                        </h2>
                        {description ? (
                            <p id={descriptionId} className="mt-1 text-sm text-gray-500">
                                {description}
                            </p>
                        ) : null}
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close dialog"
                        className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    >
                        <X className="h-5 w-5" aria-hidden="true" />
                    </button>
                </div>

                <div className="px-6 py-5">{children}</div>

                {footer ? (
                    <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 px-6 py-4">
                        {footer}
                    </div>
                ) : null}
            </div>
        </div>
    );
}
