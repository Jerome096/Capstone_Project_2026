# Staff session approval timers

Sessions now shows a separate Session timer for each visit/table. Active sessions count down from the same server-side ten-minute inactivity deadline used by guest ordering and the expiry worker. Customer interaction resets the existing deadline; staff polling never resets it.

Paid orders that are still outstanding show Paused with a waiting-to-be-served explanation. After all paid orders are served, the existing rule starts a fresh ten minutes. Pending requests show Not started; closed/rejected/cancelled visits show an ended indicator in history. The timer does not change closure permissions or cancel paid orders.

The sessions API reads the common dining timing query and returns idle_paused and idle_remaining_seconds alongside the existing table/name/status fields. Visit-token hashes remain private. The browser anchors each response to its monotonic clock, updates text once per second and resynchronizes through existing five-second polling. Near-expiry timers use amber/red; zero shows Checking session expiry until the server confirms closure. Data older than fifteen seconds shows Syncing instead of a stale countdown, and returning to a visible tab requests a fresh status.

Desktop keeps the six-column table. Narrow screens use session cards with labelled table, status, requested time, timer and actions. Countdown ticks update only their own text, preserving button focus. Sample UI uses mock customers and does not create visits or transactions.

No SQL migration or data reset is required; the existing inactivity schema remains unchanged. Validation includes tests/staff-session-timers.php (rollback-only database cases), tests/staff-session-timers.cjs (countdown states), the existing session inactivity suite, and actual browser checks at 390, 768, 1024 and 1440 pixels.
