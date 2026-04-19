
## Implementation plan

### 1. One-time persistence
- `BrandSetup.tsx`: call `ensureBrandAndInputsPersisted()` exactly once on Analyze click. Cache `brandId`, `referenceImageUrls`, `referenceFileCategories`, `extractionSources` in state. Remove the second call from `generateGuideFromAudit`.
- `brandSetupPersistence.ts`: no behavior change, but reused only on first click.

### 2. Storage policy migration
- New migration adding to `storage.objects`:
  - `brand-references`: UPDATE policy scoped to `auth.uid()::text = (storage.foldername(name))[1]`
  - `brand-assets`: SELECT/INSERT/UPDATE/DELETE scoped to user folder (replaces broad authenticated access)
- After deploy, run `select policyname, cmd from pg_policies where tablename='objects' and policyname ilike '%brand-%'` and report the rows. If UPDATE policies are missing → flag immediately.

### 3. Single processing screen
- `BrandSetup.tsx` Step type: remove `auditing` and `generating_guide`. Add `processing`. No back-compat shims.
- One render branch for `processing` mounts `ProcessingStatusPanel` from Analyze click through completion. On success → swap to brand deck view in same route. On failure → `audit_failed` (kept) with full error.

### 4. Debug panel — full pipeline + table/path logging
- `ProcessingStatusPanel.tsx`: accept external `events` prop (array of `{timestamp, event, detail}`) merged with internal poll/stream events into the displayed log + copy blob.
- `BrandSetup.tsx`: push events at every step, including exact write targets:
  - `db_write table=brands op=insert id=…`
  - `db_write table=brand_profiles op=upsert brand_id=…`
  - `db_write table=brand_assets op=insert rows=N`
  - `storage_write bucket=brand-references path=<userId>/<brandId>/references/<cat>/<file>`
  - `storage_write bucket=brand-assets path=<userId>/<brandId>/assets/<cat>/<file>`
  - `fn_invoke name=audit-brand` / `fn_response name=audit-brand status=… ms=…`
  - `fn_invoke name=extract-brand mode=spec` / `fn_response …`
  - `fn_stream name=extract-brand mode=guide event=open|first_byte|end bytes=…`
  - On any throw: `error scope=<step> msg=<…>`
- `brandSetupPersistence.ts`: accept optional `onEvent` callback so storage paths are logged from inside the helper (where they're actually constructed).

### 5. Harden `extract-brand` spec parsing
- `supabase/functions/extract-brand/index.ts`: replace `specText.match(/\{[\s\S]*\}/)` with the same robust extractor used in `audit-brand` (`extractJsonObject`). On parse failure, write `processing_status='failed'` + `processing_error` to `brand_profiles` before throwing. No silent fallback.

### 6. Cleanup
- Delete `confirmDevSpend` (lines 24–29 of `BrandSetup.tsx`) and both call sites (lines 241, 499). No dev popups anywhere.
- Remove `RotateCcwIcon` wrapper in `ProcessingStatusPanel.tsx` (use `RefreshCw` directly) to clear the React ref warning.

### Files touched
- `src/pages/BrandSetup.tsx`
- `src/lib/brandSetupPersistence.ts`
- `src/components/brand/ProcessingStatusPanel.tsx`
- `supabase/functions/extract-brand/index.ts`
- `supabase/migrations/<new>_storage_policies_brand_buckets.sql`

### Deploy + verify
- Deploy `extract-brand`.
- Run the migration.
- Query `pg_policies` for `brand-references` / `brand-assets` UPDATE policies and report results before claiming success.
- If anything is missing or fails, surface immediately — no fake success.
