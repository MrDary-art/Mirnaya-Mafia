---
name: Arena Negotiations — Public Landing
description: A calm forest gateway to personal practice and company workspaces.
colors:
  forest-ink: "#022e24"
  moss: "#1f4d3a"
  business-green: "#1f4d3a"
  eucalyptus: "#4f8f75"
  sage: "#9fc3b2"
  forest-paper: "#e7f1ec"
  warm-header: "#e7f1ec"
typography:
  display:
    fontFamily: '"Manrope Variable", sans-serif'
    fontSize: "clamp(52px, 5.4vw, 78px)"
    fontWeight: 780
    lineHeight: 1.12
    letterSpacing: "-.035em"
  headline:
    fontFamily: '"Gateway Literata", Georgia, serif'
    fontSize: "clamp(48px, 6.3vw, 88px)"
    fontWeight: 400
    lineHeight: 1.16
    letterSpacing: "-.04em"
  title:
    fontFamily: '"Manrope Variable", sans-serif'
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-.035em"
  body:
    fontFamily: '"Manrope Variable", sans-serif'
    fontSize: "15px"
    lineHeight: 1.6
  label:
    fontFamily: '"Manrope Variable", sans-serif'
    fontSize: "14px"
    lineHeight: 1.4
rounded:
  pill: "999px"
  card: "24px"
  landscape: "18px"
spacing:
  compact: "12px"
  card: "24px"
  section-head: "40px"
components:
  button-primary:
    backgroundColor: "{colors.moss}"
    textColor: "{colors.forest-paper}"
    rounded: "{rounded.pill}"
    padding: "10px 24px"
    width: "224px"
  button-primary-hover:
    backgroundColor: "{colors.forest-ink}"
  button-inverse:
    backgroundColor: "{colors.forest-paper}"
    textColor: "{colors.forest-ink}"
    rounded: "{rounded.pill}"
    padding: "10px 24px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.forest-paper}"
    rounded: "{rounded.pill}"
    padding: "10px 24px"
  card-personal:
    backgroundColor: "{colors.forest-ink}"
    textColor: "{colors.forest-paper}"
    rounded: "{rounded.card}"
    padding: "24px 24px 16px"
  card-business:
    backgroundColor: "{colors.business-green}"
    textColor: "{colors.forest-paper}"
    rounded: "{rounded.card}"
    padding: "24px 24px 16px"
  card-step:
    backgroundColor: "{colors.forest-paper}"
    textColor: "{colors.forest-ink}"
    rounded: "{rounded.card}"
    padding: "24px"
---

# Design System: Arena Negotiations — Public Landing

## Overview

**Creative North Star: "A Clearing for Conversation"**

The composition and typography below describe the public `/` landing. By the user's subsequent request, its five-colour forest palette now applies throughout the product: personal practice, company workspaces, administration, authentication, standalone calls, charts and generated PDF documents. Canonical colour roles are defined in `frontend/src/design/tokens.css` and documented in `docs/forest-palette.md`.

The landing is calm, spacious, and welcoming. Bold sans-serif promises meet italic literary headings, while existing illustrated forests give the page a consistent setting. Light sections provide breathing room between immersive forest sections. The metaphor names this already approved direction rather than introducing a new identity.

**Key Characteristics:**

- Alternating forest and pale paper surfaces.
- Bold Manrope paired with italic Literata.
- Rounded controls and broad landscape crops.
- Two clearly distinguished entry paths.

## Colors

Muted greens create depth; pale surfaces keep content readable.

### Primary

- **Forest Ink:** dark personal-offer surface, text on light sections, and forest overlays.
- **Moss:** primary start controls on light sections.

### Secondary

- **Moss Shadow:** the company offer surface and actions; Forest Paper text has 8.34:1 contrast.
- **Eucalyptus:** visible keyboard focus.
- **Sage:** decorative scroll arrow, selection, and inverse-button hover.

### Neutral

- **Forest Paper:** light content sections, step cards, and text on dark surfaces.
- **Pale Lichen:** the navigation strip and light page surfaces.

**The Readable Forest Rule.** Forest artwork supports the text; maintain the existing dark overlays and at least 4.5:1 contrast for normal text.

## Typography

**Display Font:** Manrope Variable, with sans-serif fallback.
**Body Font:** Manrope Variable, with sans-serif fallback.
**Editorial Font:** Gateway Literata, with Georgia and serif fallbacks, loaded from the existing `frontend/public/assets/serials/literata.ttf`.

**Character:** confident, compact sans-serif statements soften into italic serif conclusions. The hero uses two bold lines followed by one italic line; section headings and step numbers reuse the serif voice.

