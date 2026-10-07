# Branding Notes

The Customer UI now follows the same Quvo Café visual identity established for the Cashier/Admin and Kitchen interfaces.

## Brand direction

- Primary shell: near-black
- Accent: Quvo gold
- Canvas: warm ivory
- Operational status colors remain semantic:
  - Green = completed/success
  - Amber = waiting/pending
  - Red = error/urgent

## Implementation approach

Styles are organized into shared and module stylesheets. `shared/css/brand.css` is loaded after the base and module styles and overrides only presentation. This reduces the risk of breaking the original customer ordering interactions while the redesign is being developed.

## Assets

- `assets/images/quvo-logo.jpg`
- `assets/images/quvo-cover.jpg`
- `assets/images/quvo-favicon.png`
