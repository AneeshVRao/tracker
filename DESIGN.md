---
name: Outreach Tracker
description: A sleek personal desk for working an outreach list: ivory paper, warm hairlines, one deep-teal accent, one sans family.
colors:
  primary: "#0f766e"
  primary-soft: "#e3f1ee"
  on-primary: "#ffffff"
  primary-dark: "#5fd3c3"
  primary-soft-dark: "#17302c"
  on-primary-dark: "#0c1f1c"
  canvas: "#fffdf9"
  panel: "#ffffff"
  sunken: "#faf7ee"
  sidebar: "#f7f4ea"
  ink: "#1c1b17"
  muted: "#66645b"
  hairline: "#e6e3d2"
  canvas-dark: "#121411"
  panel-dark: "#191b17"
  sunken-dark: "#1f221d"
  sidebar-dark: "#161814"
  ink-dark: "#ecebe2"
  muted-dark: "#a6a59a"
  hairline-dark: "#2e312a"
  warn: "#9a4a06"
  bad: "#b42318"
  good: "#166534"
  warn-dark: "#f2b45c"
  bad-dark: "#f2938a"
  good-dark: "#74d39a"
typography:
  page-title:
    fontFamily: "Figtree, ui-sans-serif, system-ui, sans-serif"
    fontSize: "26px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  record-name:
    fontFamily: "Figtree, ui-sans-serif, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  record-name-panel:
    fontFamily: "Figtree, ui-sans-serif, system-ui, sans-serif"
    fontSize: "21px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  stat-figure:
    fontFamily: "Figtree, ui-sans-serif, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.03em"
  section-title:
    fontFamily: "Figtree, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Figtree, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Figtree, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
  button:
    fontFamily: "Figtree, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
  mono-count:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "11px"
    fontWeight: 400
rounded:
  keycap: "5px"
  input: "8px"
  card: "12px"
  palette: "12px"
  pill: "9999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    height: "32px"
    padding: "0 16px"
  button:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    height: "32px"
    padding: "0 14px"
  button-hover:
    backgroundColor: "{colors.sunken}"
  input:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.input}"
    height: "32px"
    padding: "0 10px"
  search-trigger:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.muted}"
    rounded: "{rounded.pill}"
    height: "36px"
    padding: "0 12px"
  card:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.card}"
  palette:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.palette}"
  nav-item:
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "6px 12px"
  nav-item-current:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
  keycap:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.muted}"
    rounded: "{rounded.keycap}"
---

# Design System: Outreach Tracker

## Overview

**Creative North Star: "The Research Desk"**

A personal desk for working through a list of people, set on ivory paper with warm hairlines, not a SaaS dashboard. The refinement is sleekness: one sans family, tight tracking, uniform 32px controls, soft layered shadows, and a single entrance motion. One deep teal appears only where the user acts or where they are. Dark mode is the same desk by lamplight: warm near-black with a light teal.

Density is compact (13.5px body, 12px labels, 8-12px gaps) but unhurried; pages are a single centred column with stacked card sections. Keyboard use is first-class: Ctrl+K jumps anywhere, Session is driven by single keys.

**Key Characteristics:**
- Ivory canvas, white panels, tinted sunken wells, tan-grey hairlines (no cool greys).
- One accent (deep teal) for primary action and the current item.
- Figtree carries everything, titles included: semibold, tight negative tracking. Mono only for counts and keys.
- Pills for buttons, chips and nav; 12px cards; 8px inputs; 5px keycaps; every control 32px tall.
- Depth by hairline plus a diffuse warm layered shadow on cards; a deeper one on the palette only.
- One authored motion: pages settle in on navigation.

## Colors

Warm ivory neutrals with a single deep-teal accent; status colors are muted and used only for state. All values are CSS custom properties that swap in `prefers-color-scheme: dark`.

