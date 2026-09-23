/**
 * MinIO object storage - profile pictures.
 *
 * MASTER_CONTEXT.md section 2: "File Storage: MinIO (or AWS S3) - Store profile
 * pictures. Save URL in MySQL." Compose creates the bucket with its one-shot
 * `minio-init` service; Railway has no equivalent, so ensureBucket() - which also
 * sets the anonymous-read policy - is the primary path there rather than a
 * fallback.
 */
import { Client } from 'minio';

const endPoint = process.env.MINIO_ENDPOINT ?? 'localhost';
const port = Number(process.env.MINIO_PORT ?? 9000);
const useSSL = (process.env.MINIO_USE_SSL ?? 'false') === 'true';

export const MINIO_BUCKET = process.env.MINIO_BUCKET_NAME ?? 'profile-pictures';

/**
 * Base URL a BROWSER can use. It cannot resolve the compose service name
 * `minio`, so this defaults to localhost with the published host port.
 */
export const MINIO_PUBLIC_URL =
    process.env.MINIO_PUBLIC_URL ?? `http${useSSL ? 's' : ''}://localhost:${port}`;

export const minioClient = new Client({
    endPoint,
    port,
    useSSL,
    accessKey: process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
    secretKey: process.env.MINIO_SECRET_KEY ?? 'minioadmin',
});

/**
 * Anonymous read-only bucket policy.
 *
 * Avatars are loaded by the BROWSER straight from MINIO_PUBLIC_URL, so the
 * bucket has to allow unauthenticated GET. Compose does this with the one-shot
 * `minio-init` service (`mc anonymous set download`); asserting it here keeps
 * the two paths consistent and means Railway - which has no equivalent one-shot
 * job - needs no extra service to serve profile pictures.
 */
function publicReadPolicy(bucket: string): string {
    return JSON.stringify({
        Version: '2012-10-17',
        Statement: [
            {
                Effect: 'Allow',
                Principal: { AWS: ['*'] },
                Action: ['s3:GetObject'],
                Resource: [`arn:aws:s3:::${bucket}/*`],
            },
        ],
    });
}

/** Create the bucket if it is missing and make sure it is publicly readable. */
export async function ensureBucket(bucket: string = MINIO_BUCKET): Promise<void> {
    const exists = await minioClient.bucketExists(bucket);
    if (!exists) {
        await minioClient.makeBucket(bucket);
        console.log(`[minio] created bucket ${bucket}`);
    }

    // Idempotent, and cheap enough to re-assert on every upload.
    await minioClient.setBucketPolicy(bucket, publicReadPolicy(bucket));
}

/** Upload a buffer and return the public URL to store in MySQL. */
export async function uploadPublicObject(
    objectName: string,
    buffer: Buffer,
    contentType: string,
    bucket: string = MINIO_BUCKET
): Promise<string> {
    await minioClient.putObject(bucket, objectName, buffer, buffer.length, {
        'Content-Type': contentType,
    });

    return `${MINIO_PUBLIC_URL}/${bucket}/${objectName}`;
}

/** Remove an object, ignoring "not found" so callers can clean up eagerly. */
export async function removeObject(
    objectName: string,
    bucket: string = MINIO_BUCKET
): Promise<void> {
    try {
        await minioClient.removeObject(bucket, objectName);
    } catch (error) {
        console.warn('[minio] could not remove object', objectName, error);
    }
}

/** Extract the object key from a URL this module produced. */
export function objectNameFromUrl(url: string): string | null {
    const prefix = `${MINIO_PUBLIC_URL}/${MINIO_BUCKET}/`;
    return url.startsWith(prefix) ? url.slice(prefix.length) : null;
}
