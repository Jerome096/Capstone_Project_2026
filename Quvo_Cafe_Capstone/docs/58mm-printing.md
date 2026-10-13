# MP211 receipt printing

The staff workspace formats payment receipts and preparation tickets for 58 mm
paper with 48 mm of content and 5 mm side margins. Print documents contain only
black text and rules, with wrapping for customer names, items and instructions.
Drinks and food still start on separate pages; long orders can continue on more
pages. Printing does not change payment or order status.

Use **Print 58 mm receipt** in Receipts, or **Print tickets** after approving payment.
In the system print dialog, select the MP211/58 mm roll, actual size (100%), no
headers/footers, and no additional margins. The PDF fallback page is 58 × 200 mm;
the printer service's roll setting determines physical feed length.

Android 14 needs a print service or printer integration that supports this USB/
Bluetooth printer. Bluetooth pairing alone does not guarantee the printer will
appear in Chrome. This change formats output and opens the system print dialog;
it does not install a printer service or send Bluetooth commands.

Verify a short ticket on the actual printer before using it for operations. If
the MP211 does not appear in the dialog, configure its compatible print service
first. Physical feed length and connectivity still need device testing.
