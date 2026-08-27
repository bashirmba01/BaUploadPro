import { useState, useEffect } from 'react';
import { Page, Heading, Text, Button, Card, Badge, Spinner } from '@lovable/ui';
import { createClient } from '@supabase/supabase-js';
import { syncFacebookPage, syncAllPages } from '$lib/fb-pages.functions';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL!,
  import.meta.env.VITE_SUPABASE_ANON_KEY!
);

interface FBPage {
  id: string;
  name: string;
  page_id: string;
  access_token_enc: string;
  followers_count: number;
  profile_picture_url: string | null;
  verification_status: string;
  token_health: string;
  created_at: string;
}

export default function PagesPage() {
  const [pages, setPages] = useState<FBPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);

  useEffect(() => {
    loadPages();
  }, []);

  async function loadPages() {
    const { data } = await supabase.from('fb_pages').select('*').order('created_at', { ascending: false });
    setPages(data || []);
    setLoading(false);
  }

  async function handleSync(page: FBPage) {
    setSyncingId(page.id);
    try {
      await syncFacebookPage(page.page_id, page.access_token_enc);
      await loadPages();
    } catch (err: any) {
      alert('Sync failed: ' + err.message);
    }
    setSyncingId(null);
  }

  async function handleSyncAll() {
    setSyncingAll(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await syncAllPages(user.id);
      await loadPages();
    } catch (err: any) {
      alert('Sync All failed: ' + err.message);
    }
    setSyncingAll(false);
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this page?')) return;
    await supabase.from('fb_pages').delete().eq('id', id);
    await loadPages();
  }

  if (loading) return <Page><Spinner label="Loading pages..." /></Page>;

  return (
    <Page>
      <div className="flex justify-between items-center mb-6">
        <Heading level={2}>Linked Pages</Heading>
        <div className="flex gap-2">
          <Button href="/tools" variant="outline">Connect with Facebook</Button>
          <Button onClick={handleSyncAll} loading={syncingAll} variant="outline">
            Sync All
          </Button>
        </div>
      </div>

      {pages.length === 0 ? (
        <Card className="text-center py-8">
          <Text size="lg">No pages connected yet.</Text>
          <Text>Go to Tools → Connect with Facebook to link your pages.</Text>
        </Card>
      ) : (
        <div className="space-y-4">
          {pages.map(page => (
            <Card key={page.id}>
              <div className="flex items-center gap-4">
                {page.profile_picture_url ? (
                  <img src={page.profile_picture_url} alt="" className="w-16 h-16 rounded-full" />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-gray-200" />
                )}
                <div className="flex-1">
                  <Heading level={4}>{page.name}</Heading>
                  <Text size="sm">ID: {page.page_id}</Text>
                  <Text size="sm">Followers: {page.followers_count}</Text>
                  <Badge label={page.token_health} color={page.token_health === 'valid' ? 'green' : 'red'} />
                </div>
                <div className="flex flex-col gap-2">
                  <Button size="sm" onClick={() => handleSync(page)} loading={syncingId === page.id}>
                    Sync
                  </Button>
                  <Button size="sm" variant="outline" color="red" onClick={() => handleDelete(page.id)}>
                    Delete
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </Page>
  );
}