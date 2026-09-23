/**
 * Water UI - Prisma seed script
 *
 * Creates the single user profile and one sample board so the dashboard has
 * something to render. Safe to re-run: both writes are upserts.
 *
 * Run with:  npm run prisma:seed        (from backend/, executed via tsx)
 *
 * The password comes from SEED_PASSWORD, defaulting to "waterui123" - change it
 * before this ever faces a network.
 */
import 'dotenv/config';

import bcrypt from 'bcrypt';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

import { PrismaClient } from '../src/generated/prisma/client';

const DEFAULT_DATABASE_URL = 'mysql://water_user:supersecretuser@localhost:3306/water_ui';

function buildAdapter(rawUrl: string | undefined) {
    const url = new URL(rawUrl ?? DEFAULT_DATABASE_URL);

    return new PrismaMariaDb({
        host: url.hostname,
        port: url.port ? Number(url.port) : 3306,
        user: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
        database: url.pathname.replace(/^\//, ''),
        connectionLimit: 5,
    });
}

const prisma = new PrismaClient({
    adapter: buildAdapter(process.env.DATABASE_URL),
});

async function main(): Promise<void> {
    const password = process.env.SEED_PASSWORD ?? 'waterui123';
    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.upsert({
        where: { email: 'admin@waterui.local' },
        update: {},
        create: {
            firstName: 'Water',
            lastName: 'Admin',
            email: 'admin@waterui.local',
            phone: '+66000000000',
            passwordHash,
        },
    });
    console.log(`[seed] user ready: ${user.email} (password: ${password})`);

    const board = await prisma.board.upsert({
        where: { boardId: 'AA240238' },
        update: {},
        create: {
            boardId: 'AA240238',
            boardMacAddress: '00:1A:2B:3C:4D:5E',
            locationName: 'Tank 1',
            latitude: 13.7563,
            longitude: 100.5018,
            isActive: true,
        },
    });
    console.log(`[seed] board ready: ${board.boardId} @ ${board.locationName}`);
}

main()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (error: unknown) => {
        console.error('[seed] failed:', error);
        await prisma.$disconnect();
        process.exit(1);
    });
