---
name: Outreach Tracker
description: A personal research desk for working an outreach list: ivory paper, warm hairlines, one deep-teal accent.
colors:
  primary: "#0f766e"
  primary-soft: "#e3f1ee"
  primary-dark: "#5fd3c3"
  primary-soft-dark: "#17302c"
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
typography:
  page-title:
    fontFamily: "EB Garamond, Georgia, serif"
    fontSize: "30px"
    fontWeight: 500
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  section-title:
    fontFamily: "EB Garamond, Georgia, serif"
    fontSize: "19px"
    fontWeight: 500
    lineHeight: 1.25
  stat-figure:
    fontFamily: "EB Garamond, Georgia, serif"
    fontSize: "30px"
    fontWeight: 400
    lineHeight: 1
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
  pill: "9999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    rounded: "{rounded.pill}"
    padding: "4px 14px"
  button:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "4px 14px"
  button-hover:
    backgroundColor: "{colors.sunken}"
  input:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.input}"
    padding: "4px 10px"
  card:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.card}"
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

A personal desk for working through a list of people, set on ivory paper with warm hairlines, not a SaaS dashboard. The surface is quiet and low in contrast; one deep teal appears only where the user acts or where they are. Serif titles give pages a bookish voice, Figtree does the working UI, and mono is kept for numbers and keys. Dark mode is the same desk by lamplight: warm near-black with a light teal.

Density is compact (13.5px body, 12px labels, 8-12px gaps) but unhurried; pages are a single centred column with stacked card sections.

**Key Characteristics:**
- Ivory canvas, white panels, tinted sunken wells, tan-grey hairlines (no cool greys).
- One accent (deep teal) for primary action and the current item.
- Serif page and section titles; the page title carries one italic teal word.
- Pills for buttons, chips and nav; 12px cards; 8px inputs; 5px keycaps.
- Depth by hairline plus a barely-there warm shadow.

## Colors

Warm ivory neutrals with a single deep-teal accent; status colors are muted and used only for state.