### Primary
- **Deep Teal** (#0f766e; dark mode Lamp Teal #5fd3c3): primary buttons, the current nav item's icon, the accent word in page titles, links, focus ring, caret, selection, progress bar fill, accepted/sent chips, selected palette row (as Teal Mist), sidebar logo tile.
- **Teal Mist** (#e3f1ee; dark #17302c): profile avatar fill, selected palette row.
- **On Accent** (#ffffff; dark #0c1f1c): the label colour on any Deep Teal fill, a single token (`--color-on-accent`); never hard-code it.

### Neutral
- **Ivory Canvas** (#fffdf9; dark #121411): page background.
- **Paper White** (#ffffff; dark #191b17): cards, inputs, buttons, current nav pill, palette.
- **Sunken Parchment** (#faf7ee; dark #1f221d): row hover, summary header (at 70%), Session counter pill, hovered buttons.
- **Sidebar Sand** (#f7f4ea; dark #161814): sidebar only.
- **Warm Ink** (#1c1b17; dark #ecebe2): text.
- **Muted Umber** (#66645b; dark #a6a59a): labels, notes, secondary text.
- **Tan Hairline** (#e6e3d2; dark #2e312a): every border and divider.

### Status
- **Amber** (#9a4a06; dark #f2b45c), **Brick** (#b42318; dark #f2938a), **Moss** (#166534; dark #74d39a): warnings, errors and deadlines, successes. Used as 8-10% tinted fills with 30% borders and full-strength text (notices, chips, counters near a limit).

### Named Rules
**The One Teal Rule.** Teal marks the primary action and the current item, plus its interaction states (focus, link, progress). Nothing decorative is teal.
**The Warm Hairline Rule.** Borders are Tan Hairline, never a cool grey; shadows are tinted warm (rgb 40 35 15 family).
**The On-Accent Rule.** Text on a teal fill uses the on-accent token so light and dark modes stay legible.

## Typography

**Display Font:** none; titles use Figtree.
**Body Font:** Figtree (ui-sans-serif, system-ui fallback)
**Label/Mono Font:** JetBrains Mono (with ui-monospace)

**Character:** One friendly geometric sans at several weights, set tight at size; hierarchy comes from size, semibold and tracking, not a second family.

### Hierarchy
- **Page title** (600, 26px, 1.2, -0.025em): one per page; an `<em>` inside is teal and not italic ("Today, *Friday, Oct 2*"). Used on most pages; not every page has an accent word.
- **Record name** (600, 24px in Session, 21px in the contact panel, -0.025em / -0.02em): the person being worked on.
- **Stat figure** (600, 28px, line-height 1, -0.03em, tabular): the number in summary tiles; zero dims to muted, limit states go warn/bad.
- **Section title** (600, 14px, -0.01em): headings above card groups.
- **Body** (400, 13.5px, 1.5): UI text; descriptive paragraphs 14px, capped near 60ch.
- **Label** (500, 12px, muted): tile labels, table heads, field labels, notes.
- **Button** (500 secondary / 600 primary, 13px).
- **Mono count** (400, 11px, muted): sidebar counts, keycaps, inline ready counts. Tabular numerals apply to all numbers and table cells.

### Named Rules
**The Mono Is For Keys Rule.** JetBrains Mono carries counts, dates and keys only, never prose or labels.
**The One Family Rule.** Titles, names and figures are Figtree semibold with negative tracking; do not introduce a serif or display face.

## Layout

Fixed sticky sidebar (64px icon rail below md, 240px from md) beside a fluid main. Pages sit in a centred column (`max-w-5xl`, Session `max-w-3xl`), padded 16px on mobile and 32px from md, with 24px between sections and 12px between tiles. The Today page order is: summary header card, four-up tile grid (2-up on mobile), then deadline and due sections, replies waiting, then "Next up". Rows are flex lines with 16px horizontal and 10px vertical padding, wrapping on small screens. Session pins a keycap legend footer to the bottom of the viewport. Every control (button, input, select) is 32px tall; textareas size to content.

## Elevation & Depth

Hairline-led with a soft, diffuse lift. Cards carry a two-layer warm shadow (a 1px contact plus a long, faint bleed); hover shifts border or background rather than lifting. Focus is a 2px teal outline (inputs: teal border plus a 15% teal ring). Only the command palette is truly floating, over a blurred, ink-tinted backdrop.

### Shadow Vocabulary
- **Card** (`--shadow-card`: `0 1px 2px rgb(40 35 15 / .04), 0 6px 20px -12px rgb(40 35 15 / .12)`): cards, import drop zone.
- **Pop** (`--shadow-pop`: `0 2px 6px rgb(40 35 15 / .06), 0 24px 60px -20px rgb(40 35 15 / .35)`): the command palette dialog only. Both tokens are re-tuned black in dark mode.
- **Control** (`--shadow-control`, `0 1px 2px rgb(40 35 15 / .06)`; dark `rgb(0 0 0 / .3)`): secondary buttons, current nav pill, sidebar search trigger. Primary adds an inset 18% white top edge and `0 1px 2px rgb(15 118 110 / .3)`.
- **Keycap** (`0 1px 0 hairline`): the keycap's bottom edge only.

### Named Rules
**The Hairline First Rule.** Separation comes from a 1px Tan Hairline; shadows never exceed the vocabulary above, and Pop is reserved for modal surfaces.

## Shapes

Pills for anything you press (buttons, nav items, chips, the sidebar search trigger), 12px for containers and the palette, 8px for inputs and notices, 5px for keycaps, a 12px-rounded logo tile, and circles for the avatar. Rows inside a card are divided by hairlines, not nested boxes.

## Components

### Buttons
- **Shape:** full pill (9999px), 32px tall, 13px text, 14px horizontal padding (16px primary), 6px icon gap.
- **Primary:** Deep Teal fill, on-accent text, semibold; hover brightens. One per view (Start session, Mark sent).
- **Secondary:** Paper White, hairline border, ink text; hover Sunken Parchment and a darker border.
- **Press / disabled:** 1px downward press; 40% opacity disabled.
- Primary buttons may embed a keycap (translucent on-accent inside).

### Chips
- **Style:** pill, 12px medium, hairline or 30% tinted border. Neutral statuses on Sunken; sent/accepted teal tint; replied/conversation green tint; skipped struck through.

### Cards / Containers
- **Corner Style:** 12px. **Background:** Paper White (summary header uses Sunken at 70%). **Border:** hairline. **Shadow:** Card. **Padding:** tiles 16x12; panels 20-28px. Section lists are one card with hairline-divided rows.

### Inputs / Fields
- **Style:** 32px tall, 8px radius, hairline border, Paper White, 13.5px; placeholder muted. Textarea is auto height with 8px vertical padding.
- **Focus:** teal border plus 15% teal ring. Checkboxes and radios are 14px and teal.

### Navigation
- Icon (Phosphor, 17px regular) plus label plus mono count right-aligned; pill shaped. Current: white pill, hairline, semibold, teal icon. Below md only icons show. Top: a teal logo tile and wordmark (16px semibold), then a search trigger (36px pill, muted, "Search or jump" with a Ctrl K keycap) that opens the palette. Bottom: a profile card (initial in a teal-mist circle, name, availability).

### Command Palette
- Ctrl/Cmd+K or the sidebar trigger opens a native `<dialog>` (modal), 560px max, 12px radius, Paper White, hairline border, Pop shadow, 14vh from the top, over a 25% ink backdrop with a 2px blur. Search row (48px input, 15px text, Esc keycap) above a hairline-separated list; the selected row is Teal Mist, arrow keys move, Enter goes, backdrop click closes.

### Page Settle
- The one authored motion: each page's direct children rise 6px and fade in over .28s on an ease-out-expo curve when navigated to. Disabled under `prefers-reduced-motion`; link and button colour transitions (150ms) are also disabled.

### Notices
- 8px radius, 12px text, tinted by warn/bad/good.

### Keycap
- 5px radius, hairline border, mono 11px muted, 1px bottom edge. Legend row in Session footer.

## Do's and Don'ts

### Do:
- **Do** reserve Deep Teal for the primary action and the current item.
- **Do** put the accent word in a page title in an `<em>` (teal, upright) where the title has a natural one.
- **Do** use mono for counts, dates and keys, with tabular numerals.
- **Do** keep pills for pressables, 12px cards, 8px inputs, 5px keycaps, and 32px control height.
- **Do** use `--color-on-accent` for text on teal and the `--shadow-card` / `--shadow-pop` tokens for depth.
- **Do** use real icons from the Phosphor set, 15-17px, paired with a label or aria-label.

### Don't:
- **Don't** use cool greys or pure black borders; stay on the warm hairline.
- **Don't** add a second accent hue or gradient fills.
- **Don't** introduce a serif or a second display face.
- **Don't** add further entrance animations; the page settle is the only one.

Not canonized (defects the build carries): the Contacts page h1 is a one-off 18px semibold with an inline mono count rather than the page-title style; the keycap's offset shadow is a one-off keycap edge, not a house shadow style.
