# Design System Strategy: Elegance at the Cellular Level

## 1. Overview & Creative North Star
**Creative North Star: "The Clinical Editorial"**
This design system rejects the "SaaS template" aesthetic in favor of a high-end, editorial approach to biotechnology. We aim to balance the clinical precision of a laboratory with the sophisticated prestige of a luxury brand. 

By leveraging **intentional asymmetry** and **tonal depth**, we break away from rigid, boxy grids. Layouts should feel like a premium scientific journal—breathable, high-contrast, and authoritative. We prioritize white space not as "empty" space, but as a functional tool to drive focus toward complex data sets. Elements may overlap subtly, and typography scales are pushed to extremes to create a clear visual hierarchy that feels curated rather than generated.

---

## 2. Colors
Our palette moves from deep, intellectual purples to sterile, medical greens, anchored by a "no-line" philosophy that emphasizes material depth over structural outlines.

### Core Palette
- **Primary (`#270F44`):** Used for deep-tier headers and critical navigation.
- **Primary Container (`#3D265A`):** The engine of the brand. Use for primary actions and hero backgrounds.
- **Secondary (`#694EA8`):** The elegant lavender accent. Used for secondary interaction states and supportive visuals.
- **Tertiary (`#002214` to `#003A24`):** The medical green. Reserved for success states, growth indicators, and "validated" data points.
- **Surface & Background (`#FEF7FD`):** A sterile, warm-tinted white that prevents eye strain and feels more premium than pure hex white.

### The "No-Line" Rule
Prohibit the use of 1px solid borders for sectioning. Definition between major content areas must be achieved through **background color shifts**. For example, a `surface-container-low` section should sit directly against a `surface` background. Let the change in tone define the boundary.

### Surface Hierarchy & Nesting
Treat the UI as a physical stack of fine paper. 
- Use `surface-container-lowest` for the base background.
- Layer `surface-container` and `surface-container-high` for nested content cards.
- This creates a "soft" depth that feels organic to the "cellular" theme.

### Signature Textures
Avoid flat, dead colors. For main CTAs and Hero backgrounds, use a subtle linear gradient transitioning from `primary` to `primary-container`. To add "soul" to the data, use **Glassmorphism** (semi-transparent surface colors with a `12px` to `20px` backdrop-blur) for floating navigation bars or contextual overlays.

---

## 3. Typography
The interplay between an authoritative serif and a utilitarian sans-serif mirrors the brand's dual nature: high-level science and human elegance.

- **Display & Headlines (Playfair Display / Newsreader):** Our serif face is the voice of authority. It should be used with generous leading. `display-lg` (3.5rem) should be used sparingly to create editorial "moments" on a page.
- **Title, Body, & Labels (Public Sans):** A clean, modern sans-serif designed for high readability in data-dense environments. 
- **The Hierarchy Strategy:** Use `label-md` in all-caps with `0.05rem` letter spacing for technical metadata to provide a "lab-stamped" aesthetic.

---

## 4. Elevation & Depth
We convey hierarchy through **Tonal Layering** rather than traditional drop shadows.

- **The Layering Principle:** Place a `surface-container-lowest` card on a `surface-container-low` background to create a "natural lift."
- **Ambient Shadows:** If a floating element (like a modal) is required, use an extra-diffused shadow: `box-shadow: 0 10px 40px rgba(39, 15, 68, 0.06);`. The shadow color must be a tinted version of our `primary` hex, never pure grey.
- **The "Ghost Border" Fallback:** If a container requires definition for accessibility, use a "Ghost Border": the `outline-variant` token at **20% opacity**. 
- **Refined Edges:** All containers must strictly adhere to a **4px radius** (`rounded-DEFAULT`). This sharp, subtle curve suggests precision and clinical accuracy.

---

## 5. Components

### Buttons
- **Primary:** `primary-container` background with `on-primary` text. Use a subtle gradient. 4px radius.
- **Secondary:** Ghost style. `ghost-border` (20% opacity) with `secondary` text.
- **Tertiary:** Text-only with `label-md` styling and a `2px` underline on hover.

### Input Fields
- Avoid full-box borders. Use a `surface-container-high` background with a `1px` bottom border in `outline-variant`.
- **Error State:** Use `error` (#BA1A1A) for the bottom border and helper text.

### Cards & Lists
- **Rule:** Forbid divider lines. 
- Use vertical white space (`spacing-8` or `spacing-12`) to separate list items. 
- For cards, use a slight color shift (`surface-container-lowest`) to distinguish the card from the background.

### Biotech Specifics: Data Chips
- **Status Chips:** Use `tertiary-container` for medical green status (e.g., "Analyzed") with `on-tertiary-container` text. Keep them small (`label-sm`) and rectangular (4px radius).

---

## 6. Do's and Don'ts

### Do
- **Do** use asymmetrical layouts where text is offset from imagery to create an editorial feel.
- **Do** treat "Medical Green" (`tertiary`) as a precision tool; use it only for data points and success states.
- **Do** prioritize "Public Sans" for any string of text longer than three lines to ensure clinical readability.

### Don't
- **Don't** use 100% opaque, high-contrast borders (e.g., 1px solid black). It breaks the "Elegance" promise.
- **Don't** use standard "drop shadows" from UI kits. Stick to tonal layering and tinted ambient blurs.
- **Don't** crowd the interface. If the data is dense, increase the surrounding white space on the `surface` layer to compensate.
- **Don't** use large border-radii. Anything over 8px feels too "consumer-tech" and loses the clinical precision of the system.