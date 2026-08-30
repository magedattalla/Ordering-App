# Order — Design Brief

## Direction

Order should feel like a thoughtful native iOS utility: immediate, calm, rounded, and finished. It is not a restaurant brand and should not borrow the visual language of any cuisine. The interface must work just as naturally for office coffee, a team lunch, takeaway with friends, or a large drinks order.

The temporary “Order” label and icon are placeholders. Branding must remain isolated from product structure.

## Context

People use this one-handed while talking, switching apps, and checking a menu. Most have never used it before. Joining and adding an item should be obvious without instructions.

Primary mobile target: 390px wide, including iPhone safe areas and standalone PWA mode.

## Visual principles

- Rounded iOS-style controls and surfaces, with radius chosen by component size rather than one radius everywhere.
- Apple system typography and native-feeling weight, spacing, and control density.
- Clear hierarchy with one obvious primary action per moment.
- Large touch targets, 16px inputs, strong focus states, and WCAG AA contrast.
- Restrained motion. Use motion only for state changes that benefit from it.
- Soft depth and blur may support hierarchy, but content must stay legible and surfaces must not become decorative noise.
- Layouts must use logical properties and remain ready for Arabic and RTL.

## Screens

### Start

Host nickname, restaurant/vendor, optional title, optional deadline, and one primary “Start order” action. Explain privacy and the 24-hour lifespan in one short line.

### Join

A minimal invite screen asking for a unique temporary nickname. Turnstile appears here only when enabled.

### Live order

- Fixed app header with brand, live/offline status, and local prototype badge when relevant.
- Order title/vendor, status, deadline warning, and share action.
- Readiness card with current participants and “I’m done.”
- Segmented navigation for Order, People, and Summary.
- Item composer with item, quantity stepper, instructions, and participant assignment chips.
- Item cards showing quantity, instructions, ownership, and edit/remove controls.
- Sticky host controls for close/reopen/place.

### People

Participant readiness, host indicator, rename, removal/reassignment, and host transfer. Destructive actions should be explicit but not visually dominant.

### Summary

Restaurant and person modes, optimized for scanning and copying. Instructions should never be visually confused with item names.

### Share sheet

Native share, link copy, and a large scannable QR code. Clearly state that the link is private.

## Required states

- Loading, empty, error, invalid link, expired room
- Online, reconnecting, and offline; offline changes are disabled and never queued
- Open, closed, and placed
- Ready/not ready
- Host/member and editable/read-only item
- Deadline upcoming and passed
- Installable/standalone safe-area behavior

## Accessibility and PWA

- Semantic labels and meaningful live regions
- Minimum 44px targets
- Reduced-motion support
- Keyboard-visible focus
- Versioned static-shell service worker that never caches API responses, room data, invite tokens, or Supabase traffic
- Replaceable manifest icons and Apple touch icon
