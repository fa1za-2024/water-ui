/**
 * PostCSS configuration - Tailwind CSS v4.
 *
 * In v4 the PostCSS plugin moved to its own package (@tailwindcss/postcss) and
 * autoprefixer is no longer needed, because Tailwind v4 handles vendor
 * prefixing internally.
 */
export default {
    plugins: {
        '@tailwindcss/postcss': {},
    },
};
