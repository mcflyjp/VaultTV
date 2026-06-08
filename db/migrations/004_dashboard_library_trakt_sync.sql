-- Migration: add dashboard, library, and trakt sync columns to user_settings
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS dashboard_sections JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS library            JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS trakt_creds        JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS trakt_auth         JSONB DEFAULT NULL;
