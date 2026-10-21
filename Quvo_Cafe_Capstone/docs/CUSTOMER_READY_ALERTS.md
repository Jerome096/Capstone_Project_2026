# Customer order ready alerts

Dine-in and online ordering show an order ready message when an observed order
changes to `ready`. The notice appears across customer screens and includes View
order and Dismiss. Online wording distinguishes pickup from delivery. Existing
ready/completed history does not produce alerts on first load. Multiple ready
orders share one sound while each remains available in the notice.

A customer tap on Place order enables sound and vibration before checkout waits
for the server. The tracking screen also has Enable sound & vibration, Mute
alerts, and Test alert controls. Muting is remembered for the tab. Visual messages
continue while muted. On reload, the browser may require another tap to unlock
sound; the customer can use Enable alerts. Browsers without vibration use sound
and the visual message; unsupported or blocked audio retains the visual fallback.

Alerts rely on the existing order polling, usually every five seconds. Customers
should keep the page open while waiting. Hidden/locked/closed pages cannot be
promised an immediate sound or vibration. Queued ready alerts are checked when
the page becomes visible, and orders already served are removed from the notice.
This feature does not register Web Push or send notifications after a tab closes.

Status and announced order IDs are stored per authenticated online account or
approved dine-in visit in session storage, never together with credentials.
Repeating a poll, selecting an order and reloading do not reannounce the same
ready order. Session end clears visible/queued notices. Storage failures do not
block checkout or in-page deduplication.

The alert module and stylesheet are identical in both customer app shared folders.
The module uses a short Web Audio chime and `navigator.vibrate` where supported;
there are no external audio downloads or third-party notification services.
No SQL schema or order status changes are required.

Run `node tests/order-ready-alerts.cjs` from the staff application folder for
notification state, storage, mute, visibility and fallback checks without SQL.
The isolated browser preview additionally checks the full customer apps at phone,
tablet and desktop widths with actual Web Audio. Vibration API requests are
instrumented there; use Test alert on physical devices to check their hardware.

Browser references: [autoplay and user interaction](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay),
[vibration support and activation](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate),
and [background page restrictions](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API).
