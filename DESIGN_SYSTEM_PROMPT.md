# Design System Prompt — RollCall

Design a visual system for RollCall: a mobile web app where a group at a restaurant table builds one shared sushi combo on their phones until the piece count hits the target exactly. The hero of every screen is a number climbing toward a target. Under is neutral, over is a problem, exact is the win. It is used one-handed, in dim light, by people mid-conversation who have never seen it before.

## The feeling

Japanese in **principle, not in costume**. Take the structural ideas — not the iconography.

Take these:
- **Ma (間)** — negative space as an active, composed element. Space is the design decision, not what's left over.
- **Asymmetric balance.** Compositions sit off-center and still feel settled. Almost nothing should be centered.
- **Subtraction.** Remove until only the necessary remains, then remove the frame around it. If a border, shadow, and fill are all doing the same job, keep one.
- **Material honesty.** Unbleached paper, sumi ink, unfinished wood, indigo-dyed cloth. Warm off-white, never clinical white. Ink that is warm near-black, never pure black or blue-black.
- **Precision in small things.** Hairline rules at true 1px. Exact optical alignment. Deliberate line breaks. The care lives in details nobody consciously notices.
- **Grid discipline**, in the tradition of Japanese editorial and packaging design — Kenya Hara and Muji, Naoto Fukasawa, transit signage systems. Rigorous underneath, quiet on the surface.

Do not take any of these: cherry blossoms, torii gates, waves, koi, red circles, noren, chopsticks or sushi iconography, brush-script or faux-kanji latin type, "zen garden" texture, or Japanese words used as decoration. If a Japanese person would read it as a foreigner's souvenir, it has failed. And remember this is a tool used *at* a sushi restaurant, not a sushi restaurant's website — resist the food-brand reflex entirely.

## Direction

**Space.** Generous and uneven. Let the ratio between the largest and smallest gaps be dramatic. Crowding is the enemy; so is uniform padding everywhere.

**Surface.** Flat. Hairline rules and space do the separating. No card-on-gray-background pattern, no drop shadows, no glass. If something must lift, let it be through contrast or space rather than a shadow.

**Type.** Pick a typeface with actual character and set it with conviction — a real editorial choice, not a default UI sans at default weights. Large sizes should be tight-tracked and confident; body copy should be generously leaded. Use scale and weight for hierarchy, not boxes and color.

**The number is the identity.** A total climbing to a target is the whole product. Make the numeral treatment the single most memorable decision in the system — proportion, tracking, alignment, how it sits against the target figure. Tabular figures so it doesn't jitter while counting. Everything else in the system should defer to it.

**Color.** One accent, earned and used sparingly, drawn from dye and pigment rather than a screen palette — indigo, sumi, vermilion, matcha, persimmon, raw clay. Nothing that could have come out of a default framework config. Dark mode is ink and lacquer: warm black, never blue-black slate.

**Motion.** Almost none. When the total changes, the number should settle rather than animate. Hitting the target is the one moment permitted real motion, and it should still be brief and quiet.

## The three states

Under, exact, and over need to be unmistakable at a glance in a dark restaurant, from a phone at arm's length — while meeting WCAG AA and never carrying meaning in hue alone. Pair every state with a change in weight, size, rule, or wording. Avoid the traffic-light reflex; find something better than green-for-good and red-for-bad.

Exact is the emotional payoff of the entire product and currently gets a color change and one line of text. Give that moment real thought.

## Hard bans

No purple-to-blue gradients. No gradient text. No glassmorphism or frosted panels. No blurred color blobs. No rounded card with a soft shadow on a light gray background. No bento grids. No emoji as icons. No 16–24px radius on everything — pick a small radius, or none, and mean it. No centered hero with a symmetrical layout. No Inter or Geist at default weights. No slate-plus-indigo. Do not put a border, a shadow, and a gradient on the same element.

Uniformity is the tell. Vary radius, weight, and spacing with intent. Leave one deliberate idiosyncrasy in the system — an unusual proportion, an unexpected alignment, a rule that breaks where it shouldn't — something a person would have chosen and a generator would not.

## Deliver

1. Tokens: color for light and dark, type scale, spacing scale, radii, rules, motion.
2. Components in every state: primary / secondary / text / quantity / count-chip buttons, text input, select, list row (default, renaming, locked), the progress block (under / exact / over), notice banner, final card, empty state.
3. The four screens at 390px: start a room, the builder, the locked final order, and an error or expired state.
4. The moment of hitting exact.

## Constraints

Mobile-first at 390px, thumb-first, 44px minimum touch targets, 16px minimum on inputs. Light and dark. WCAG AA. English now, Arabic and RTL later, so nothing may depend on left-to-right order and no text may be baked into graphics. The product logic is finished and fixed — this is a visual system dropping onto existing markup and states, not a redesign of the flow.

## The test

Put it beside twenty other apps designed this year. Someone should be able to pick it out — and be unable to say which template it came from.
