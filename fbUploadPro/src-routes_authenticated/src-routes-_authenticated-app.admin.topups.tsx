import { useState, useEffect } from 'react';
import { Page, Heading, Text, Button, Card, Badge, Modal, Grid } from '@lovable/ui';
import { createClient } from '@supabase/supabase-js';
import { hasRole } from '$lib/auth';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL!,
  import.meta.env.VITE_SUPABASE_ANON_KEY!
);

type Status = 'pending' | 'approved' | 'rejected';

interface TopupRequest {
  id: string;
  user_id: string;
  amount: number;
  payment_method: string;
  txn_ref: string | null;
  screenshot_url: string | null;
  status: Status;
  admin_notes: string | null;
  created_at: string;
  profiles?: { full_name: string; email: string };
}

export default function AdminTopupsPage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [requests, setRequests] = useState<TopupRequest[]>([]);
  const [filter, setFilter] = useState<Status | 'all'>('pending');
  const [viewingImage, setViewingImage] = useState<string | null>(null);

  useEffect(() => {
    hasRole('admin').then(r => {
      setIsAdmin(r);
      if (r) loadRequests();
    });
  }, []);

  async function loadRequests() {
    let q = supabase
      .from('topup_requests')
      .select('*, profiles(full_name,email)')
      .order('created_at', { ascending: false });
    if (filter !== 'all') q = q.eq('status', filter);
    const { data } = await q;
    if (data) setRequests(data as TopupRequest[]);
  }

  async function updateStatus(id: string, status: Status) {
    await supabase.from('topup_requests').update({ status }).eq('id', id);
    await loadRequests();
  }

  if (!isAdmin) {
    return (
      <Page>
        <Heading level={2}>Access Denied</Heading>
        <Text>Admin access required.</Text>
      </Page>
    );
  }

  const pending = requests.filter(r => r.status === 'pending').length;
  const approved = requests.filter(r => r.status === 'approved').length;
  const totalAmount = requests.filter(r => r.status === 'approved').reduce((s, r) => s + r.amount, 0);

  return (
    <Page>
      <Heading level={2}>Admin — Top-up Requests</Heading>

      <Grid columns={3} className="mb-6">
        <Card>
          <Text weight="bold">Pending</Text>
          <Text size="xl">{pending}</Text>
        </Card>
        <Card>
          <Text weight="bold">Approved</Text>
          <Text size="xl">{approved}</Text>
        </Card>
        <Card>
          <Text weight="bold">Total Approved</Text>
          <Text size="xl">PKR {totalAmount}</Text>
        </Card>
      </Grid>

      <div className="flex gap-2 mb-4">
        {(['all', 'pending', 'approved', 'rejected'] as const).map(f => (
          <Button key={f} variant={filter === f ? 'filled' : 'outline'} onClick={() => setFilter(f)}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </Button>
        ))}
      </div>

      <div className="space-y-3">
        {requests.map(req => (
          <Card key={req.id}>
            <div className="flex justify-between items-start">
              <div>
                <Heading level={4}>{req.profiles?.full_name || 'Unknown'}</Heading>
                <Text size="sm">{req.profiles?.email}</Text>
                <Text>Amount: <strong>PKR {req.amount}</strong></Text>
                <Text size="sm">Method: {req.payment_method}</Text>
                {req.txn_ref && <Text size="sm">TXN: {req.txn_ref}</Text>}
                {req.screenshot_url && (
                  <Button size="sm" variant="link" onClick={() => setViewingImage(req.screenshot_url!)}>
                    View Payment Screenshot
                  </Button>
                )}
                <Badge label={req.status} color={
                  req.status === 'approved' ? 'green' :
                  req.status === 'rejected' ? 'red' : 'yellow'
                } />
              </div>
              {req.status === 'pending' && (
                <div className="flex gap-2">
                  <Button size="sm" color="green" onClick={() => updateStatus(req.id, 'approved')}>Approve</Button>
                  <Button size="sm" color="red" onClick={() => updateStatus(req.id, 'rejected')}>Reject</Button>
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>

      <Modal open={!!viewingImage} onClose={() => setViewingImage(null)} title="Payment Screenshot">
        {viewingImage && <img src={viewingImage} alt="Payment" className="w-full" />}
      </Modal>
    </Page>
  );
}