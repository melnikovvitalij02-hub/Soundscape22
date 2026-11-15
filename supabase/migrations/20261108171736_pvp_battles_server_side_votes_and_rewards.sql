/*
# PvP battles: server-side votes, XP rewards, one-time settlement

1. New functions
- cast_battle_vote(battle, choice): records one vote per user per battle, bumps the battle counter, awards 5 XP to the voter. Rejects own battles, finished or expired battles.
- finish_battle(battle): once a battle's 24h window has passed, sets status to completed and the winner by vote count, and awards 200 XP to the winner. The status change happens under a row lock, so the reward is paid only once even if many clients call it.

2. XP
- Level uses the same formula as change_xp: floor(xp / 500) + 1.

3. Security
- Both functions are SECURITY DEFINER with an empty search_path and check auth.uid().
- EXECUTE is granted to authenticated only.
*/

CREATE OR REPLACE FUNCTION public.cast_battle_vote(p_battle_id uuid, p_choice text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  uid uuid := auth.uid();
  b public.pvp_battles%ROWTYPE;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Войдите, чтобы голосовать' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_choice NOT IN ('a', 'b') THEN
    RAISE EXCEPTION 'Неверный выбор' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO b FROM public.pvp_battles WHERE id = p_battle_id FOR UPDATE;
  IF NOT FOUND OR b.status <> 'active' OR b.ends_at <= now() THEN
    RAISE EXCEPTION 'Голосование по этой битве закрыто' USING ERRCODE = 'check_violation';
  END IF;
  IF b.creator_a_id = uid OR b.creator_b_id = uid THEN
    RAISE EXCEPTION 'Нельзя голосовать в своей битве' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.pvp_votes WHERE battle_id = p_battle_id AND user_id = uid) THEN
    RAISE EXCEPTION 'Вы уже проголосовали' USING ERRCODE = 'unique_violation';
  END IF;

  INSERT INTO public.pvp_votes (battle_id, user_id, choice) VALUES (p_battle_id, uid, p_choice);

  UPDATE public.pvp_battles SET
    votes_a = votes_a + CASE WHEN p_choice = 'a' THEN 1 ELSE 0 END,
    votes_b = votes_b + CASE WHEN p_choice = 'b' THEN 1 ELSE 0 END
  WHERE id = p_battle_id;

  UPDATE public.profiles SET xp = xp + 5, level = floor((xp + 5)::numeric / 500)::integer + 1 WHERE id = uid;
END;
$function$;

CREATE OR REPLACE FUNCTION public.finish_battle(p_battle_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  uid uuid := auth.uid();
  b public.pvp_battles%ROWTYPE;
  winner uuid;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Войдите в аккаунт' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO b FROM public.pvp_battles WHERE id = p_battle_id FOR UPDATE;
  IF NOT FOUND OR b.status <> 'active' OR b.ends_at > now() THEN
    RETURN;
  END IF;

  IF b.votes_a > b.votes_b THEN
    winner := b.creator_a_id;
  ELSIF b.votes_b > b.votes_a THEN
    winner := b.creator_b_id;
  ELSE
    winner := NULL;
  END IF;

  UPDATE public.pvp_battles SET status = 'completed', winner_id = winner WHERE id = p_battle_id;

  IF winner IS NOT NULL THEN
    UPDATE public.profiles SET xp = xp + 200, level = floor((xp + 200)::numeric / 500)::integer + 1 WHERE id = winner;
  END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.cast_battle_vote(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cast_battle_vote(uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.finish_battle(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finish_battle(uuid) TO authenticated;
