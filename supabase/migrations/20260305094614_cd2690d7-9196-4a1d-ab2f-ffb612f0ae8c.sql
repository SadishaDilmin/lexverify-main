INSERT INTO storage.buckets (id, name, public)
VALUES ('article-audio', 'article-audio', true)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to read cached article audio
CREATE POLICY "Public read access for article audio"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'article-audio');

-- Allow service role (edge functions) to insert/update
CREATE POLICY "Service role can upload article audio"
ON storage.objects FOR INSERT
TO service_role
WITH CHECK (bucket_id = 'article-audio');

CREATE POLICY "Service role can update article audio"
ON storage.objects FOR UPDATE
TO service_role
USING (bucket_id = 'article-audio');