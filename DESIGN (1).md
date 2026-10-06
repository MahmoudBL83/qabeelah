---
name: Heritage Heirloom
colors:
  surface: '#fbf9f4'
  surface-dim: '#dbdad5'
  surface-bright: '#fbf9f4'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f5f3ee'
  surface-container: '#f0eee9'
  surface-container-high: '#eae8e3'
  surface-container-highest: '#e4e2dd'
  on-surface: '#1b1c19'
  on-surface-variant: '#444748'
  inverse-surface: '#30312e'
  inverse-on-surface: '#f2f1ec'
  outline: '#747878'
  outline-variant: '#c4c7c7'
  surface-tint: '#5f5e5e'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#1c1b1b'
  on-primary-container: '#858383'
  inverse-primary: '#c8c6c5'
  secondary: '#775a19'
  on-secondary: '#ffffff'
  secondary-container: '#fed488'
  on-secondary-container: '#785a1a'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#261900'
  on-tertiary-container: '#9a804f'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e5e2e1'
  primary-fixed-dim: '#c8c6c5'
  on-primary-fixed: '#1c1b1b'
  on-primary-fixed-variant: '#474746'
  secondary-fixed: '#ffdea5'
  secondary-fixed-dim: '#e9c176'
  on-secondary-fixed: '#261900'
  on-secondary-fixed-variant: '#5d4201'
  tertiary-fixed: '#ffdea5'
  tertiary-fixed-dim: '#e1c28b'
  on-tertiary-fixed: '#261900'
  on-tertiary-fixed-variant: '#584418'
  background: '#fbf9f4'
  on-background: '#1b1c19'
  surface-variant: '#e4e2dd'
typography:
  display-lg:
    fontFamily: IBM Plex Sans Arabic
    fontSize: 48px
    fontWeight: '600'
    lineHeight: 60px
    letterSpacing: '0'
  headline-lg:
    fontFamily: IBM Plex Sans Arabic
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 44px
    letterSpacing: '0'
  headline-md:
    fontFamily: IBM Plex Sans Arabic
    fontSize: 24px
    fontWeight: '500'
    lineHeight: 32px
    letterSpacing: '0'
  body-lg:
    fontFamily: IBM Plex Sans Arabic
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 30px
    letterSpacing: '0'
  body-md:
    fontFamily: IBM Plex Sans Arabic
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 26px
    letterSpacing: '0'
  label-md:
    fontFamily: IBM Plex Sans Arabic
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0.02em
  headline-lg-mobile:
    fontFamily: IBM Plex Sans Arabic
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 38px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 8px
  xs: 0.25rem
  sm: 0.5rem
  md: 1rem
  lg: 1.5rem
  xl: 2rem
  xxl: 4rem
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 64px
---

## Brand & Style
The brand personality is rooted in the concept of a "Digital Heirloom"—a bridge between ancestral legacy and modern technology. It evokes a sense of permanence, dignity, and meticulous care. The target audience includes multi-generational families and researchers who value tradition but expect the efficiency of high-end SaaS.

The visual style is **Tactile Minimalism with Heritage Accents**. It avoids the sterility of modern corporate design by incorporating subtle textures and a warm, organic color palette. Design elements draw inspiration from classical Arabic calligraphy and bookbinding, using refined borders and soft depth to create a UI that feels curated and preserved.

## Colors
The palette is built on "Deep Charcoal" and "Parchment," moving away from cold blues toward a high-contrast, prestigious warmth. 

- **Primary (Deep Charcoal):** Used for typography and structural integrity. It provides the "ink" on the page.
- **Secondary (Rich Gold/Sand):** Reserved for interactive elements, highlights, and signifies "precious" information.
- **Background (Soft Parchment):** A cream-based neutral that reduces eye strain and mimics the feel of high-quality paper.
- **Accents:** Muted earth tones (deep greens and brick reds) are used sparingly for functional states to maintain the heritage aesthetic.

## Typography
This design system utilizes **IBM Plex Sans Arabic** for its exceptional legibility and modern take on Kufic and Naskh structures. 

The hierarchy prioritizes a generous line height (1.5x to 1.6x for body text) to accommodate the ascending and descending strokes of the Arabic script, ensuring the UI never feels cramped. Headlines use a heavier weight to anchor the page, while body text remains light and airy. Label styles utilize slightly increased letter spacing for Latin characters, though Arabic remains naturally connected.

## Layout & Spacing
The layout uses a **Fixed Grid** system for desktop to maintain an editorial, book-like feel, centering content within a maximum width of 1280px. 

- **RTL Implementation:** The entire spatial logic is flipped; primary navigation sits on the right, and the reading gravity moves from right to left.
- **Grid:** A 12-column grid on desktop, transitioning to a 4-column grid on mobile. 
- **Rhythm:** An 8px baseline grid ensures vertical harmony. Generous margins (`margin-desktop`) are used to create an "archive" feel, giving the content room to breathe.

## Elevation & Depth
Depth is created through **Tonal Layers** and **Ambient Shadows** rather than high-contrast light sources.

- **The Base:** The Parchment background acts as the lowest layer.
- **Surface Containers:** Cards and modals use a slightly lighter cream or pure white with a very thin (0.5px) border in Sand or Light Charcoal.
- **Shadows:** Shadows are highly diffused and tinted with the Secondary Gold color (e.g., `rgba(140, 115, 67, 0.08)`), making elements appear as if they are resting softly on paper rather than floating in digital space.
- **Textures:** Subtle, low-opacity geometric Islamic patterns are used in the backgrounds of sidebars or header areas to add a tactile, historical quality.

## Shapes
The shape language is **Soft (0.25rem)**. While modern, the design avoids the "bubbliness" of high-roundedness levels to maintain a sense of formal tradition. 

- **Standard Elements:** Buttons and input fields use a 4px (0.25rem) radius.
- **Containers:** Large cards and featured sections may use up to 8px (0.5rem) to signify a distinct content area.
- **Refined Borders:** Decorative borders utilize thin strokes and occasionally include "corner accents"—small 45-degree notches or geometric motifs—to reinforce the heritage theme.

## Components
- **Buttons:** Primary buttons are Solid Charcoal with Gold text or vice versa. They use a "pressed" state that slightly deepens the gold tone. Secondary buttons use a "Ghost" style with a refined 1px border.
- **Input Fields:** Bottom-bordered or fully outlined with a very subtle Sand stroke. Labels always sit above the field, right-aligned.
- **Cards:** Feature a subtle paper-texture overlay. Used for individual ancestors in a lineage view or archival documents.
- **Lineage Tree Nodes:** Custom components that use thin, gold-tinted connecting lines to show relationships, maintaining a "manuscript" aesthetic.
- **Chips/Badges:** Used for "Verified" lineage or "Historical" tags, utilizing small, elegant serif-like icons alongside the sans-serif text.
- **Navigation:** A right-aligned vertical sidebar on desktop, utilizing subtle divider lines and active states highlighted by a vertical Gold bar.