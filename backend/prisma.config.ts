// Water UI - Prisma CLI configuration (Prisma 7)
//
// Prisma 7 moved CLI configuration out of package.json#prisma into this file.
// The datasource URL is resolved here so `prisma migrate` / `prisma studio`
// know where to connect; the running application connects through the
// MariaDB driver adapter instead - see src/config/db.js.
import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
    // Path is relative to the project root (backend/), not to this file.
    schema: 'prisma/schema.prisma',

    datasource: {
        url: env('DATABASE_URL'),
    },
});
