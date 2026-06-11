-- Migration: add server_url for remote VaultTV Server discovery (Plex-style)
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS server_url text DEFAULT NULL;
