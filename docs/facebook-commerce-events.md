# Facebook catalog: product views and estimate leads

Report: `issue_report_catalog1645369443875918_pixel1991001054903517.csv`.
Catalog: `1645369443875918`. Pixel: `1991001054903517`.
The report lists zero received `VIEW_CONTENT`, `ADD_TO_CART` and `PURCHASE` events.

The website previously sent only `PageView` and `Lead`. Its Facebook checkout
did not send any product events or a lead after sending the estimated invoice.
Chromium reproduced the missing `ViewContent` using an imported Meta cart before
the fix. The report does not establish a broken domain connection or permissions.

The owner clarified that the website is a catalog and estimate tool. A customer
must contact sales to purchase; installation requires an on-site estimate.
Payment is made in person, including the existing physical Square terminal.
There is no online sales cart, accepted purchase or online payment in this flow.

## Website correction

| Event | Trigger | Data |
| --- | --- | --- |
| `ViewContent` | An identified product appears in the imported cart or is selected manually; once per product per page visit. | Retailer SKU, one unit, catalog unit price, USD. |
| `Lead` | The checkout API confirms successful email acceptance with an order reference. | All lines and the estimated total in USD; no customer fields. |

Imported Facebook selections prefill an estimate. They do not generate
`AddToCart`, `InitiateCheckout` or `Purchase`. Editing quantities, contact fields,
payment preferences or discounts does not generate sales events or a successful
lead. Failed submissions and honeypot responses generate no lead. Existing
quote/estimate leads retain their behavior. The event bridge only allows
`ViewContent` and `Lead` from this form.

The public page calls this an estimate request, explains the sales contact,
on-site installation estimate and in-person payment, and labels the calculated
25% deposit as estimated rather than due immediately. Prices and PDF calculation
rules remain the same. `/shop-checkout/` and the API route remain compatible with
existing Facebook links; the route name does not determine the event semantics.

`content_ids` and `contents[].id` use the seven existing retailer SKUs from
`checkoutCatalog`: `premium-installed`, `premium-materials`, `standard-installed`,
`standard-materials`, `gate-12ft-extra`, `gate-6ft-extra`, `gate-3ft-extra`.
Incoming numeric Meta product object IDs resolve to those SKUs. Do not replace
these strings with the catalog ID, pixel ID or Facebook product object ID.
Check that Commerce Manager's **Content ID / retailer ID** for each item matches
the corresponding SKU. The catalog itself was not inspected with account access.

The existing pixel build setting `PUBLIC_META_PIXEL_ID` still applies; an empty
value disables it. Events route to that configured pixel with `trackSingle`.
No customer name, email, phone, address, coupon string or raw URL parameters are
included in the added event payloads. Meta's library and account settings control
any additional automatic collection. The privacy page documents product data.

## Why the sales-event warnings may remain

The form sends an estimated invoice, not an accepted sales order or a payment
confirmation. Consequently it must not report `Purchase` when an email is sent,
or treat estimate selections as `AddToCart` / `InitiateCheckout`. The report's
missing `ADD_TO_CART` and `PURCHASE` can remain for this business flow; inventing
those events would misrepresent customer actions. The physical Square terminal
does not automatically provide browser purchase confirmations to this website.

Use confirmed estimate requests (`Lead`) as the website conversion measure.
Review the account's campaign objective and enabled shop/checkout features
against this business flow. If Meta requires a completed online purchase for a
selected commerce feature, this estimate form does not fulfill that requirement.
This is an account/product configuration question, not a missing sales event to
simulate in code. No Meta account settings were changed or audited here.

Meta's own [commerce event implementation](https://github.com/facebook/facebook-for-woocommerce/blob/main/facebook-commerce-events-tracker.php)
uses retailer IDs for product events and separate order and successful-form hooks
for purchase and lead events. The [Meta Pixel reference](https://developers.facebook.com/docs/meta-pixel/reference/)
and [Pixel Helper](https://developers.facebook.com/docs/meta-pixel/support/pixel-helper/)
are the direct documentation links; their pages returned HTTP 429 during this review.

## Validation after publication

1. Publish the corrected build. Local tests do not update the public site.
2. In Commerce Manager verify that catalog `1645369443875918` uses pixel
   `1991001054903517`, and check the retailer IDs above.
3. In Events Manager → Test Events open
   `https://durafencemetal.com/shop-checkout/?products=premium-materials:5,gate-3ft-extra:1&coupon=DURA10`.
   Expect `PageView` and product `ViewContent`, with no checkout or purchase events.
   The displayed estimated total is **337.50 USD**.
4. Increase the extra 3 ft gate quantity from 1 to 2 and leave the field.
   Expect an updated estimate without `AddToCart` or `InitiateCheckout`.
5. With an authorized recipient, submit a valid request. Expect one `Lead`
   after server confirmation, with the selected SKUs, quantities and estimated
   value in USD. No `Purchase` is sent. Failed requests should send no lead.
6. Confirm receipt and item matching in Meta; browser mocks verify website code,
   not Meta ingestion, account permissions or approval. Ad blockers can block Meta.

Regression checks: `npm test`, `npm run build`, and an isolated Chromium run of
the compiled checkout with Meta and email delivery mocked. The original browser
repro failed before the change and passed after it. Tests also verify that estimate
edits generate no cart, checkout or purchase events. No test emails or real events
were sent. Code is corrected locally; publication and account-side receipt remain
separate steps.
