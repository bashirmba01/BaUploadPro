import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL!,
  import.meta.env.SUPABASE_SERVICE_ROLE!
);

const FB_APP_ID = import.meta.env.FB_APP_ID!;
const FB_APP_SECRET = import.meta.env.FB_APP_SECRET!;

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

async function fetchJson<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`API Error: ${res.status}`);
  return res.json() as Promise<T>;
}

interface PostQueueRow {
  id: string;
  page_id: string;
  page_access_token_enc: string;
  content_type: 'text' | 'photo' | 'video' | 'reel';
  content_text: string | null;
  media_url: string | null;
  media_type: string | null;
  scheduled_at: string;
  status: 'pending' | 'publishing' | 'published' | 'failed';
  retry_count: number;
  publish_at: string | null;
  published_at: string | null;
  fb_post_id: string | null;
  error_message: string | null;
}

export async function runPublishCycle() {
  console.log('🚀 Publish cycle started');

  const { data: duePosts, error } = await supabase
    .from('posts_queue')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_at', new Date().toISOString())
    .lt('retry_count', 3)
    .order('scheduled_at', { ascending: true })
    .limit(5);

  if (error) {
    console.error('❌ Error fetching queue:', error);
    return;
  }
  if (!duePosts?.length) {
    console.log('✅ No due posts');
    return;
  }

  for (const post of duePosts as PostQueueRow[]) {
    await processOnePost(post);
  }
}

async function processOnePost(post: PostQueueRow) {
  try {
    await supabase
      .from('posts_queue')
      .update({ status: 'publishing', retry_count: post.retry_count + 1 })
      .eq('id', post.id);

    const pageToken = await decryptToken(post.page_access_token_enc);
    let fbPostId: string;

    switch (post.content_type) {
      case 'text':
        fbPostId = await publishTextPost(post.page_id, pageToken, post.content_text!);
        break;
      case 'photo':
        fbPostId = await publishPhotoPost(post.page_id, pageToken, post.media_url!, post.content_text);
        break;
      case 'video':
        fbPostId = await publishVideoPost(post.page_id, pageToken, post.media_url!, post.content_text, false);
        break;
      case 'reel':
        fbPostId = await publishVideoPost(post.page_id, pageToken, post.media_url!, post.content_text, true);
        break;
      default:
        throw new Error('Unknown content type');
    }

    await supabase
      .from('posts_queue')
      .update({
        status: 'published',
        published_at: new Date().toISOString(),
        fb_post_id: fbPostId,
        error_message: null
      })
      .eq('id', post.id);

    console.log(`✅ Post published: ${fbPostId}`);
  } catch (err: any) {
    const msg = err?.message || String(err);
    console.error(`❌ Post failed: ${msg}`);

    const isFinalRetry = post.retry_count + 1 >= 3;
    await supabase
      .from('posts_queue')
      .update({
        status: isFinalRetry ? 'failed' : 'pending',
        error_message: msg.substring(0, 500),
        scheduled_at: isFinalRetry ? post.scheduled_at : new Date(Date.now() + 5 * 60 * 1000).toISOString()
      })
      .eq('id', post.id);
  }
}

async function publishTextPost(pageId: string, token: string, message: string) {
  const url = `https://graph.facebook.com/v21.0/${pageId}/feed`;
  const { id } = await fetchJson<{ id: string }>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, access_token: token })
  });
  return id;
}

async function publishPhotoPost(pageId: string, token: string, photoUrl: string, caption?: string | null) {
  const url = `https://graph.facebook.com/v21.0/${pageId}/photos`;
  const { id } = await fetchJson<{ id: string }>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: photoUrl, caption, access_token: token })
  });
  return id;
}

async function publishVideoPost(
  pageId: string,
  token: string,
  videoUrl: string,
  title?: string | null,
  isReel = false
) {
  const type = isReel ? 'video_reels' : 'videos';
  const url = `https://graph.facebook.com/v21.0/${pageId}/${type}`;

  const initRes = await fetchJson<{ video_id: string; upload_url: string }>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      upload_phase: 'start',
      access_token: token,
      title: title || 'Uploaded Video',
      description: title || ''
    })
  });

  const mediaRes = await fetch(initRes.upload_url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ upload_phase: 'transfer', file_url: videoUrl, access_token: token })
  });
  if (!mediaRes.ok) throw new Error('Video upload failed');

  const finishRes = await fetchJson<{ success: boolean }>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      upload_phase: 'finish',
      video_id: initRes.video_id,
      access_token: token
    })
  });

  if (!finishRes.success) throw new Error('Video finish failed');
  return initRes.video_id;
}