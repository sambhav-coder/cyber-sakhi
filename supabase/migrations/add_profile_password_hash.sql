-- ============================================================
-- Cyber Sakhi Phase 1 Migration 2
-- Purpose:
--   1. Add password_hash column to profiles for bcrypt password
--      storage used by Sakhi Number + Password login.
-- Safety:
--   Idempotent (IF NOT EXISTS). No data drops, no destructive ALTERs.
-- ============================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS password_hash TEXT;