### Hierarchy

- **Display:** the hero promise; its italic third line uses regular Literata at 0.98em. On mobile, the bold size becomes `clamp(37px, 9.3vw, 60px)`, with 1.15 line height; the italic line becomes 0.9em with 1.25 line height.
- **Headline:** italic section headings. Mobile offers use `clamp(33px, 8vw, 52px)`; how-to uses 49px and about uses 50px.
- **Title:** offer headings; step headings use 25px, weight 750.
- **Body:** offer and step explanations; hero introduction uses 19px with 1.6 line height and a 650px maximum width, becoming 16px on mobile.
- **Label:** compact navigation, offer labels, and card actions; preserve sentence case.

## Layout

Desktop content is centered within `min(100% - 120px, 1320px)`. At 1000px the side gutters become 32px, and at 700px they become 20px. The light header has the owl at left, three centered section links, and a start pill at right.

The approved page sequence is: forest hero with introduction, two CTAs and a large diagonal arrow; light offers section with two forest-image cards; forest how-to section with title/CTA at left and three numbered pale steps at right; light about section with prose and four team portraits; dark footer with product summary, section links, company link, and entry action.

Below 700px, navigation becomes a toggle menu, offers stack, and how-to becomes title → steps → CTA. The team portraits form a 2×2 grid and the footer becomes one column. Keep the whitespace between “Как это” and “работает” when hiding the desktop line break. Header, cards, and typography reduce without changing section order.

Reference evidence: layout from `photo_2026-10-19_18-39-29.jpg`; palette from `photo_2026-10-19_18-39-44.jpg`, both in the user's Telegram Desktop downloads. Review captures are `.cache/home-preview/{1440,768,390,320}.png`.

## Elevation & Depth

Page sections and cards are flat. Depth comes from illustrated trees, dark overlays, and alternating tonal planes. The preserved entry chooser is the exception: it floats above a blurred scrim with a structural shadow (`0 32px 95px rgb(2 46 36 / .27)`).

Motion remains modest: button state changes take 180ms, card-image hover takes 400ms, and the hero enters over 700ms with small vertical movement. Reduced-motion preferences disable animation and transitions.

## Shapes

Pills define start controls and offer labels. Broadly rounded cards contain clipped landscapes; desktop offer and step corners use the card radius. The header rounds only its lower corners (26px, reducing to 18px on mobile). Team portraits use 22px corners on desktop and 14px on mobile. The thin oversized diagonal arrow is a navigation cue.

## Components

### Buttons

Quiet, rounded, and legible. Primary controls use Moss on pale sections; inverse controls use Forest Paper on forest sections. The outlined “Подробнее” hero link retains a paper-colored border. Hover changes fill, keyboard focus uses a 3px Eucalyptus outline offset by 5px, and pressing scales controls to 0.97. Mobile header controls have at least 44px height; the compact desktop header start control is currently 40px.

### Cards / Containers

Offers use Forest Ink and Business Green, with a thin outlined audience label, sans-serif heading, short explanation, clipped forest strip, and a full-width text action ending in a circular arrow. The personal card uses the existing hero scene; the company card uses the waterfall from the scenarios scene. Steps are pale numbered cards, without shadows or decorative borders.

### Navigation

The owl links to the top. Three anchor links use an underline for active or hover state. Mobile uses the existing labeled menu button and expanded menu. Start opens the existing personal/company chooser; offer actions open the corresponding authentication path. Preserve routing, focus restoration, Escape handling, and authentication contracts.

### Forest Imagery

Reuse `frontend/public/assets/forest2d/` and its mobile variants. Hero and how-to use the hero scene; the company offer uses the scenarios waterfall. Team portraits come from `frontend/src/assets/team/`, use each person’s name as alternative text, and fall back to the matching SVG if a photo cannot load.

## Do's and Don'ts

### Do:

- **Do** apply the five-colour palette throughout the product while preserving each page's layout and purpose.
- **Do** preserve the selected section sequence, owl, paired CTAs, team portraits, and footer.
- **Do** maintain normal-text contrast, visible focus, and reduced-motion behavior.
- **Do** check the landing at 1440, 768, 390, and 320px widths after visual changes.

### Don't:

- **Don't** introduce interface colours outside the five forest primitives. Use semantic roles and palette-derived transparency for depth.
- **Don't** replace the team portraits with decorative forest crops.
- **Don't** lighten the business card without rechecking its paper-text contrast.
- **Don't** collapse the mobile how-to heading into a joined word when removing its desktop break.
