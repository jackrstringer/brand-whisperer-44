

# ClickUp Task Import for Campaign Source

## Summary
Add a "Campaign Source" field to the campaign editor that accepts a ClickUp task URL. An edge function scrapes the task's name, description, and any linked ClickUp Docs content via the ClickUp API, then auto-populates the campaign brief, copy, and goal fields. The user can then edit freely before generating.

## How It Works (User Perspective)

1. In Brand Settings, user adds their ClickUp Personal API Token (one-time setup per brand or globally)
2. On the campaign creation form, a new "Import from ClickUp" field appears above the brief
3. User pastes a ClickUp task URL (e.g. `https://app.clickup.com/t/abc123`)
4. System fetches the task info and populates: brief (from task description), extra copy (from docs), goal (best guess from task name/tags), and campaign name
5. User reviews, edits, attaches products/images as usual, then generates

## Technical Plan

### Step 1: Store ClickUp API Token
- Add a `clickup_api_key` column to `brands` table (nullable text) via migration
- Add a "ClickUp" tab or field in BrandSettings with a password input for the token
- Token is stored per-brand so different brands can use different workspaces

### Step 2: Edge Function — `clickup-fetch-task`
- Accepts `{ brandId, taskUrl }` 
- Parses task ID from URL (patterns: `/t/{taskId}`, `/{taskId}` at end)
- Reads the brand's `clickup_api_key` from the DB
- Calls ClickUp API `GET /v2/task/{taskId}` with `Authorization: {token}`
- Extracts: `name`, `description`, `text_content`, `status`, `tags`, and linked doc IDs
- If the task has linked ClickUp Docs, fetches those via `GET /v2/view/{viewId}` or doc pages endpoint to pull the document body text
- Returns structured JSON: `{ name, brief, copy, suggestedGoal }`

### Step 3: Campaign Editor UI Changes
- Add a collapsible "Import from ClickUp" section at the top of the draft form (above the brief textarea)
- Contains: a URL input field + "Import" button
- On click: calls the edge function, shows a loading spinner
- On success: populates `brief`, `extraCopy`, and `nameValue` with the returned data, shows a toast
- Fields remain fully editable after import
- If ClickUp token isn't configured for this brand, show a hint linking to Brand Settings

### Step 4: Goal Mapping
- The edge function uses simple keyword matching on task name/tags to suggest a goal (e.g., "launch" → product_launch, "welcome" → welcome, "cart" → abandoned_cart)
- Falls back to "promotional" if no match

## Files to Create/Modify

| File | Change |
|------|--------|
| Migration | Add `clickup_api_key` to `brands` table |
| `src/pages/BrandSettings.tsx` | Add ClickUp token input in Info or new tab |
| `supabase/functions/clickup-fetch-task/index.ts` | New edge function |
| `src/pages/CampaignEditor.tsx` | Add import-from-ClickUp UI section |

## Security Considerations
- ClickUp API token stored in the database (not as an env secret) since it's per-brand
- Edge function validates the user session before accessing brand data
- RLS on `brands` table already restricts access to the brand owner

