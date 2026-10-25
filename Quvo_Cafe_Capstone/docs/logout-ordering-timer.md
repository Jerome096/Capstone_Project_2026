# Ten-minute ordering pause after logout

The last active staff/admin logout starts a ten-minute grace period. Dine-in and
online ordering remain open during the grace period. A successful staff/admin
login, or an authenticated returning workspace heartbeat, cancels it before the
deadline. Logging out while another operations workspace remains connected does
not start the timer. Repeat logout requests do not extend an existing deadline.

When the deadline is reached, all public ordering-status reads and server-side
customer order submissions treat ordering as paused. This works with every
operations browser closed and does not need a scheduled job. A late login or
heartbeat cannot reopen ordering: use Start accepting orders after signing in.
Manual Pause and EOD continue to pause immediately. Browser closure or Wi-Fi loss
alone does not introduce a new automatic timer.

Existing orders, payment images, payments and receipts remain available. Pausing
does not cancel orders, reset dashboard history, run EOD or modify a saved
business date. Staff can finish existing orders; accepted submission retries can
recover their original order while new submissions are blocked.

The timer runs on the server without a sign-in banner or visible countdown. The
sign-in page does not poll ordering status. The read-only public status endpoint
remains compatible with earlier clients, without staff identities or control
revisions.

No schema change is needed. The existing `change_reason='offline'`, open flag and
`changed_at` persist the pending deadline. The effective open flag is computed
using SQL Server UTC time on every request. All writes use the existing ordering
transaction lock; customer submissions retain their shared lock through commit.
Login cancels only a future deadline, and logout saves the timer before ending
authentication. If saving logout fails, the authenticated session stays available
for a retry instead of claiming success without saving the timer.
