

## Fix: Eye icon should toggle reference view on/off

### Problem
The eye icon button on line 2547 only calls `setShowReferenceDialog(true)`. Clicking it again does nothing because there's no toggle logic.

### Change

**File: `src/pages/CampaignEditor.tsx`** (line 2547)

Replace:
```tsx
onClick={() => setShowReferenceDialog(true)}
```
With:
```tsx
onClick={() => setShowReferenceDialog((prev) => !prev)}
```

Also update the icon to visually indicate state — use `EyeOff` when the reference is showing:
```tsx
{showReferenceDialog ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
```

Ensure `EyeOff` is imported from `lucide-react` alongside `Eye`.

One file, two-line fix.

