/*
# Add data column to beats table for saving full track data

1. Modified Tables
- `beats`: adds `data` column (jsonb, nullable) to store the full track/pattern data
  so published beats play the user's actual composition, not just a genre preset.

2. Security
- No policy changes needed — existing RLS policies already cover the new column
  since it's on the same table with the same ownership checks.
*/

ALTER TABLE beats ADD COLUMN IF NOT EXISTS data jsonb;
