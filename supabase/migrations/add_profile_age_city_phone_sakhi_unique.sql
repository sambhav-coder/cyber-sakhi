-- ============================================================
-- Cyber Sakhi Phase 1 Migration
-- Purpose:
--   1. Add age, city, phone columns to profiles if missing
--   2. Add UNIQUE constraint/index on sakhi_number if missing
-- Safety:
--   Every operation is idempotent (IF NOT EXISTS / conditional)
--   No data drops, no destructive ALTERs
-- ============================================================

-- 1. Add age column (text, nullable — stays nullable to preserve existing rows)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS age TEXT;

-- 2. Add city column (text, nullable)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS city TEXT;

-- 3. Add phone column (text, nullable)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone TEXT;

-- 4. Ensure sakhi_number uniqueness at database level
--    Use CREATE UNIQUE INDEX IF NOT EXISTS (idempotent) rather than ADD CONSTRAINT
--    so this migration is safe to run multiple times, even if a constraint/index
--    was already created manually or by an earlier operation.
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_sakhi_number_unique
    ON profiles (sakhi_number)
    WHERE sakhi_number IS NOT NULL;
