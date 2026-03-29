

## Plan: Add Campaign Detail View to Admin Library

### What it does
Clicking any campaign card in the Admin Library opens a full-detail dialog showing all metadata fields and all image slices side by side.

### Changes — `src/pages/AdminLibrary.tsx`

**1. Add a detail dialog state**
- New state: `detailItem: RefCampaign | null`
- Clicking the card body (not the dropdown) sets `detailItem`

**2. Make cards clickable**
- Add `onClick={() => setDetailItem(item)}` with `cursor-pointer` to the card div

**3. Add a detail Dialog**
A new `<Dialog>` that renders when `detailItem` is set, showing:

- **Header**: Title, brand name, published status badge
- **Metadata grid** (2-column key/value layout):
  - ID (copyable)
  - Category
  - Industry
  - Campaign Type
  - Message Type
  - Tags (as badges)
  - Sort Order
  - Created At (if available from ai_metadata or fallback)
- **Extracted Copy**: Full text block if `extracted_copy` exists
- **AI Metadata**: Pretty-printed JSON in a scrollable `<pre>` block if `ai_metadata` exists
- **All Images section**: Renders every URL from `image_urls` array as full-width images with their index label, so you can see every slice/component image
- **Thumbnail**: Shown separately with label if different from the first image_url

### Files modified

| File | What changes |
|------|-------------|
| `src/pages/AdminLibrary.tsx` | Add `detailItem` state, make cards clickable, add detail Dialog with all fields and image gallery |

