# RollCall — Design Brief

## The product

One group, one table, one sushi combo. Someone starts a room, shares a private link, and everyone at the table builds a single shared order on their own phone until the piece count hits the combo size exactly. Then the host locks it and reads it out to the restaurant.

There is no splitting, no per-person allocation, no prices, no accounts. Everyone edits one common list.

## The one job

Get a group of people to land on an exact number, together, in under two minutes, at a table, on phones.

The whole product is a number racing toward a target. Under is neutral. Over is a problem. Exact is the win, and it is the only state that unlocks finishing.

## Who and where

Three to eight people at a restaurant table. Dim light, one hand, phone held low under the table edge, someone is talking to them while they tap. Half the group joins by tapping a link in a group chat. Nobody signs up, nobody has used it before, and nobody will read instructions.

## Screens to design

**1. Start a room.** Restaurant name, combo size (presets 15/20/30/40/50/60/70/80/100, plus Custom which reveals a number field), one primary action. Current copy: eyebrow "One table. One combo.", headline "Hit the combo exactly.", support line, and fine print "Rooms stay private and expire after 24 hours."

**2. Quick verification.** Someone opening a shared link may hit a bot-check step first — a single CAPTCHA widget on an otherwise near-empty screen. Eyebrow "Private room", headline "Quick verification."

**3. The builder.** The main screen, where all the time is spent:
- Room header: restaurant name, and a Copy link action
- Progress block: the running total against the combo size, a progress bar, and a status line ("6 pieces left." / "1 piece to remove." / "Combo complete.")
- Add form: item name field (with a suggestion list of recent items for that restaurant), quick-count buttons 1 / 2 / 4 / 8, a custom number field, and an Add action
- The order: a list of item rows, each with name, an inline rename affordance, − and + controls, the piece count, and a Remove action. Empty state when nothing has been added.
- Finish: a full-width Finish order action, disabled unless the total is exact. Non-hosts see a note instead, because only the room creator can finalize.

**4. Final order.** The room is locked. All editing disappears. A confirmation card with the locked total and a Copy order action that yields restaurant-ready plain text.

## Every state that needs a design

- Progress: **under**, **exact**, **over** — three visually distinct treatments of the same block
- Item row: default, being renamed, and read-only (after the room is locked)
- List: empty, one item, many items, and a very long item name that must truncate
- Finish: disabled (under or over), enabled (exact), and the non-host variant
- Global: loading a room, an error/notice banner with a dismiss, an expired room, an invalid link
- A "Prototype mode" badge appears in the header while the app runs without a backend

## Constraints

- **Mobile-first and thumb-first.** Design at 390px. Everything reachable one-handed. Minimum 44px touch targets — the − and + get tapped repeatedly and in a hurry.
- **Inputs must render at 16px** or iOS zooms the page on focus.
- **Light and dark**, since this gets used in dim restaurants.
- **WCAG AA contrast.** The over state cannot rely on red alone; the exact state cannot rely on green alone.
- **English now, Arabic and RTL later.** Nothing should depend on left-to-right order or have text baked into graphics.
- **The logic is finished and must not change.** Deliver a visual system that drops onto the existing structure: same screens, same states, same actions.

## Explicitly out of scope

No prices or totals in currency. No participant names, avatars, or "who added what". No per-person allocation. No accounts, profiles, or order history. No restaurant menus or branding. Rooms vanish after 24 hours by design.

## What I need back

1. A token set — color (including both themes), type scale, spacing, radii, motion — to replace the current hardcoded values.
2. The four screens at 390px.
3. Component specs with all states listed above: buttons (primary / secondary / text / quantity / count-chip), input, select, item row, progress block, notice banner, final card.
4. The finalize moment: what changes on screen when a group hits exact and locks it in.

## Open design questions

These are unresolved in the prototype, and the answers will shape the design more than anything else:

1. **Remote changes are currently silent.** When someone else adds an item, the list just changes under your thumb. How should another person's edit announce itself without stealing focus mid-tap?
2. **Exact is the emotional payoff** and right now it is a color change and a line of text. What should hitting the number feel like?
3. **Over needs to guide, not just scold.** "1 piece to remove" does not tell you what to remove. Should the design point at a candidate?
4. **Hero on a small screen** — the big number, or the list? They compete for the top of the viewport, and the list grows.
5. **Copy link is the entire sharing mechanic** but currently sits as a small secondary button in the header. Does it need a moment of its own before the first item is added?

## Implementation notes for handoff

- React SPA. Markup is semantic with stable class names (`.progress-section.is-exact`, `.item-row`, `.count-button.selected`, `.final-card`, and so on), so styling can be replaced without touching logic.
- Colors are currently hardcoded hex literals in one stylesheet, not tokens. Part of this work is introducing the token layer.
- Live-updating regions already use `aria-live`; keep those announcements meaningful.
