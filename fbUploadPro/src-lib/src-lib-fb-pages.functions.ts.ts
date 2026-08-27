import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL!,
  import.meta.env.SUPABASE_SERVICE_ROLE!
);

async function decryptToken(encrypted: string): Promise<string> {
  const key = Buffer.from(import.meta.env.FB_SESSION_ENCRYPTION_KEY!, 'hex');
  const parts = encrypted.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const tag = Buffer.from(parts[1], 'hex');
  const data = Buffer.from(parts[2], 'hex');
  const crypto = await import('crypto');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(data);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString('utf8');
}

async function graphGet<T>(path: string, token: string): Promise<T> {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`https://graph.facebook.com/v21.0${path}${sep}access_token=${token}`);
  if (!res.ok) throw new Error(`Graph API Error: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function syncFacebookPage(pageId: string, encryptedToken: string) {
  const token = await decryptToken(encryptedToken);

  type PageInfo = {
    name: string;
    fan_count?: number;
    followers_count?: number;
    verification_status?: string;
    picture?: { data: { url: string } };
  };

  const info = await graphGet<PageInfo>(
    `/${pageId}?fields=name,fan_count,followers_count,verification_status,picture.type(large)`,
    token
  );

  const { error } = await supabase
    .from('fb_pages')
    .update({
      name: info.name,
      followers_count: info.followers_count || info.fan_count || 0,
      profile_picture_url: info.picture?.data?.url || null,
      verification_status: info.verification_status || 'unknown',
      token_health: 'valid',
      last_synced_at: new Date().toISOString()
    })
    .eq('id', pageId);

  if (error) throw error;
  return info;
}

export async function syncAllPages(userId: string) {
  const { data: pages } = await supabase
    .from('fb_pages')
    .select('id,page_access_token_enc')
    .eq('user_id', userId);

  if (!pages) return { total: 0, updated: 0, failed: 0 };

  let updated = 0, failed = 0;
  for (const page of pages) {
    try {
      await syncFacebookPage(page.id, page.page_access_token_enc);
      updated++;
    } catch {
      failed++;
      await supabase.from('fb_pages').update({ token_health: 'error' }).eq('id', page.id);
    }
  }
  return { total: pages.length, updated, failed };
}

export async function checkAllTokenHealth(userId: string) {
  const { data: pages } = await supabase
    .from('fb_pages')
    .select('id,page_access_token_enc')
    .eq('user_id', userId);

  if (!pages) return { checked: 0, valid: 0, invalid: 0 };

  let valid = 0, invalid = 0;
  for (const page of pages) {
    try {
      const token = await decryptToken(page.page_access_token_enc);
      await graphGet(`/debug_token?input_token=${token}`, token);
      valid++;
      await supabase.from('fb_pages').update({ token_health: 'valid' }).eq('id', page.id);
    } catch {
      invalid++;
      await supabase.from('fb_pages').update({ token_health: 'error' }).eq('id', page.id);
    }
  }
  return { checked: pages.length, valid, invalid };
}