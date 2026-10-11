# Full Menu Browser Design

## Goal

Give people a fast way to browse the complete Almaz menu without losing the existing quick search flow. The current search picker remains the fastest path for someone who knows what they want. A new **See full menu** button opens a full-screen mobile menu for browsing.

## Interaction

The menu opens as a fixed full-screen page above the order room. Its header contains a close control, the Almaz name, and search. Directly below it, categories appear in a horizontally scrollable pill row. Selecting a category scrolls the vertical menu list to that section. As the person scrolls vertically, the active category updates.

Every menu row shows the item name, optional description, reference price, and an **Add** button. Adding an item increases a temporary quantity in the menu; the button becomes an inline minus/count/plus stepper. Nothing is written to the shared order until confirmation.

A fixed safe-area-aware footer shows the number of selected items and a **Confirm order** button. Confirmation adds each selected item as a separate personal order line assigned to the current participant, then closes the menu. Existing order summaries stay unchanged and prices remain reference-only. The user can still edit quantities, instructions, or assignments afterward through the existing item editor.

## States and safeguards

The confirmation button is disabled when nothing is selected or while saving. Failed saves keep the menu open and preserve the unconfirmed selection so the person can retry. Closing the menu discards unconfirmed choices after confirmation. Body scrolling is locked while the full-screen menu is open, and Escape closes it on desktop.

## Verification

Test horizontal category navigation, vertical scrolling, search filtering, quantity changes, disabled and saving states, multi-item confirmation, mobile safe areas, keyboard behavior, and unchanged restaurant/person summaries.
