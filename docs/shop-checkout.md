# Facebook Shop checkout

Final URL after production verification: `https://durafencemetal.com/shop-checkout/`.
Shop ID: `4185367294932155`. The owner enters this URL in Commerce Manager →
Shop settings → Checkout URL, then tests an actual redirect from Facebook.

This checkout sends an **estimated invoice PDF**, without an online payment link.
The route name is retained for existing Facebook links. Its business purpose is
catalog selection and estimate requests. A purchase requires contacting sales;
installation requires an on-site estimate, and payments are made in person using
the business's existing arrangements, including the physical Square terminal.
Selecting products is not an online cart or checkout conversion.
Catalog pixel events and Commerce Manager report diagnosis:
[Facebook commerce events](facebook-commerce-events.md).
The business confirms measurements and arranges payment. Orders can contain all
four fence products as separate lines, plus additional gates, or gates only.
Each fence package includes one 12 ft gate and a Ring doorbell.

## Parameters and pricing

Meta's `products` parameter accepts comma-separated `SKU:quantity` pairs, e.g.
`?products=premium-materials:5,gate-3ft-extra:1&coupon=DURA10`. Fence quantity is
linear feet; gate quantity is units. This example imports 5 ft at $25/ft plus one
$250 gate: subtotal $375, or $337.50 after `DURA10` in cash.

`products` takes precedence over `item`. Repeated entries for the same product
are summed, including retailer/Meta ID aliases. Decimal fence lengths use up to
two decimal places. Gates must be whole units; existing quantity limits apply.
Gates-only carts populate all three quantities without adding a fence package.
Every different fence package is imported in Meta's cart order with its own
linear feet and unit price; all gates are preserved. The customer can add, edit
or remove additional fence packages. Repeated entries of the same product are
summed, and unknown/invalid entries show a recovery notice and the manual selector.

The legacy `item` accepts any of the seven retailer IDs supplied for the catalog, or the
corresponding Meta product ID. Missing/unknown values leave the seven-product
selector available. `coupon` or `coupon_code` prefills the discount field; `coupon`
takes precedence. Unsupported codes show a correctable validation error.
Other parameters do not change quantities or prices.

Pricing uses the existing estimate helpers: Premium $40/ft installed or $25/ft
materials; Standard $35/ft installed or $20/ft materials; extra gates 12/6/3 ft
cost $1,000/$500/$250 each. Discount applies first, card adds the existing 7% rule,
and the deposit is 25% of the resulting total. Cash is the default. `ABE<n>` and
`DURA<n>` follow the current estimator rules; these are pattern-based codes, not
a validated promotion database. All displayed amounts remain estimates.

The checkout does not change `/estimate/`, its PDF or its email recipients.

## API and configuration

`POST /api/shop-checkout` accepts JSON:

```json
{
  "customer": {
    "name": "Customer", "email": "customer@example.com", "phone": "2295550100",
    "street": "14 Oak Street", "city": "Valdosta", "state": "GA", "zip": "31601"
  },
  "order": {
    "fenceSku": "premium-installed", "lengthFt": 100,
    "additionalFences": [{ "sku": "standard-installed", "lengthFt": 50 }],
    "gates": { "ft12": 0, "ft6": 1, "ft3": 0 },
    "payByCard": false, "discountCode": ""
  },
  "df_leave_blank": ""
}
```

Use an empty `fenceSku`, zero `lengthFt` and empty `additionalFences` for gates-only
orders. `additionalFences` is optional for compatibility with older clients and
supports up to three additional distinct fence products, for four total. Each
entry requires a catalog fence SKU and 0.01–5,000 linear feet with up to two decimal
places. Duplicate fence SKUs are rejected by the API; imports combine duplicates
before submission. The server recalculates every line and the combined total.
Success returns `ok`, `message` and an order `reference`.
Validation failures return HTTP 400 with `fields`. Missing email configuration
returns 503, throttling 429, and provider failures 502/503. Email acceptance is
not proof of delivery to the recipient's inbox.

Runtime secret: `RESEND_API_KEY` (legacy `RESENT_API_KEY` also supported).
Sender: `Dura Fence Metal <invoice@durafencemetal.com>`; reply-to:
`info@durafencemetal.com`; customer is `to`, business is `bcc`. The verified Resend
domain and receiving/forwarding rule for `info@durafencemetal.com` must work.
Secrets stay in Cloudflare runtime settings, never public build variables.

The honeypot silently discards spam. The 20 KB request limit is enforced while
reading the body. The per-IP limit is 30 submissions per hour using the existing
Cache API pattern; it is best-effort, per data center, and not an atomic global
limit. No order database or payment provider is added.

## Verification and publication

1. Run `npm test` and `npm run build`; tests simulate Resend and do not send mail.
2. Test the real Meta `products` example, gates-only carts, coupons, duplicates,
   malformed quantities and multiple fence packages. Also test all seven legacy
   `item` values, no parameter, an unknown item, discount codes,
   quantities, card/cash, errors, and a mobile viewport.
3. Deploy the reviewed build using `npx wrangler deploy`. Do not include unrelated
   local changes in the publication without review. Production HTTPS must be active.
4. With an authorized test recipient, submit a test order and verify the PDF in
   the recipient inbox, Resend delivery logs and `info@durafencemetal.com`.
5. The owner enters the final URL in Commerce Manager and tests the real redirect.
   Device emulation cannot verify Facebook's in-app browser or Meta approval.

