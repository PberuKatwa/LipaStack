# Paystack Documentation Resources

Authoritative list of Paystack developer documentation links, verified against https://paystack.com/docs and https://paystack.com/docs/api.

Base URL for all API calls: `https://api.paystack.co` (same URL for test and live; your API key determines the environment).

---

## 1. Most relevant to LipaStack (M-Pesa STK push)

| Resource | URL | What it covers |
| --- | --- | --- |
| Payment Channels — Mobile Money | https://paystack.com/docs/payments/payment-channels/#mobile-money | How the mobile money channel works: `POST /charge` with a `mobile_money` object, provider codes (`mpesa`, `mpesa_offline`, `mptill`, `mtn`, `atl`, `vod`, `orange`, `wave`), the `pay_offline` status, the 180-second customer authorization window, and M-PESA-specific flows (STK push, offline Paybill, Till). |
| Charge API — Create Charge | https://paystack.com/docs/api/charge/#create | Full request/response reference for `POST /charge` — the endpoint used to initiate an M-Pesa STK push. |
| Charge API — Check Pending Charge | https://paystack.com/docs/api/charge/#check | `GET /charge/:reference` — poll the status of a pending (offline) charge. |
| Verify Transaction | https://paystack.com/docs/api/transaction/#verify | `GET /transaction/verify/:reference` — the fallback for confirming final transaction status when webhooks are slow or missed. |
| Webhooks | https://paystack.com/docs/payments/webhooks/ | Setting up a webhook URL, acknowledging events with `200 OK`, retry policies (test: hourly for 10 hrs; live: 3 min ×4 then hourly for 72 hrs), `x-paystack-signature` HMAC-SHA512 validation, Paystack sender IPs (52.31.139.75, 52.49.173.169, 52.214.14.220), and the full event catalog (`charge.success`, etc.). |
| Test Payments — Mobile Money | https://paystack.com/docs/payments/test-payments/#mobile-money | Test credentials per channel, including the M-Pesa test number `+254 710 000 000` (no PIN/OTP) and test cards/accounts for other channels. |
| API Authentication | https://paystack.com/docs/api/authentication/ | How to authenticate with secret/public keys, `Authorization: Bearer YOUR_SECRET_KEY` header, test vs live keys. |
| Verify Payments (guide) | https://paystack.com/docs/payments/verify-payments/ | Conceptual guide on verifying transactions server-side before delivering value. |
| Gateway Responses | https://paystack.com/docs/payments/gateway-responses/ | Meaning of `gateway_response` values returned on transactions (e.g. "Approved", decline reasons). |
| Metadata | https://paystack.com/docs/payments/metadata/ | How to attach custom `metadata` (e.g. `order_id`) to transactions and retrieve it later. |

---

## 2. API basics

| Resource | URL | What it covers |
| --- | --- | --- |
| API Introduction | https://paystack.com/docs/api/ | REST/JSON conventions, base URL, environments, `status`/`message`/`data` response envelope, the `meta` object, supported currencies (KES, NGN, GHS, ZAR, USD, XOF) and amount subunits. |
| Authentication | https://paystack.com/docs/api/authentication/ | API keys, bearer auth, key management. |
| Rate Limits | https://paystack.com/docs/api/rate-limits/ | Request throttling limits and how to handle them. |
| Pagination | https://paystack.com/docs/api/pagination/ | Cursor vs offset pagination on list endpoints. |
| Errors | https://paystack.com/docs/api/errors/ | Error response format and the diagnostic `meta` object. |

---

## 3. Payments (guides)

