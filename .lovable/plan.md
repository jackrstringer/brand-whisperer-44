

## Calendar Dates Feature in Ideation

### What It Does
Adds a "Calendar Dates" option to the CampaignTypePicker that, when clicked, calls an AI (Gemini with grounded search) to research and list all relevant upcoming dates for the next 30 days — holidays, social media days, cultural events, awareness months, niche observances (e.g. National Masturbation Day for sexual wellness brands, Tax Day, April Fools) — personalized to the brand's category. Results render as a structured list in the ideation flow with dates, names, and campaign angle suggestions.

### Technical Plan

#### 1. New edge function: `generate-calendar-dates`
- Accepts `brand_id`
- Fetches brand intelligence (category, products, audience) from `brand_intelligence` table
- Calls Lovable AI Gateway (`google/gemini-2.5-flash`) with a grounded prompt:
  - Current date injected
  - "List ALL notable dates in the next 30 days relevant to a {category} brand: federal holidays, cultural events, social media holidays, awareness days/weeks/months, niche observances, tax deadlines, pop culture moments. Include the exact date, name, and a 1-sentence campaign angle for this brand."
- Returns structured JSON array: `{ date: string, name: string, type: string, angle: string }[]`
- Uses CORS headers, no JWT required

#### 2. New node type: `calendar_dates`
- Add to `IdeationNode` union in `useIdeation.ts`:
  ```
  { id: string; type: 'calendar_dates'; dates: CalendarDateEntry[]; isLoading: boolean; timestamp: number }
  ```
- New `generateCalendarDates` function in `useIdeation` that:
  - Inserts a `calendar_dates` node (loading state)
  - Calls `generate-calendar-dates` edge function
  - Updates node with results

#### 3. New component: `CalendarDatesNode.tsx`
- Renders the list of upcoming dates in a clean format
- Each date entry shows: date badge, event name, type pill, campaign angle
- Each entry has an "Ideate on this" button that feeds the date/event as a brief into `generateForType`

#### 4. Add to CampaignTypePicker
- Add a "Calendar Dates" entry (with a calendar icon, distinct color like `bg-emerald-400`) to `CAMPAIGN_TYPES` as a special type
- When clicked, instead of calling `generateForType`, it calls `generateCalendarDates`

#### 5. Wire into NodeFlow
- Add `calendar_dates` case to `NodeFlow.tsx` rendering switch

#### 6. Update `seedCalendar.ts` (no change needed — this is separate)
The existing `seedCalendar` is for the task calendar. This feature is ideation-specific and AI-powered, so it's a different system entirely.

### Files to Create/Edit
- **Create**: `supabase/functions/generate-calendar-dates/index.ts`
- **Create**: `src/components/ideation/CalendarDatesNode.tsx`
- **Edit**: `src/hooks/useIdeation.ts` — add `calendar_dates` node type + `generateCalendarDates` method
- **Edit**: `src/lib/ideation/campaignTypes.ts` — add Calendar Dates type
- **Edit**: `src/components/ideation/NodeFlow.tsx` — render new node type
- **Edit**: `src/pages/IdeatePage.tsx` — handle Calendar Dates type selection differently
- **Deploy**: `generate-calendar-dates`

