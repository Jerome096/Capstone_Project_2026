# Staff and admin café interface

The protected staff and admin screens use the same cream, café-green, muted sage,
gold, and serif heading styles as customer ordering. This includes the sidebar,
page header, forms, tables, action buttons, popups, staff login and payment QR
administration. Existing authentication, role checks, API paths, SQL data and
payment/preparation/cancellation operations remain authoritative.

Deploy the complete matching patch and refresh open staff/admin tabs. No SQL
migration is required. The update contains no private database or Gmail config.

## Reports

The new overview reads `reportsSql.data`, exactly the report already fetched by
the Reports module. It displays total revenue, paid orders, average paid order,
completed orders, revenue by time block and up to four top-selling items. It
does not calculate new accounting totals. The original full tables, date and
period controls, previous-period comparisons and payment breakdown remain below.
When loading or when a request fails, the overview clears its previous values
and chart. Empty reports display an empty state instead of a fabricated trend.
The chart is labeled in pesos and retains the full numeric tables for access.

## Orders

Received, Preparing and Ready are shown together as three columns. The former
stage tabs and adjacent Active sessions panel are removed. On phones, the same
three sections stack vertically on one page. Customer/order/table search filters
cards within each column without hiding its heading or empty state. Polling
retains the search. Existing order-card renderers and payment, preparation,
printing and cancellation handlers are reused. Session approvals and their
countdowns remain in the separate Sessions module.

## Responsive layout and printing

The existing accessible mobile drawer, focus management, stock popup scrolling
and keyboard handling are retained. Orders become a single column on phones;
wide administrative tables retain their scroll containers. The visual theme is
wrapped in `@media screen` so thermal receipt and preparation-ticket dimensions,
department page breaks and native print-popup behavior remain independent.

Validated with the real fragments, loader and module scripts against local mock
APIs at 390, 768, 1024 and 1600 pixels. Checks cover all allowed admin/staff
screens, navigation, report values and failure clearing, order filters/search,
payment popup opening, stock popup action visibility, login role selection, QR
administration and horizontal overflow. Existing preparation-ticket and session
timer checks and native print-page checks also pass. The browser fixtures do
not submit financial, inventory, account or session changes. Hardware printing
and the production deployment still require normal café-side verification.