| Resource | URL | What it covers |
| --- | --- | --- |
| Payments Overview | https://paystack.com/docs/payments/ | Entry point for collecting payments. |
| Accept Payments | https://paystack.com/docs/payments/accept-payments/ | Popup, redirect, and server-side (Charge API) integration options. |
| Payment Channels | https://paystack.com/docs/payments/payment-channels/ | All channels: cards, bank, Pay with Transfer, USSD, mobile money, EFT, Pesalink, QR, Capitec Pay. |
| Direct Debit | https://paystack.com/docs/payments/direct-debit/ | Recurring direct debits from bank accounts. |
| Recurring Charges | https://paystack.com/docs/payments/recurring-charges/ | Charging saved authorizations repeatedly. |
| Bulk Charge | https://paystack.com/docs/payments/bulk-charge/ | Charging many customers in one batch. |
| Subscriptions | https://paystack.com/docs/payments/subscriptions/ | Plans + subscriptions for recurring billing. |
| Split Payments | https://paystack.com/docs/payments/split-payments/ | Splitting settlements across subaccounts. |
| Multi-split Payments | https://paystack.com/docs/payments/multi-split-payments/ | Advanced multi-party splits. |
| Dedicated Virtual Accounts | https://paystack.com/docs/payments/dedicated-virtual-accounts/ | Persistent virtual account numbers per customer. |
| Apple Pay | https://paystack.com/docs/payments/apple-pay/ | Apple Pay acceptance and domain registration. |
| Partial Debits | https://paystack.com/docs/payments/partial-debits/ | Recovering partial amounts from a customer's balance. |
| Card Preauthorization | https://paystack.com/docs/payments/card-preauthorization/ | Hold-and-capture card flows. |
| Manage Disputes | https://paystack.com/docs/payments/manage-disputes/ | Handling chargebacks and evidence. |
| Refunds | https://paystack.com/docs/payments/refunds/ | Refunding transactions. |
| Test Payments | https://paystack.com/docs/payments/test-payments/ | All test credentials: cards, EFT, bank accounts, mobile money, DVA demo bank. |

---

## 4. API reference — endpoint groups

| Resource | URL | What it covers |
| --- | --- | --- |
| Transactions | https://paystack.com/docs/api/transaction/ | Initialize, verify, list, fetch transactions; charge authorization; timeline; totals; export; partial debit. |
| Charge | https://paystack.com/docs/api/charge/ | Create charge; submit PIN/OTP/phone/birthday/address; check pending charge. |
| Transaction Splits | https://paystack.com/docs/api/split/ | CRUD for split configurations and subaccount assignment. |
| Customers | https://paystack.com/docs/api/customer/ | Customer CRUD, validation, whitelist/blacklist, authorizations, direct debit mandates. |
| Dedicated Virtual Accounts | https://paystack.com/docs/api/dedicated-virtual-account/ | Create/assign/list/fetch/requery/deactivate DVAs; bank providers. |
| Preauthorization | https://paystack.com/docs/api/preauthorization/ | Initialize, capture, reserve, verify, release, list preauthorizations. |
| Apple Pay | https://paystack.com/docs/api/apple-pay/ | Register/list/unregister Apple Pay domains. |
| Capitec Pay | https://paystack.com/docs/api/capitec-pay/ | Requery Capitec Pay transactions. |
| Subaccounts | https://paystack.com/docs/api/subaccount/ | Subaccount CRUD for marketplaces/splits. |
| Plans | https://paystack.com/docs/api/plan/ | Subscription plan CRUD. |
| Subscriptions | https://paystack.com/docs/api/subscription/ | Create/enable/disable subscriptions, manage links. |
| Products | https://paystack.com/docs/api/product/ | Product CRUD (for payment pages/storefronts). |
| Storefronts | https://paystack.com/docs/api/storefront/ | Storefront CRUD, orders, products, publishing. |
| Orders | https://paystack.com/docs/api/order/ | Order CRUD and validation. |
| Payment Pages | https://paystack.com/docs/api/page/ | Hosted payment page CRUD and slug checks. |
| Payment Requests | https://paystack.com/docs/api/payment-request/ | Invoice-like payment requests: create, verify, notify, finalize, archive. |
| Settlements | https://paystack.com/docs/api/settlement/ | List settlements and their transactions. |
| Transfer Recipients | https://paystack.com/docs/api/transfer-recipient/ | Create/list/fetch/update/delete payout recipients. |
| Transfers | https://paystack.com/docs/api/transfer/ | Initiate, finalize, bulk transfers; list, fetch, verify. |
| Transfers Control | https://paystack.com/docs/api/transfer-control/ | Balance check, balance ledger, transfer OTP management. |
| Bulk Charges | https://paystack.com/docs/api/bulk-charge/ | Initiate and manage bulk charge batches. |
| Integration | https://paystack.com/docs/api/integration/ | Payment session timeout settings. |
| Disputes | https://paystack.com/docs/api/dispute/ | List/fetch/update disputes, evidence, upload URLs, resolve, export. |
| Refunds | https://paystack.com/docs/api/refund/ | Create, retry, list, fetch refunds. |
| Verification | https://paystack.com/docs/api/verification/ | Resolve account numbers, validate accounts, resolve card BINs. |
| Miscellaneous | https://paystack.com/docs/api/miscellaneous/ | List banks, list/search countries, list states (AVS). |
| Terminal | https://paystack.com/docs/api/terminal/ | Send events to POS terminals, fetch status, commission/decommission. |
| Virtual Terminal | https://paystack.com/docs/api/virtual-terminal/ | Virtual terminal CRUD, destinations, split codes. |

