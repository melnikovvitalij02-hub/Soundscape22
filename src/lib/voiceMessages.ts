import { supabase } from '@/lib/supabase';
import type { RecordedVoice } from '@/components/VoiceRecordButton';

export async function uploadVoiceMessage(userId: string, { blob, mimeType }: RecordedVoice): Promise<string | null> {
  const extension = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('ogg') ? 'ogg' : 'webm';
  const path = `${userId}/${Date.now()}.${extension}`;
  const { error } = await supabase.storage.from('voice-messages').upload(path, blob, { contentType: mimeType });
  return error ? null : path;
}
