-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule publish worker to run every minute
SELECT cron.schedule(
  'fb-publish-every-minute',
  '* * * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://project--44685203-c1ef-4ac7-a9cb-b623ee701543.lovable.app/api/public/cron/publish',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', 'YOUR_CRON_SECRET_HERE'
      ),
      body := '{}'
    )
  AS result;
  $$
);

-- Grant permission
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL ON SCHEMA cron TO authenticated;