---

## 5. Other product areas

| Resource | URL | What it covers |
| --- | --- | --- |
| Transfers (guide) | https://paystack.com/docs/transfers/ | Sending money to bank accounts and mobile money numbers. |
| Identity Verification (guide) | https://paystack.com/docs/identity-verification/ | Verifying account numbers, card BINs, and customer identities. |
| Terminal (guide) | https://paystack.com/docs/terminal/ | In-person POS payments, invoice payments, push payment requests. |

---

## 6. Developer tools & SDKs

| Resource | URL | What it covers |
| --- | --- | --- |
| Developer Tools Overview | https://paystack.com/docs/developer-tools/ | Index of libraries and no-API integration options. |
| InlineJS | https://paystack.com/docs/developer-tools/inlinejs/ | Drop-in JS checkout for web. |
| Android SDK | https://paystack.com/docs/developer-tools/android-sdk/ | Native Android checkout. |
| iOS SDK | https://paystack.com/docs/developer-tools/ios-sdk/ | Native iOS checkout. |
| Flutter SDK | https://paystack.com/docs/developer-tools/flutter-sdk/ | Flutter checkout. |
| MCP Server | https://paystack.com/docs/developer-tools/mcp-server/ | Paystack's Model Context Protocol server for AI-assisted integration. |
| Paystack Dev CLI (npm) | https://www.npmjs.com/package/@paystack-oss/dev-cli | CLI for local development, including webhook tunneling/forwarding. |
| Framework Guides | https://paystack.com/docs/guides/ | Vue, React, Android, Flutter, React Native, mobile WebView, and SDK migration guides. |

---

## 7. Accounts, tooling & community

| Resource | URL | What it covers |
| --- | --- | --- |
| Paystack Dashboard | https://dashboard.paystack.com/ | Account management; toggle between test and live modes. |
| Dashboard — Developer/Webhook Settings | https://dashboard.paystack.com/#/settings/developer | Where the webhook URL is registered (set separately in test and live modes). |
| Sign up | https://dashboard.paystack.co/#/signup | Create a free account to get test API keys. |
| Paystack Postman Collection | https://www.postman.com/paystack-developers/workspace/paystack-api/overview | Runnable Postman workspace for the whole API. |
| PaystackOSS GitHub (demos) | https://github.com/PaystackOSS/ | Official sample apps (gift store, movie tickets, logistics, restaurant) showing real integrations. |
| API Changelog | https://paystack.com/docs/changelog/api/ | Breaking changes and additions to the API. |
| Payslack Community | https://join.slack.com/t/payslack/shared_invite/zt-338biukg0-B1KJaBqvEtKWLp7yOUL6sA | Official Slack community for developer Q&A. |
| Support | https://support.paystack.com | Help center and support tickets. |
