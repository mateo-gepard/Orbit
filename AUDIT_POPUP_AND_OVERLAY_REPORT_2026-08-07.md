# Popup / Overlay Audit (Launch prep)

**Date:** 2026-08-07  
**Branch:** `launch-prep-2026-08-07`

## Scope

- Codebase scan for popup-like UI surfaces (`Dialog`, `Popover`, `DropdownMenu`, `Sheet`) in `src/app` and `src/components`.
- Focused fix for:
  - Notes editor three-dot menu not opening reliably.
  - Tasks page sort/group dropdowns opening more than one popup.
- Verification run:
  - `npm run lint -- src/app/tasks/page.tsx src/components/notes/note-editor.tsx`
  - `npm run typecheck`
  - `npm run build`

## What changed

### 1) Tasks page — exclusive menu state
**File:** `src/app/tasks/page.tsx`

- Replaced two independent menu booleans (`showSortMenu`, `showGroupMenu`) with a single exclusive state:
  - `activeTaskMenu: 'none' | 'sort' | 'group'`
- Added `closeTaskMenus()` helper to force both menus closed.
- Wired `DropdownMenu` components to this exclusive state:
  - Sort opens only when `activeTaskMenu === 'sort'`
  - Group opens only when `activeTaskMenu === 'group'`
- On selection, menus now force-close immediately before applying sort/group updates.
- Reset action now closes popup state via `closeTaskMenus()`.

### 2) Notes editor — menu open guard + modal popover
**File:** `src/components/notes/note-editor.tsx`

- Added a guarded `handleSettingsOpenChange` callback:
  - Blocks open/close churn while actions are pending (`actionPending`).
- Switched the options `Popover` to modal mode:
  - `<Popover open={showSettings} onOpenChange={handleSettingsOpenChange} modal>`
- Kept explicit closing of options popover before archive/delete actions.

## Verification results

- `npm run lint` on touched files: no issues.
- `npm run typecheck`: no issues.
- `npm run build`: passes, all routes build successfully.

## What appears fixed

- Tasks page duplicate dropdown popups during sort/group interactions no longer reproduce from state perspective.
- Notes editor three-dot menu can now open while preserving action lock behavior during save/archive/delete flows.

## What is still open / follow-ups

### A) Broader UX + overlay polish (not required for the reported popup bug, but still worth a pass)
- There are many overlay surfaces across the app that are intentionally independent; no immediate state collisions found, but a few are:
  - `project-dashboard` and `detail-panel` both use non-modal `Popover` for item options.
  - Nested Sheet + Popover/Dialog combinations in large pages should be smoke-tested on:
    - touch devices
    - iOS Safari / embedded webviews
    - fast repeated open/close.
- We should add quick regression tests for:
  - opening/closing menu actions with rapid taps,
  - keyboard escape behavior while dialogs are open,
  - nested popover behavior inside full-screen dialogs.

### B) Scrolling issues you mentioned earlier
- The popup changes do not fully replace earlier “page can’t scroll” reports.  
- We should validate on target browsers with a dedicated UI pass once you confirm device/browser combinations.

## Files touched

- `src/app/tasks/page.tsx`
- `src/components/notes/note-editor.tsx`

## Risks introduced

- Low: both changes are state-local and do not alter item data persistence logic.
- Existing behavior of sort/group selection and note option actions remains unchanged apart from menu lifecycle.
