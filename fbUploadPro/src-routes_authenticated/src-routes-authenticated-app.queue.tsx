import { useState, useEffect } from 'react';
import { Page, Heading, Text, Button, Card, Badge, Spinner, Grid } from '@lovable/ui';
import { createClient } from '@supabase/supabase-js';
import { runPublishCycle } from '$lib/publish-worker';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL!,
  import.meta.env.VITE_SUPABASE_ANON_KEY!
);

interface QueueItem {
  id: string;
  content_text: string | null;
  media_url: string | null;
  content_type: string;
  scheduled_at: string;
  status: string;
  fb_post_id: string | null;
  error_message: string | null;
  pages?: { name: string };
}

export default function QueuePage() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    loadQueue();
  }, []);

  async function loadQueue() {
    const { data } = await supabase
      .from('posts_queue')
      .select('*, pages(name)')
      .order('scheduled_at', { ascending: true })
      .limit(50);
    setItems(data || []);
    setLoading(false);
  }

  async function runCycle() {
    setRunning(true);
    await runPublishCycle();
    await loadQueue();
    setRunning(false);
  }

  async function publishNow(id: string) {
    if (!confirm('Publish this post right now?')) return;
    await supabase.from('posts_queue').update({ scheduled_at: new Date().toISOString() }).eq('id', id);
    await runCycle();
  }

  async function retryPost(id: string) {
    await supabase.from('posts_queue').update({
      status: 'pending',
      retry_count: 0,
      error_message: null,
      scheduled_at: new Date().toISOString()
    }).eq('id', id);
    await loadQueue();
  }

  if (loading) return <Page><Spinner label="Loading queue..." /></Page>;

  const pending = items.filter(i => i.status === 'pending').length;
  const published = items.filter(i => i.status === 'published').length;
  const failed = items.filter(i => i.status === 'failed').length;

  return (
    <Page>
      <div className="flex justify-between items-center mb-6">
        <Heading level={2}>Content Queue</Heading>
        <Button onClick={runCycle} loading={running}>Run Cycle</Button>
      </div>

      <Grid columns={4} className="mb-6">
        <Card><Text weight="bold">Total</Text><Text size="xl">{items.length}</Text></Card>
        <Card><Text weight="bold">Pending</Text><Text size="xl">{pending}</Text></Card>
        <Card><Text weight="bold">Published</Text><Text size="xl">{published}</Text></Card>
        <Card><Text weight="bold">Failed</Text><Text size="xl">{failed}</Text></Card>
      </Grid>

      {items.length === 0 ? (
        <Card className="text-center py-8">
          <Text size="lg">Queue is empty.</Text>
          <Text>Schedule some content to see posts here.</Text>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map(item => (
            <Card key={item.id}>
              <div className="flex justify-between">
                <div className="flex-1">
                  <div className="flex gap-2 items-center mb-1">
                    <Badge label={item.content_type} />
                    <Badge label={item.status} color={
                      item.status === 'published' ? 'green' :
                      item.status === 'failed' ? 'red' :
                      item.status === 'publishing' ? 'blue' : 'yellow'
                    } />
                    {item.pages?.name && <Text size="sm">{item.pages.name}</Text>}
                  </div>
                  <Text>{item.content_text?.substring(0, 100) || '(No text)'}</Text>
                  <Text size="sm">Scheduled: {new Date(item.scheduled_at).toLocaleString()}</Text>
                  {item.error_message && <Text size="sm" color="red">Error: {item.error_message}</Text>}
                  {item.fb_post_id && (
                    <a href={`https://facebook.com/${item.fb_post_id}`} target="_blank" rel="noreferrer" className="text-blue-500 text-sm">
                      View Post on Facebook
                    </a>
                  )}
                </div>
                <div className="flex flex-col gap-1 ml-4">
                  {item.status === 'pending' && (
                    <Button size="sm" onClick={() => publishNow(item.id)}>Publish Now</Button>
                  )}
                  {item.status === 'failed' && (
                    <Button size="sm" onClick={() => retryPost(item.id)}>Retry</Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </Page>
  );
}