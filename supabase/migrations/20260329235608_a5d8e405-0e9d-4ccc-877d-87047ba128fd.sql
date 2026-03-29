
ALTER TABLE reference_campaigns
  ADD COLUMN IF NOT EXISTS image_slice_urls  jsonb,
  ADD COLUMN IF NOT EXISTS image_total_height integer,
  ADD COLUMN IF NOT EXISTS slicing_status    text NOT NULL DEFAULT 'pending';

CREATE INDEX IF NOT EXISTS idx_reference_campaigns_slicing_status
  ON reference_campaigns (slicing_status);

COMMENT ON COLUMN reference_campaigns.image_slice_urls IS
  'JSONB array of slice objects: [{index, label, url, yTop, yBottom}]. Index 0 is always the full-overview downscale.';
COMMENT ON COLUMN reference_campaigns.image_total_height IS
  'Original pixel height of the full reference image.';
COMMENT ON COLUMN reference_campaigns.slicing_status IS
  'Lifecycle state of the slicing pipeline: pending | processing | complete | failed';
