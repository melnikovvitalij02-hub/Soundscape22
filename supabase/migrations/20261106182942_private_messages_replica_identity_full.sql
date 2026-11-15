/*
# Realtime delete notifications for private messages

1. Replica identity
- `private_messages` uses FULL replica identity so delete events include the removed row and reach the other participant live.

2. Security
- No policy or grant changes.
*/

ALTER TABLE public.private_messages REPLICA IDENTITY FULL;
