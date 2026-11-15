/*
# Remove the "Beat of the day" purchase function

1. What changes
- The paid "Beat of the day" purchase function (buy_featured_beat_slot) is dropped, so no new slots can be bought.

2. What is kept
- The featured_beat_slots table is NOT dropped. It keeps the history of past purchases and coin charges.

3. Security
- Dropping the function removes its EXECUTE grants with it. No other grants change.
*/

DROP FUNCTION IF EXISTS public.buy_featured_beat_slot(uuid, date);
