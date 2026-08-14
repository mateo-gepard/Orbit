---
name: Threadmap
description: A connected personal operating system for plans, work, and reflection.
colors:
  paper: "oklch(0.988 0.002 80)"
  paper-raised: "oklch(0.998 0.001 80)"
  ink: "oklch(0.16 0.01 60)"
  ink-secondary: "oklch(0.38 0.01 60)"
  ink-tertiary: "oklch(0.44 0.01 60)"
  rule: "oklch(0.91 0.005 75)"
  charcoal: "oklch(0.14 0.008 60)"
  charcoal-raised: "oklch(0.19 0.008 60)"
  chalk: "oklch(0.93 0.005 80)"
  chalk-secondary: "oklch(0.78 0.01 60)"
  user-accent-default: "#6366f1"
  destructive: "oklch(0.55 0.22 25)"
typography:
  micro-fine:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.5625rem"
    fontWeight: 500
    lineHeight: 1.2
  micro:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.625rem"
    fontWeight: 500
    lineHeight: 1.2
  caption:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: 1.25
  compact:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.35
  ui:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 500
    lineHeight: 1.4
  editorial-display:
    fontFamily: "Georgia, Times New Roman, serif"
    fontSize: "4rem"
    fontWeight: 400
    lineHeight: 0.95
    letterSpacing: "-0.03em"
  display:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  body-large:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.25
rounded:
  hairline: "2px"
  control: "10px"
  editorial-control: "11px"
  compact: "8px"
  surface: "12px"
  panel: "16px"
  sheet: "24px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.paper-raised}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
    height: "44px"
  input:
    backgroundColor: "{colors.paper-raised}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
    height: "44px"
  card:
    backgroundColor: "{colors.paper-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.surface}"
    padding: "16px"
---

# Design System: Threadmap

## Overview

**Creative North Star: "The Connected Field Desk"**

Threadmap feels like a calm working surface where plans, records, and decisions remain connected without becoming visually loud. Warm paper and deep charcoal establish the environment; precise rules, compact typography, and small tonal shifts organize dense operational information.

The interface is restrained rather than austere. Controls feel tactile through short state changes and shallow depth, while the user-selected accent appears sparingly in focus, selection, and small identifying marks. The system favors legibility, continuity, and honest status over decorative spectacle.

**Key Characteristics:**

- Warm, near-neutral light and dark work surfaces.
- Compact but readable hierarchy with tabular numerals for dates, counts, and measurements.
- Tonal grouping before elevation; floating depth is reserved for overlays.
- Touch-sized controls on phones and denser controls on precise-pointer layouts.
- One user accent that identifies state without becoming small body copy.

## Colors

The palette is a warm paper-and-ink system with a mirrored charcoal-and-chalk dark theme.

### Primary

- **Working Ink:** Primary actions, active labels, and high-emphasis text on light surfaces.
- **Working Chalk:** Primary actions, active labels, and high-emphasis text on dark surfaces.

### Secondary

- **User Accent:** A configurable identifier for selection, focus, toggles, and compact marks. It must not carry essential meaning by color alone or render small text directly.

### Neutral

- **Warm Paper:** The default light workspace and reading surface.
- **Raised Paper:** Menus, cards, and inputs that need slight separation from the workspace.
- **Deep Charcoal:** The default dark workspace.
- **Raised Charcoal:** Dark-theme cards, menus, and inputs.
- **Secondary and Tertiary Copy:** Opaque warm neutrals used instead of stacked low-alpha text so compact labels remain readable.
- **Rules:** Low-chroma separators used to explain structure, not decorate every container.

**The Opaque Copy Rule.** Supporting copy uses an opaque semantic tone with accessible contrast; opacity is reserved for decorative marks and truly disabled states.

**The Sparse Accent Rule.** The user accent identifies state and focus. Foreground text remains ink or chalk unless the chosen accent has been contrast-validated for that exact surface and size.

## Typography

**Display Font:** Geist (with the system sans-serif stack)

**Body Font:** Geist (with the system sans-serif stack)

**Label/Mono Font:** Geist Mono for code, time, counts, prices, and measurement only

**Character:** The single-family system is quiet and highly legible. Weight, size, spacing, and tabular features create hierarchy without introducing a second decorative voice.

### Hierarchy

- **Display:** Bold and tightly tracked; reserved for authentication and rare focal headings.
- **Editorial Display:** Georgia is reserved for the standalone About narrative, where its fluid scale creates a deliberately different reading voice without entering the operational workspace.
- **Title:** Semibold and compact; one descriptive page heading per route.
- **Micro:** Nine- and ten-pixel steps are limited to terse calendar, rank, measurement, and dense metadata where a larger label would distort the operational hierarchy; essential actions and explanatory copy never use them.
- **Body:** Regular with relaxed line height; explanatory copy stays within roughly 65–75 characters per line.
- **Label:** Medium or semibold; navigation, field labels, compact controls, and metadata.
- **Data:** Mono or tabular numerals only when alignment or measurement is meaningful.

**The Quiet Hierarchy Rule.** Increase weight before adding color, and increase size before adding ornament.

## Layout

The authenticated workspace uses a persistent desktop sidebar, a compact mobile header, and a five-position bottom navigation. Page content is generally constrained between medium and wide reading widths instead of stretching across the viewport. Dense tools may use the full workspace when the data model requires it.

