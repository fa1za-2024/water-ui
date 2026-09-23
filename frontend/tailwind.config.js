/**
 * Tailwind CSS configuration.
 *
 * Tailwind v4 is CSS-first: the real theme lives in src/index.css. This file
 * still exists (and is loaded) because the documented project structure calls
 * for it, and it is the convenient place for content globs and design tokens
 * that you want in JavaScript.
 *
 * It is pulled in by `@config "../tailwind.config.js";` at the top of
 * src/index.css. If this file and the @theme block in index.css ever disagree,
 * the CSS wins - so keep tokens in ONE of the two, not both.
 */
export default {
    content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
    theme: {
        extend: {
            // Matches the sidebar accent documented in ui-requirement.md 1.1
            // (bg-purple-50 / text-purple-700 / border-purple-600).
            colors: {
                brand: {
                    50: '#f5f3ff',
                    100: '#ede9fe',
                    600: '#7c3aed',
                    700: '#6d28d9',
                },
                // Water-status palette, aligned with the legend in
                // MASTER_CONTEXT.md 7.8: Safe=green, Acceptable=yellow, Unsafe=red.
                status: {
                    safe: '#22c55e',
                    acceptable: '#eab308',
                    unsafe: '#ef4444',
                },
            },
        },
    },
};
