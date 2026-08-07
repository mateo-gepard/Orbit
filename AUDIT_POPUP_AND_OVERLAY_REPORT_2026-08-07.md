# Popup / Overlay Audit (Popup lockups + menu exclusivity)

**Date:** 2026-08-07  
**Current branch before latest fix:** `codex/backup-before-popup-fix-2026-08-07-0944` (`8258cd4`)  
**Active fix branch:** `codex/fix-popup-menu-logic-2026-08-07` (`073ed1a`)

## Scope

- Codebase scan for popup-like UI surfaces (`Dialog`, `Popover`, `DropdownMenu`, `Sheet`) in `src/app` and `src/components`.
- Focused fix for:
  - Notes editor three-dot menu not opening reliably.
  - Tasks page sort/group dropdowns opening more than one popup.
  - Modal/popover nesting interference.
- Production state validation:
  - `main` at `8258cd4` (already pushed)
  - Backup branch created and pushed before this fix: `origin/codex/backup-before-popup-fix-2026-08-07-0944`
- New fix branch created and pushed: `origin/codex/fix-popup-menu-logic-2026-08-07`
- Verification run:
  - `npm run typecheck`
  - `npm run lint`
  - `npm run test src/components/notes/note-editor.test.ts src/components/notes/note-draft.test.ts`
  - `npm run typecheck`
  - `npm run build`

## What changed

### 1) Tasks page — exclusive menu state
**File:** `src/app/tasks/page.tsx`

- Kept the single exclusive state:
  - `activeTaskMenu: 'none' | 'sort' | 'group'`
- Added centralized menu transition helper:
  - `handleTaskMenuOpenChange(menu, open)` avoids stale dual-open transitions.
- Both menus now use that helper via `onOpenChange`.
- Added explicit close on group-menu item selection (`onSelect`) to prevent residual open states when clicking current value.
- Reset path still clears menus via `closeTaskMenus()`.

### 2) Notes editor — menu open guard + modal popover
**File:** `src/components/notes/note-editor.tsx`

- Added a guarded `handleSettingsOpenChange` callback:
  - Blocks open/close churn while actions are pending (`actionPending`).
- Switched the options `Popover` out of modal mode:
  - Removed `modal` prop to prevent nested-overlay dead interaction inside the full-screen `Dialog`.
- Increased menu stacking context:
  - `PopoverContent` now includes `z-[130]` in notes editor.
- Kept explicit close-before-action behavior for archive/delete and existing action-guard semantics.

### 3) Detail panel — nested popover hardening
**File:** `src/components/shell/detail-panel.tsx`

- Removed `modal` prop from the item options `Popover` (same nested-overlay issue class as notes).
- Increased menu stacking context to `z-[130]` to keep it above panel overlays.

## Verification results

- `npm run typecheck`: passes.
- `npm run lint`: passes (only pre-existing warnings in unrelated files).
- `npm run test src/components/notes/note-editor.test.ts src/components/notes/note-draft.test.ts`: both passed.
- `npm run build`: passes, production build succeeds.

## What appears fixed

- State-level duplicate menu openings in tasks are prevented by a single menu state controller.
- Notes and detail-panel option menus no longer use `modal` popover behavior inside top-level modal containers, which was likely causing “menu opens twice / menu does not render” symptoms.
- Notes menu popover stacking has been raised to avoid dialog-overlay masking.

## What is still open / follow-ups

### A) Broader UX + overlay polish (not required for the reported popup bug, but still worth a pass)
- There are many overlay surfaces across the app that remain modal containers (dialogs/sheets/popovers/sheets); these still need:
  - manual regression on mobile Safari and iOS webviews,
  - rapid tap/keyboard interaction tests,
  - nested focus-trap verification around simultaneous popover/dialog usage.

### B) Scrolling issues you mentioned earlier
- The popup changes do not yet fully replace earlier “page can’t scroll” reports.  
- We should validate on target browsers with a dedicated UI pass once you confirm device/browser combinations.

## Files touched

- `src/app/tasks/page.tsx`
- `src/components/notes/note-editor.tsx`
- `src/components/shell/detail-panel.tsx`

## Risks introduced

- Low: state-local changes only; persistence logic unchanged.
- Popover interaction with any custom third-party embed expecting modal popover behavior should be re-checked, though no current usage depends on that behavior.