Spacing follows a four-pixel base rhythm with recurring 8, 12, 16, 24, and 32 pixel intervals. Related labels and controls stay tight; sections gain more space above than their internal elements use below. Phone layouts use safe-area variables, a 44-pixel minimum target, single-column flows, and horizontal disclosure only for secondary section filters.

Desktop density begins at the large breakpoint. It may reduce target height for precise pointers, reveal persistent labels, and introduce side-by-side panels, but it does not change the information architecture.

## Elevation & Depth

Threadmap is tonal and flat by default. Borders explain containment, soft offset shadows separate raised surfaces, and the strongest depth belongs to command bars, dialogs, sheets, and other temporary overlays. Backdrop blur is functional—used to preserve context behind an overlay or sticky navigation—not a decorative material applied to ordinary cards.

### Shadow Vocabulary

- **Hairline:** An inset structural rule for controls that need an edge without elevation.
- **Soft:** A shallow offset shadow for interactive cards and primary actions.
- **Panel:** A broader, low-opacity shadow for raised panels.
- **Float:** The strongest offset shadow, reserved for modal and command surfaces.
- **Pressed:** An inset response used only during direct manipulation.

**The Flat-by-Default Rule.** A surface receives either a structural edge or meaningful elevation; stronger depth is reserved for state and hierarchy.

## Shapes

Controls use gently rounded compact corners. Cards and content groups use medium corners, while dialogs and large floating panels use the largest system radius. Pills are limited to tags, counts, compact filters, and binary selections. Full content containers do not become pills.

## Components

### Buttons

- **Shape:** Compact rounded controls on desktop and touch-sized rounded controls on phones.
- **Primary:** Ink-on-paper or paper-on-ink with a restrained soft shadow.
- **Hover / Focus:** Tonal change on hover, a visible semantic focus ring, and a small pressed response. Reduced motion keeps color/opacity feedback while removing scale.
- **Secondary / Ghost:** Raised-paper or transparent surfaces that gain tone before they gain elevation.

### Chips

- **Style:** Small pills with a tonal background and high-contrast label.
- **State:** Selected chips invert or use the user accent as a supporting mark; unselected chips remain readable without hover.

### Cards / Containers

- **Corner Style:** Medium corners for cards and larger corners for panels.
- **Background:** A small tonal step from the owning workspace.
- **Shadow Strategy:** Flat at rest; soft elevation only when the card behaves as an interactive or floating surface.
- **Border:** A subtle rule when containment would otherwise be ambiguous.
- **Internal Padding:** Compact on phones and modestly expanded on wide screens.

### Inputs / Fields

- **Style:** Raised background, structural hairline, readable placeholder, and a touch-sized phone height.
- **Focus:** Border and focus-ring shift using the semantic ring token.
- **Error / Disabled:** Error is named in nearby text and reinforced by destructive color; disabled state uses opacity and cursor together.

### Navigation

Sidebar and bottom navigation share route names and active-state logic. Active labels remain high-contrast foreground text; a tonal surface, weight change, and optional accent mark communicate selection. Mobile navigation keeps both icon and text labels visible.

### Command Bar

The command bar is the signature capture surface: a bottom sheet on phones and a floating search panel on desktop. It takes protected focus, exposes clear grouped suggestions, and returns focus to the invoking control when dismissed.

### Page Structure

Each route exposes one descriptive `h1`. The authenticated shell owns the single `main` landmark for workspace routes; standalone authentication, About, Privacy, Security, Terms, and consent surfaces own their own `main` and render outside that shell. Named regions require an appropriate semantic role, and icon-only controls always retain an accessible name when their visible label is hidden.

### Loading & Performance

Authentication resolution preserves the final shell geometry instead of replacing a centered splash with the workspace. The loading frame reserves the desktop sidebar, mobile header and navigation, and primary content area; it communicates status in text and stops decorative pulsing under reduced motion.

Firebase App Check is demand-loaded. Local-only sessions must not download its SDK or the reCAPTCHA runtime. Cloud authentication warms attestation in parallel without delaying a popup-opening pointer gesture, while email authentication and cloud-data subscriptions await readiness before their first protected request. MFA interface code loads only when a challenge exists.

Remote Wishlist images reserve space through their owning media container and decode asynchronously. Below-fold collection images load lazily; only the visible featured image receives eager loading and high fetch priority.

## Do's and Don'ts

### Do:

- **Do** keep primary tasks obvious through weight, position, and state before adding more color.
- **Do** use semantic opaque copy tones for every readable label, including compact dates and metadata.
- **Do** keep phone controls at least 44 by 44 pixels and preserve safe-area spacing.
- **Do** use mono or tabular numerals only for code, dates, time, price, rank, and measurement.
- **Do** preserve short opacity and color feedback in reduced-motion mode.
- **Do** reserve final shell geometry while authentication or route data resolves.
- **Do** lazy-load security and media dependencies that a local-only session does not need.

### Don't:

- **Don't** use the configurable accent as unchecked small text.
- **Don't** stack opacity onto muted text to create hierarchy.
- **Don't** add decorative grain, gradient text, generic glass cards, or bounce easing.
- **Don't** make essential actions hover-only or icon-only without an accessible name.
- **Don't** introduce a new card, radius, or motion language for one route when a shared primitive already owns it.
- **Don't** preload every remote image or initialize reCAPTCHA before cloud functionality is requested.
