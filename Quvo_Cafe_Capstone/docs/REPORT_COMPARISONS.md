# Report color comparisons

The summary overview compares the selected business period with the immediately
preceding business day, calendar month, or calendar year. Each summary cell shows
the selected value, the previous value, and an amount/percentage change. Words and
arrows accompany colors, so meaning does not depend on color perception alone.

| Metric | Green | Red |
| --- | --- | --- |
| Revenue, orders placed, paid orders, average paid order, completed orders | Higher | Lower |
| Voided orders, unpaid orders, after-scheduled-closing orders | Lower | Higher |

Equal values are gray. No transactions in the previous period, an unavailable
comparison, and a future period that has not started also use gray with an
explanation. An after-close metric is neutral when the previous period used the
legacy midnight schedule, because that schedule has no comparable closing metric.
Manual item availability, ordering status, payments and saved report values do
not change when colors are applied.

For example, with previous-day revenue of PHP 10,000, PHP 12,000 is green with
"Higher by PHP 2,000 (+20%)"; PHP 8,000 is red with "Lower by PHP 2,000 (-20%)";
PHP 10,000 is gray with "No change". Voided orders falling from 4 to 2 are green.
Percent change is `(selected - previous) / previous * 100`, displayed to at most
one decimal place. Monetary differences use integer cents. A genuine zero-valued
metric in a prior period with recorded activity uses "from zero", without a
percentage. Very small nonzero percentages display `<0.1%`.

The existing report SQL definitions are shared by both periods in
`reports_summary`. Revenue remains approved payment amounts excluding change,
placed orders use creation times, completed orders use serving times, and voids
use cancellation times. Unpaid counts retain the existing definition of orders
created in the period that are currently unpaid. Previous comparisons therefore
reflect current order states, not a new historical snapshot.

Saved operating-hour rules determine both periods' bounds. For a 3 PM business
opening, after-midnight transactions remain with the previous opening date.
Month/year rollovers, leap days and future schedule transitions use the same
rules as selecting the previous period directly. Saved EOD records remain intact.
The existing admin-confirmation guard and serializable read transaction cover
both summaries. Previous-period queries fetch only the summary, not a second full
report. No SQL migration or data reset is required.

Current incomplete periods compare their totals so far with the full previous
period. This is explicitly labeled in the report. The colors are comparisons,
not a forecast or a claim that a partially completed day is a final result.

On phones the overview presents each metric as a readable card; tablets and
desktops retain the table. "How the colors work" explains the rules in the UI.

Validation: 31 comparison behavior checks, 20 rollback-only SQL comparison checks,
and 88 browser checks across 390/768/1024/1440 pixel widths. Existing report UI,
16 calendar checks, 36 SQL report checks, and 44 operating-hours checks also pass.
Browser images use mock data, not the cafe's actual sales.
