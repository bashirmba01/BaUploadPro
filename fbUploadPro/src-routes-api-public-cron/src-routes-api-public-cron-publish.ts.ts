import { runPublishCycle } from '$lib/publish-worker';

export async function POST({ request }) {
  const secret = request.headers.get('x-cron-secret');
  if (secret !== import.meta.env.CRON_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  await runPublishCycle();
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}