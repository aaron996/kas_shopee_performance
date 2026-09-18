---
name: GHN KAS Operations
description: A dense, trustworthy operations dashboard for shipment performance and intervention.
colors:
  orange-500: "#f15a22"
  orange-700: "#c94516"
  cyan-700: "#0ea5c4"
  cyan-800: "#0b84a0"
  slate-950: "#0f172a"
  slate-800: "#1e293b"
  slate-500: "#64748b"
  canvas: "#eaf2fb"
  surface: "#ffffff"
  surface-subtle: "#f2f7fd"
  border-subtle: "#dce9f7"
  border-strong: "#c6dcf2"
  success-bg: "#eaf3de"
  success-fg: "#0f6e56"
  warning-bg: "#fef3c7"
  warning-fg: "#92400e"
  danger-bg: "#f7d9d4"
  danger-fg: "#a13b2a"
typography:
  body:
    fontFamily: "IBM Plex Sans, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    lineHeight: 1.5
  heading:
    fontFamily: "Outfit, IBM Plex Sans, sans-serif"
    fontWeight: 700
  mono:
    fontFamily: "IBM Plex Mono, monospace"
rounded:
  control: "10px"
  surface: "22px"
  pill: "999px"
spacing:
  compact: "8px"
  standard: "16px"
  roomy: "24px"
components:
  action-primary:
    backgroundColor: "{colors.cyan-700}"
    textColor: "{colors.surface}"
    rounded: "{rounded.pill}"
    padding: "0.4rem 1rem"
  action-secondary:
    backgroundColor: "{colors.surface-subtle}"
    textColor: "{colors.slate-800}"
    rounded: "{rounded.pill}"
    padding: "0.4rem 0.85rem"
  input-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.slate-800}"
    rounded: "{rounded.control}"
    padding: "0.34rem 0.55rem"
  data-surface:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.surface}"
    padding: "1.1rem 1.35rem"
---

# Design System: GHN KAS Operations

## Overview

**Creative North Star: "The Calm Operations Desk"**

GHN KAS is an operations workspace, not a marketing surface. It should make scope, freshness, risk, and the next drill-down legible at a glance. The visual language is airy and pastel-blue, while the density and wording remain practical enough for repeated daily analysis.

White data surfaces sit on a pale blue canvas. Cyan is reserved for primary interaction and orange for GHN emphasis or attention; status colors communicate state, not decoration. The system favors compact controls, clear borders, and restrained diffuse elevation over glossy or ornamental treatment.

**Key Characteristics:**
- Operational hierarchy before decoration.
- One shared shape scale for repeated UI roles.
- Color never carries status or data meaning without labels, values, or structure.

## Colors

The palette pairs a calm blue-white workspace with a narrow cyan action accent, warm GHN orange, and explicit semantic status colors.

### Primary
- **Operational Cyan:** Used for the primary action, active navigation, focus, and linked drill-down states.
- **GHN Orange:** Used sparingly for GHN emphasis, exceptions, and selected operational attention states.

### Neutral
- **Pastel Canvas:** The application background; it separates white work surfaces without relying on heavy borders.
- **White Surface:** The default container, modal, field, and data-card background.
- **Slate Text:** Dark slate carries primary reading; muted slate is for supporting metadata only.
- **Blue-Tinted Borders:** Subtle borders separate controls and surfaces without creating a gray, spreadsheet-like shell.

### Named Rules
**The One-Action Accent Rule.** Cyan identifies the principal interactive path on a local surface. Orange does not replace semantic warning/error treatment and is not a second primary button color.

## Typography

**Display Font:** Outfit, with IBM Plex Sans fallback.
**Body Font:** IBM Plex Sans, with system UI fallbacks.
**Label/Mono Font:** IBM Plex Mono for compact codes, metrics, and source labels.

**Character:** Headings are crisp and compact; operational content is primarily IBM Plex Sans for high-density scanning. Mono is an annotation tool, not a replacement for body copy.

### Hierarchy
- **Heading** (Outfit, 700): Section titles, modal titles, and the primary label of a data region.
- **Body** (IBM Plex Sans, line-height 1.5): Explanations, table content, and filter labels.
- **Metadata** (typically 0.72–0.85rem): Source, coverage, timestamps, and supporting detail; it must not be the only place a critical state is conveyed.
- **Numeric annotation** (IBM Plex Mono): Compact KPI figures, codes, and source identifiers where alignment and distinction aid scanning.

## Layout

