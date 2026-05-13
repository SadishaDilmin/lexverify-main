
-- Enable pg_net extension
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;

-- Update the cron job to use net.http_post
SELECT cron.unschedule('benchmark-worker-cron');

SELECT cron.schedule(
  'benchmark-worker-cron',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://cnswvzgeykdkcregryxr.supabase.co/functions/v1/benchmark-worker',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNuc3d2emdleWtka2NyZWdyeXhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxODQ4MDMsImV4cCI6MjA4Nzc2MDgwM30.tsYWsa9XpAVghqPtEihTRhlE2XqHI5hR-PhogrhHnfk"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
