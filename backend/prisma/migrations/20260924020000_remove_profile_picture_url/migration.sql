-- Drop the avatar column: the profile-picture feature (and MinIO) was removed.
-- The backend, the API response shape and the UI no longer reference it (T-1.6).
ALTER TABLE `users` DROP COLUMN `profile_picture_url`;
