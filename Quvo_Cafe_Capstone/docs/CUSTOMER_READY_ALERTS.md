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
automatic ready event or cashier reminder. Session end clears visible/queued notices. Storage failures do not
block checkout or in-page deduplication.

## Cashier reminders

Paid Ready orders from dine-in or online ordering have an **Alert customer again**
button on the staff order card. It sends another ready notice without changing
order status, order timestamps or payment details. Walk-in orders have no
customer ordering page and do not offer this button. Served orders cannot send
new reminders. The customer page must be open; sound and vibration honor the
customer's mute preference and browser/device capabilities.

The staff orders POST action `remind_ready` requires the existing authenticated
staff/admin session, CSRF check, an order ID and a UUID `request_key`. An order
transaction lock serializes reminders and status changes. Retrying the same key
returns the saved result, including after serving. Distinct requests have a
15-second cooldown, shown on the button. Existing `system_audit_log` rows record
the staff actor and retry key, so no SQL migration is needed. Status history is
not used to fabricate status changes.

Order APIs expose only the latest reminder version, timestamp and cooldown,
through existing customer ownership checks. Customers remember the version per
order/account or visit. A higher version can ring again even after the original
ready alert was dismissed; the same or older version cannot ring again. Version
IDs are compared as decimal strings to preserve bigint precision. Old ready
history remains silent on initial load.

The alert module and stylesheet are identical in both customer app shared folders.
The module uses four repeating three-note Web Audio chimes over 7.2 seconds and
`navigator.vibrate` where supported. Triangle waves with a 0.9 peak gain make the
sound brighter and louder than the previous 0.57-second sine chime at 0.12 gain.
Short attack/release envelopes avoid abrupt note boundaries. Notes do not overlap;
a new ready alert, reminder or test replaces the previous sequence rather than
adding volume. Mute, Dismiss, View order, a served order and account/session reset
cancel remaining scheduled notes. Test alert also plays without a ready notice.
If a playing alert is interrupted by hiding the page, its sound remains pending
for return while the order remains in the notice. Device media volume and browser
audio permissions still determine actual speaker output.

Audio is generated inside the browser;
there are no external audio downloads or third-party notification services.
No SQL schema or order status changes are required.

Run `node tests/order-ready-alerts.cjs` from the staff application folder for
notification state, storage, mute, visibility and fallback checks without SQL.
Run `C:\php85\php.exe tests/customer-ready-reminders.php` for rollback-only SQL
checks of reminders, authorization, cooldown, retries and customer isolation.
The isolated browser preview additionally checks the full customer apps at phone,
tablet and desktop widths with actual Web Audio. Vibration API requests are
instrumented there; use Test alert on physical devices to check their hardware.

Browser references: [autoplay and user interaction](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay),
[vibration support and activation](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate),
and [background page restrictions](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API).
