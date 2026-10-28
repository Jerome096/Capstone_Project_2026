# Staff tickets and Android Bluetooth printing

Use the application's Print buttons to open the system print dialog directly in the same tab. The app does not create a PDF, open a new tab or start a download. Print both tickets prints a drinks page and a kitchen page. Print drinks and Print kitchen submit one department only. Single-department orders print only their own ticket. Copies: 1 is correct for one of each ticket in a mixed two-page job.

The order screen stays in place while the system print popup opens. The printable ticket copy is hidden outside print media, so it never appears as a separate screen. Printing or cancelling returns to the same order popup automatically; no browser Back step is required. The original order and unsaved fields remain intact.

The MP211 label specifies 58 mm paper. The layout uses a conservative 48 mm content width. Select 58 mm paper, actual size/100%, and disable browser headers/footers in the selected print service. Save as PDF creates a file rather than sending output to the printer. Selecting Letter paper does not configure a 58 mm thermal printer.

## Android setup

1. Charge and power on the MP211, load its paper and pair it in Android Bluetooth settings.
2. Install a print service compatible with this printer. One option for supported Bluetooth receipt printers is [RawBT on Google Play](https://play.google.com/store/apps/details?id=ru.a402d.rawbtprinter). Use the printer supplier's recommended Android service if available. Compatibility with this particular physical MP211 has not been verified from this development machine.
3. Open that service, select Bluetooth and the paired printer, choose the 58 mm paper setting, and complete its test print first. Accept the device/nearby-device permission prompts needed by that service.
4. In Android Settings, search for Printing and enable the installed print service. Menu names vary by tablet. [Android printing guidance](https://support.google.com/pixelphone/answer/3473588).
5. Return to the cafe system and tap Print drinks, Print kitchen or Print both tickets. In the Android print destination selector, replace Save as PDF with the installed service/printer. Keep both pages selected when printing both departments. After printing or cancelling, the same order screen is available automatically.

Bluetooth pairing alone does not register an Android print destination. If the service cannot produce its own test print, check its printer/protocol configuration with the supplier before testing the website again. A website update cannot install a tablet print service. Desktop printer settings remain independent of the tablet.

## Implementation and validation

Printing uses the main window with a hidden ticket clone. Print-media styles hide the workspace and native dialogs only in the print output and show the clean ticket clone. The regular screen is never replaced, hidden or wrapped, and dialogs are never closed/reopened for printing. Department breaks are also applied inline. Printing does not alter browser history.

Mobile afterprint events retain the hidden print clone and stylesheet to protect against Android capturing its preview after an early event. The next pointer/key/click interaction or print job removes the old hidden clone. This does not change the normal screen. Desktop removes the clone on afterprint; print errors remove it immediately. The shared direct-print path also supports payment receipts. The PDF export route and its library remain removed from the workspace loader.

Validation used actual Chrome print rendering at 390, 768, 1024 and 1440 CSS pixels under Android and desktop browser identities. Checks cover native print invocation with no new tabs/downloads, no visible ticket-only screen, unchanged browser history, unchanged order/draft nodes, the early mobile afterprint event, two mixed-order pages, one department page, payment receipts, interaction cleanup, repeated printing and failed-print cleanup. PDF files generated only by the test harness verified page counts; the app itself does not export them. Physical Bluetooth printing has not been verified from the development machine; the tablet/service test print is still required.
