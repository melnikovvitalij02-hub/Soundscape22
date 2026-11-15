/*
# Voice messages for private messages

1. Modified Tables
- `private_messages`
  - `voice_path` (text, nullable): storage path of the recorded audio clip, e.g. `<sender_id>/<timestamp>.webm`
  - `voice_duration` (integer, nullable): clip length in seconds

2. New Storage
- Private bucket `voice-messages` for audio clips (webm, mp4, ogg, mpeg, wav; max 10 MB).

3. Security
- Only the sender may upload a clip, and only into their own folder (`<auth.uid()>/...`).
- Only the sender and the recipient of a message may read its clip. Clips are played through short-lived signed links, so they are never public.
- Existing `private_messages` policies are unchanged.

4. Notes
- Text-only messages keep working; `voice_path` is null for them.
- Both columns are additive, so no existing data is changed.
*/

ALTER TABLE private_messages ADD COLUMN IF NOT EXISTS voice_path text;
ALTER TABLE private_messages ADD COLUMN IF NOT EXISTS voice_duration integer;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'voice-messages',
  'voice-messages',
  false,
  10485760,
  ARRAY['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg', 'audio/wav']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "voice_messages_upload_own_folder" ON storage.objects;
CREATE POLICY "voice_messages_upload_own_folder" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'voice-messages'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "voice_messages_read_participants" ON storage.objects;
CREATE POLICY "voice_messages_read_participants" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'voice-messages'
    AND EXISTS (
      SELECT 1 FROM private_messages pm
      WHERE pm.voice_path = storage.objects.name
        AND (pm.sender_id = auth.uid() OR pm.recipient_id = auth.uid())
    )
  );
