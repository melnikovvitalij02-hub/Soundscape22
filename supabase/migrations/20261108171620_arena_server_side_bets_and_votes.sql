/*
# PvP arena: server-side bets and votes

1. New functions
- place_arena_bet(match, side, amount): checks the match is active, the caller is not a participant, has not bet yet, has enough coins; deducts coins, records the bet and updates the match pools in one transaction.
- cast_arena_vote(match, side): checks the match is active, the caller is not a participant and has not voted; records the vote and increments the match counter.

2. Security
- Both functions are SECURITY DEFINER with an empty search_path and check auth.uid().
- EXECUTE is granted to authenticated only.
- Bets amounts are limited to 10, 50 or 100 coins, matching the arena buttons.
*/

CREATE OR REPLACE FUNCTION public.place_arena_bet(p_match_id uuid, p_side text, p_amount integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  uid uuid := auth.uid();
  m public.pvp_arena_matches%ROWTYPE;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Войдите, чтобы делать ставки' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_side NOT IN ('a', 'b') THEN
    RAISE EXCEPTION 'Неверная сторона ставки' USING ERRCODE = 'check_violation';
  END IF;
  IF p_amount NOT IN (10, 50, 100) THEN
    RAISE EXCEPTION 'Неверная сумма ставки' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO m FROM public.pvp_arena_matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND OR m.status <> 'active' THEN
    RAISE EXCEPTION 'Битва уже недоступна для ставок' USING ERRCODE = 'check_violation';
  END IF;
  IF m.player_a_id = uid OR m.player_b_id = uid THEN
    RAISE EXCEPTION 'Участники битвы не могут делать ставки' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.spectator_bets WHERE match_id = p_match_id AND user_id = uid) THEN
    RAISE EXCEPTION 'Вы уже сделали ставку' USING ERRCODE = 'unique_violation';
  END IF;

  UPDATE public.profiles SET coins = coins - p_amount WHERE id = uid AND coins >= p_amount;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Недостаточно монет' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.spectator_bets (match_id, user_id, bet_on, coins_wagered)
  VALUES (p_match_id, uid, p_side, p_amount);

  UPDATE public.pvp_arena_matches SET
    total_bets_a = total_bets_a + CASE WHEN p_side = 'a' THEN 1 ELSE 0 END,
    coins_pool_a = coins_pool_a + CASE WHEN p_side = 'a' THEN p_amount ELSE 0 END,
    total_bets_b = total_bets_b + CASE WHEN p_side = 'b' THEN 1 ELSE 0 END,
    coins_pool_b = coins_pool_b + CASE WHEN p_side = 'b' THEN p_amount ELSE 0 END
  WHERE id = p_match_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cast_arena_vote(p_match_id uuid, p_side text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  uid uuid := auth.uid();
  m public.pvp_arena_matches%ROWTYPE;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Войдите, чтобы голосовать' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_side NOT IN ('a', 'b') THEN
    RAISE EXCEPTION 'Неверная сторона голоса' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO m FROM public.pvp_arena_matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND OR m.status <> 'active' THEN
    RAISE EXCEPTION 'Битва уже недоступна для голосования' USING ERRCODE = 'check_violation';
  END IF;
  IF m.player_a_id = uid OR m.player_b_id = uid THEN
    RAISE EXCEPTION 'Участники битвы не могут голосовать' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.spectator_votes WHERE match_id = p_match_id AND user_id = uid) THEN
    RAISE EXCEPTION 'Вы уже проголосовали' USING ERRCODE = 'unique_violation';
  END IF;

  INSERT INTO public.spectator_votes (match_id, user_id, vote_for) VALUES (p_match_id, uid, p_side);

  UPDATE public.pvp_arena_matches SET
    spectator_votes_a = spectator_votes_a + CASE WHEN p_side = 'a' THEN 1 ELSE 0 END,
    spectator_votes_b = spectator_votes_b + CASE WHEN p_side = 'b' THEN 1 ELSE 0 END
  WHERE id = p_match_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.place_arena_bet(uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.place_arena_bet(uuid, text, integer) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cast_arena_vote(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cast_arena_vote(uuid, text) TO authenticated;
