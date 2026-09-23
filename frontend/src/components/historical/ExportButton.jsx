import { useState } from 'react';
import { Download, LoaderCircle } from 'lucide-react';

import { useExportReadingsMutation } from '../../api/historicalApi.js';
import { describeApiFailure } from '../../utils/apiError.js';

/**
 * How long the downloaded blob stays addressable.
 *
 * Not a timeout for correctness - it only has to outlast the browser picking the data up
 * (see the note in `handleExport`). One minute is generous and then the memory is freed.
 */
const BLOB_RELEASE_MS = 60_000;

/**
 * "Export to Excel" button (T-323) - ui-requirement 4.3 and **Rule 3** (the file is built by
 * Express with `exceljs`; the browser never assembles a workbook) and it belongs at the
 * **top** of the readings table.
 *
 * Why a fetch instead of an `<a href download>`: the export route requires the same Bearer
 * token as every other endpoint and the token lives in the Redux store, not in a cookie, so a
 * plain link would answer 401. The RTK Query mutation returns the blob **and the filename the
 * server chose** (`Content-Disposition`), which is then saved through an object URL that is
 * revoked immediately after - a long-lived blob URL would leak the workbook.
 *
 * The button exports the **current filters** (board + range/custom window), which is what
 * "exports the currently filtered data" means: the server caps the file at its own documented
 * row limit rather than silently truncating here.
 */
export default function ExportButton({ boardId, range, start, end, disabled }) {
    const [exportReadings, { isLoading }] = useExportReadingsMutation();
    const [failure, setFailure] = useState(null);

    async function handleExport() {
        setFailure(null);

        try {
            const result = await exportReadings({ boardId, range, start, end }).unwrap();
            const url = URL.createObjectURL(result.blob);
            const link = document.createElement('a');

            link.href = url;
            link.download = result.filename || `water-quality-${boardId}.xlsx`;
            document.body.appendChild(link);
            link.click();
            link.remove();

            /**
             * Release the blob URL on a delay rather than in the same task as `click()`.
             *
             * A precaution, not a fix for an observed failure: some browsers abort a download
             * whose blob URL is revoked immediately, and revoking later is the pattern they are
             * happiest with. Chrome completes **either** way - verified side by side, both files
             * saved with the right bytes. An earlier check that reported a *cancelled* download
             * was the harness's fault, not this code's: it handed the CDP download setting a
             * forward-slash path, which Chrome refused.
             */
            window.setTimeout(() => URL.revokeObjectURL(url), BLOB_RELEASE_MS);
        } catch (error) {
            setFailure(describeApiFailure(error, 'Could not export the readings.'));
        }
    }

    return (
        <div className="flex flex-col items-end gap-1">
            <button
                type="button"
                onClick={handleExport}
                disabled={disabled || isLoading}
                title="Download the current filter as an .xlsx file (built by the API with exceljs)"
                className="flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
                {isLoading ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                    <Download className="h-4 w-4" aria-hidden="true" />
                )}
                {isLoading ? 'Exporting…' : 'Export to Excel'}
            </button>

            {failure ? (
                <p role="alert" className="text-xs font-medium text-red-600">
                    {failure}
                </p>
            ) : null}
        </div>
    );
}
