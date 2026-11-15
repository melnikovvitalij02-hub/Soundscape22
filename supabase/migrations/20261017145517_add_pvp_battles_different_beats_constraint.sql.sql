-- Enforce that the two beats in a PvP battle are always different.
-- Prevents self-battles at the database level (defense in depth alongside
-- the client-side checks in PvPBattlesPage.tsx).
ALTER TABLE pvp_battles
  ADD CONSTRAINT pvp_battles_different_beats CHECK (beat_a_id <> beat_b_id);