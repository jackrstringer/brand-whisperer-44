ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE public.flow_emails ADD COLUMN IF NOT EXISTS last_error TEXT;