ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS visual_qa_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS visual_qa_score integer;