The desktop shell uses a persistent navigation sidebar and a centered main-content region with a 1600px maximum width. Standard content spacing is 16px; major sections use 24px. Repeated cards use responsive grids with a minimum track around 170px.

At 768px and below, navigation and dense desktop layouts collapse into mobile-specific patterns. At 560px and below, selection grids become single-column. A control must keep a usable hit target; the system already treats 44px as the mobile target where space permits.

## Elevation & Depth

Depth is soft and structural. White surfaces use faint blue-tinted diffuse shadows; raised or overlay states increase blur and opacity without changing the component's role. Borders remain visible even when a shadow is present, particularly around fields and data surfaces.

### Shadow Vocabulary
- **Soft surface:** `0 10px 26px rgba(20, 60, 100, 0.08), 0 1px 3px rgba(20, 60, 100, 0.04)` for resting cards and filters.
- **Raised interaction:** `0 14px 34px -14px rgba(20, 60, 100, 0.22), 0 2px 8px rgba(20, 60, 100, 0.06)` for a deliberate hover or picked state.
- **Overlay:** `0 24px 48px rgba(20, 60, 100, 0.22)` for modal surfaces.

### Named Rules
**The Evidence Before Elevation Rule.** Use elevation to separate an actionable or layered surface, not to decorate every box.

## Shapes

The normative radius scale is intentionally small:

- **Surface** (`22px`): Cards, modals, filter bars, report panels, and other peer containers.
- **Control** (`10px`): Inputs, notices, compact rectangular buttons, segmented-control shells, and field-adjacent icons.
- **Pill** (`999px`): Tabs, compact actions, chips, tags, and explicitly capsule-shaped selectors.

Partial corners are valid only when the shape expresses containment or attachment: a sidebar may round only its exposed right corners; a bottom sheet may round only top corners; a chat bubble may reduce one tail corner. Circles and progress bars retain their geometric radius. These are exceptions by component anatomy, not alternative surface scales.

### Named Rules
**The Role, Not the File Rule.** A new card inherits `surface`, and a new form field inherits `control`, regardless of which CSS file or report module owns it. Do not introduce literal radii for a repeated UI role.

**The Legacy Radius Rule.** Existing literal `18px`, `20px`, `24px`, `8px`, and similar values are migration candidates, not additions to the design scale. Preserve a literal only when it is a documented geometric exception above.

## Components

### Buttons
- **Shape:** Primary and secondary compact actions are pills; rectangular KPI/comment actions use the control radius.
- **Primary:** Cyan background, white text, and a restrained raised shadow. Use once for the strongest local action.
- **Secondary / Ghost:** Surface-subtle or transparent background with a visible boundary where the button could be mistaken for static text.
- **Focus:** Use the cyan focus ring; do not rely on color shift alone.

### Chips
- **Style:** Pill geometry with concise text and a semantic or scoped background.
- **State:** A filter that narrows data must visibly distinguish itself from the all-data/default state.

### Cards / Containers
- **Corner Style:** Surface radius (`22px`) for peer data containers and overlays.
- **Background:** Default white surface on the pastel canvas.
- **Shadow Strategy:** Soft at rest; raised only for an intentional interactive or selected state.
- **Border:** Subtle blue-tinted border when a surface needs separation.

### Inputs / Fields
- **Style:** White surface, strong blue-tinted border, control radius (`10px`).
- **Focus:** Cyan border plus a visible focus ring.
- **Error / Disabled:** Error uses the semantic danger pair; a disabled field must remain distinguishable from a loading or empty field.

### Navigation
- **Style:** The desktop sidebar is the only persistent dark navy shell. Its exposed edge may use the documented partial `24px` radius; internal controls still use the shared control/pill roles.
- **State:** Active navigation uses a clear cyan/orange accent and text contrast; mobile navigation follows the same semantic active state.

## Do's and Don'ts

### Do:
- **Do** use `var(--radius-surface)` for a new card, modal, filter bar, report panel, or peer data container.
- **Do** use `var(--radius-control)` for a field or compact rectangular control.
- **Do** use `var(--radius-pill)` only when the component is intentionally capsule-shaped.
- **Do** keep a label, number, icon, or structural cue alongside semantic color.
- **Do** preserve visible keyboard focus and reduced-motion behavior.

### Don't:
- **Don't** add a literal `border-radius` to a repeated component role when a radius token exists.
- **Don't** make two peer white surfaces appear to have different curvature without a containment/attachment reason.
- **Don't** use a pill merely to make every control look alike; pills are for compact actions, tabs, and chips.
- **Don't** remove borders and rely solely on shadows to establish field or card boundaries.