Worker logs are enabled. Find `shop_checkout_arrival` for the **complete raw query
string**, including unknown parameters and repeated values. Use the first actual
Meta redirects to refine parameter mapping if needed. These diagnostics may
contain tracking identifiers; do not copy them to public tickets or analytics.
Find `shop_checkout_email_sent` by reference and Resend message ID, or
`shop_checkout_email_failed` / `shop_checkout_pdf_failed` for failures.

## Production verification — September 30, 2026

Published URL: **https://durafencemetal.com/shop-checkout/**.
Worker version: `1f4b49f1-c984-4627-8f99-fc9c4c23e943`. Publication included all
existing local changes, as requested by the owner. Previous active version:
`06ef0c37-63d5-4679-8b11-e1eb5d1f71f5`.

- 57 unit/integration tests passed, including the existing estimator checks.
- Astro build, strict TypeScript checks for the checkout and Worker dry run passed.
- Chromium verified seven retailer IDs and seven Meta IDs, fallback, coupons,
  card/cash totals, field errors, retained form data after failure, and mocked
  success without duplicate submission. Widths 320/390/768/1440 had no horizontal
  overflow or JavaScript errors. Facebook's in-app browser still needs an actual
  shop redirect test by the owner.
- Production checkout and `/estimate/` returned their expected compiled HTML.
- The authorized real test was sent to `info@durafencemetal.com` and found in its
  forwarded Gmail inbox, with the PDF attached. The PDF's extracted text confirmed
  100 ft Premium Installed + one extra 6 ft gate = $4,500, deposit $1,125, and the
  final-measurement disclaimer. Test reference:
  `DFM-15a1d893-dfdb-4a8b-8cc6-4680f78a8bac`.
- Since the selected test customer was the business address itself, this used one
  recipient. Separate customer plus business BCC delivery is covered by simulated
  provider integration tests.

If this release must be reverted, run:
`npx wrangler rollback 06ef0c37-63d5-4679-8b11-e1eb5d1f71f5`, then verify the
homepage and `/estimate/`. That reverts the entire publication, including the
other local changes the owner opted to publish. There are no database migrations.

Remaining owner action: enter the published checkout URL in Commerce Manager and
test the real Meta redirect. Meta shop visibility/approval is managed separately.

## Meta cart correction — September 30, 2026

The owner confirmed Meta redirects with `products=SKU:quantity,...`; the original
`item`-only initialization was insufficient. This was reproduced in Chromium on
production (the product selector was empty for the exact supplied cart), then fixed.

Published Worker version: `2b655837-286a-45c2-b03f-520e9f23e9f2`.
61 tests, strict checkout TypeScript checks, build and Worker dry run passed.
Chromium on production confirmed the exact sample subtotal ($375), `coupon=DURA10`
($337.50), precedence over `item`, gates-only carts, repeated products, decimal
feet, Meta ID aliases, visible manual recovery and legacy `item` behavior.
Only the checkout HTML and JavaScript assets changed; `/estimate/` was verified
byte-for-byte unchanged. These verification visits sent no additional emails.

The checkout URL remains the same. The owner can now retest the Meta checkout
assistant and confirm that its actual selected products and quantities appear
before saving the configuration.

## Multiple fence packages — September 30, 2026

At the owner's request, a valid Meta cart with multiple fence packages now loads
the first package in URL order, its full quantity and all extra gates. The visible
notice explains that only one fence package is accepted and the other packages
were not added. Coupons and the existing pricing rules remain unchanged.

Published version: `0aab5e9c-fee4-4f92-85ad-4991affbaf7a`. All 62 tests, strict
checkout TypeScript checks and the build passed. Production Chromium verified
Standard-first and Premium-first carts, first-package quantities, preserved gates,
coupon totals and the visible warning, along with the earlier import cases.
Only checkout HTML and JavaScript assets were uploaded. No test emails were sent.

## Separate fence invoice lines — October 1, 2026

This release supersedes the first-package-only behavior above. Meta's checkout
test reported an incorrect product count when more than one fence package was
provided. All imported fence products now appear as separate editable invoice
lines, each with its own linear feet and catalog price. Extra gates remain
separate lines, and discounts apply to the combined subtotal. Customers can also
add or remove fence lines manually. Repeated occurrences of the same SKU are
combined; all four distinct fence products and all three gates are supported.

Published version: `8ae1ac67-f1fd-4f94-9a59-6326377ee3bd`. The URL remains
**https://durafencemetal.com/shop-checkout/**.

- All 64 tests, strict checkout TypeScript checks, the production build and Worker
  dry run passed.
- Chromium verified multiple fence imports, editable quantities, add/remove
  controls, coupons, submitted payloads and all seven products together on the
  published site. Widths 320/390/1440 had no horizontal overflow or JavaScript
  errors. Single-fence and legacy `item` imports still worked.
- PDF extraction confirmed all seven product lines and the $3,740 total for two
  of each product. The production `/estimate/` HTML was byte-for-byte unchanged.
- The authorized real test reached `info@durafencemetal.com`, confirmed in its
  forwarded Gmail inbox with the PDF attached. Extracted PDF text confirmed
  Premium Installed 100 ft ($4,000), Standard Installed 50 ft ($1,750) and one
  extra 6 ft gate ($500): total $6,250 and deposit $1,562.50. Test reference:
  `DFM-e1f45438-8670-459f-aabb-0a29458d7803`.

The owner has already saved the URL in Meta. The next step is to rerun Meta's
automatic checkout test; local and production browser checks do not establish
that Meta's test or shop review has passed. Rolling back to
`0aab5e9c-fee4-4f92-85ad-4991affbaf7a` restores the previous single-fence behavior
and therefore restores the reported Meta product-count issue.
