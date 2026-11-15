ALTER TABLE game_chain_steps DROP CONSTRAINT IF EXISTS game_chain_steps_type_check;
ALTER TABLE game_chain_steps ADD CONSTRAINT game_chain_steps_type_check CHECK (type IN ('prompt', 'drawing', 'beat', 'description'));