### Primary
- **Deep Teal** (#0f766e; dark mode Lamp Teal #5fd3c3): primary buttons, the current nav item's icon, the italic word in page titles, links, focus ring, caret, selection, progress bar fill, accepted/sent chips.
- **Teal Mist** (#e3f1ee; dark #17302c): profile avatar fill.

### Neutral
- **Ivory Canvas** (#fffdf9; dark #121411): page background.
- **Paper White** (#ffffff; dark #191b17): cards, inputs, buttons, current nav pill.
- **Sunken Parchment** (#faf7ee; dark #1f221d): row hover, summary header (at 70%), neutral chips, hovered buttons.
- **Sidebar Sand** (#f7f4ea; dark #161814): sidebar only.
- **Warm Ink** (#1c1b17; dark #ecebe2): text.
- **Muted Umber** (#66645b; dark #a6a59a): labels, notes, secondary text.
- **Tan Hairline** (#e6e3d2; dark #2e312a): every border and divider.

### Status
- **Amber** (#9a4a06), **Brick** (#b42318), **Moss** (#166534): warnings, errors and deadlines, successes. Used as 8-10% tinted fills with 30% borders and full-strength text (notices, chips, counters near a limit).

### Named Rules
**The One Teal Rule.** Teal marks the primary action and the current item, plus its interaction states (focus, link, progress). Nothing decorative is teal.
**The Warm Hairline Rule.** Borders are Tan Hairline, never a cool grey; shadows are tinted warm (rgb 60 50 20).

## Typography

**Display Font:** EB Garamond (weights 400, 500, italic; Georgia fallback)
**Body Font:** Figtree (sans fallback)
**Label/Mono Font:** JetBrains Mono (with ui-monospace)

**Character:** A scholarly serif over a friendly geometric sans; the serif names things, the sans does things.

### Hierarchy
- **Page title** (500, 30px, 1.15, -0.01em): one per page; `<em>` inside is italic teal, one word or phrase ("Today, *Friday, Oct 2*").
- **Section title** (500, 19px): headings above card groups; also the sidebar wordmark and contact name in Session (26px).
- **Stat figure** (400, 30px, line-height 1, tabular): the number in summary tiles; zero dims to muted.
- **Body** (400, 13.5px, 1.5): UI text; descriptive paragraphs 14px, capped near 60ch.
- **Label** (500, 12px, muted): tile labels, table heads, field labels, notes.
- **Button** (500 / 600 primary, 13px).
- **Mono count** (400, 11px, muted): sidebar counts, keycaps; also inline ready counts. Tabular numerals apply to all numbers and table cells.

### Named Rules
**The Mono Is For Keys Rule.** JetBrains Mono carries counts, dates and keys only, never prose or labels.

Divergence: summary-tile figures use the serif, not mono, in the build.

## Layout

Fixed sticky sidebar (64px icon rail below md, 240px from md) beside a fluid main. Pages sit in a centred column (`max-w-5xl`, Session `max-w-3xl`), padded 16px on mobile and 32px from md, with 24px between sections and 12px between tiles. The Today page order is: summary header card, four-up tile grid (2-up on mobile), then due and deadline sections, then "Next up". Rows are flex lines with 16px horizontal and 10px vertical padding, wrapping on small screens. Session pins a keycap legend footer to the bottom of the viewport.

## Elevation & Depth

Flat and hairline-led. Cards, buttons and the current nav pill carry a near-invisible warm 1px shadow; hover shifts border or background rather than lifting. Focus is a 2px teal outline (inputs: teal border plus a 15% teal ring).

### Shadow Vocabulary
- **Card** (`0 1px 3px rgb(60 50 20 / .05)`): cards.
- **Button** (`0 1px 2px rgb(60 50 20 / .06)`): secondary buttons, current nav pill. Primary uses `0 1px 2px rgb(15 118 110 / .25)`.
- **Keycap** (`0 1px 0 hairline`): the keycap's bottom edge only.

### Named Rules
**The Hairline First Rule.** Separation comes from a 1px Tan Hairline; shadows never exceed the vocabulary above.

## Shapes

Pills for anything you press (buttons, nav items, chips), 12px for containers, 8px for inputs and notices, 5px for keycaps, and circles for the avatar. Rows inside a card are divided by hairlines, not nested boxes.

## Components

### Buttons
- **Shape:** full pill (9999px), 13px text, 4px 14px padding, 6px icon gap.
- **Primary:** Deep Teal fill, white text, semibold; hover brightens. One per view (Start session, Mark sent). Dark mode label is #0c1f1c on light teal.
- **Secondary:** Paper White, hairline border, ink text; hover Sunken Parchment and a darker border.
- **Press / disabled:** 1px downward press; 40% opacity disabled.
- Primary buttons may embed a keycap (translucent inside).

### Chips
- **Style:** pill, 12px medium, hairline or 30% tinted border. Neutral statuses on Sunken; sent/accepted teal tint; replied/conversation green tint; skipped struck through.

### Cards / Containers
- **Corner Style:** 12px. **Background:** Paper White (summary header uses Sunken at 70%). **Border:** hairline. **Padding:** tiles 16x12; panels 20-28px. Section lists are one card with hairline-divided rows.

### Inputs / Fields
- **Style:** 8px radius, hairline border, Paper White, 13.5px; placeholder muted.
- **Focus:** teal border plus 15% teal ring. Checkboxes and radios are teal.

### Navigation
- Icon (Phosphor, 17px regular) plus label plus mono count right-aligned; pill shaped. Current: white pill, hairline, semibold, teal icon. Below md only icons show. Bottom of sidebar holds a profile card (serif initial in a teal-mist circle, name, availability).

### Notices
- 8px radius, 12px text, tinted by warn/bad/good.

### Keycap
- 5px radius, hairline border, mono 11px muted, 1px bottom edge. Legend row in Session footer.

## Do's and Don'ts

### Do:
- **Do** reserve Deep Teal for the primary action and the current item.
- **Do** put one italic teal word or phrase in each page title.
- **Do** use mono for counts, dates and keys, with tabular numerals.
- **Do** keep pills for pressables, 12px cards, 8px inputs, 5px keycaps.
- **Do** use real icons from the Phosphor set, 15-17px, paired with a label or aria-label.

### Don't:
- **Don't** use cool greys or pure black borders; stay on the warm hairline.
- **Don't** add a second accent hue or gradient fills.
- **Don't** set body or UI text in the serif.

Not canonized (defects the build carries): dark-mode primary label colour is hard-coded in several places rather than tokenized; the keycap's offset shadow is a one-off keycap edge, not a house shadow style.
