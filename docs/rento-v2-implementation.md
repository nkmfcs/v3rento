# Rento v2 — transactional foundation

This branch starts the v2 data model without replacing the existing application. The first migration is `db/rento-v2.sql` and creates an isolated `rento_v2` schema so it cannot silently mutate the current production tables.

## Important deployment notes

- Apply this migration only to a development/staging PostgreSQL database first.
- The schema is a foundation, not a complete deployed app. Authentication bootstrap, HTTP endpoints, UI pages, backup/restore validation, and end-to-end tests still need implementation before production use.
- Do not use the requested default password on an internet-exposed production deployment. The owner must change it before public exposure; password hashing is required.
- Each account's data must be accessed through authenticated server-side routes. Never accept an account ID from an untrusted browser as authorization.
- All server dates for business reporting use `Asia/Tashkent`; database timestamps remain timestamptz.
- Monetary values are integer UZS.

## Core invariants

1. `create_booking` serializes order creation by account with a PostgreSQL advisory transaction lock.
2. Availability is stock quantity minus the maximum simultaneous booked quantity for any date in the inclusive requested interval. It does not sum unrelated dates.
3. Reserved and issued orders consume availability; returned and cancelled orders do not.
4. Prices and deposits are snapshotted into `booking_items`.
5. Rental payments, deposit receipts, deposit returns, and forfeitures are separate payment kinds. Deposit money is not rental revenue unless explicitly recorded as `forfeit`.
6. Backup import must be a single transaction and must validate version, shape, account scope, IDs, references, and amounts before replacing any data.

## Known remaining work before production

- Add secure first-run Admin creation and login/logout sessions.
- Add authenticated API routes for categories, branches, costumes, stock intake/write-off/transfers, clients, bookings, returns, payments, expenses, finance reports, and backup/restore.
- Record deposit receipt when issuing a booking; enforce rental payment/refund limits and a complete audit journal.
- Implement issued-booking extension with availability validation and immutable item lines.
- Implement stock changes that reject reductions below the peak quantity already committed and transfers that cannot move committed inventory.
- Build the Russian responsive dark interface with bottom mobile navigation and desktop sidebar.
- Add automated PostgreSQL integration tests for empty database, competing bookings, peak-overlap availability, return/deposit accounting, late fees, and backup round-trip.
- Review constraints and functions with the actual production migration strategy before deployment.

## Required acceptance scenario

Given one branch and five active items named “Снежинка”, daily price 40,000 UZS and deposit 20,000 UZS:
- Booking three for an inclusive one-day interval succeeds.
- A second booking for three overlapping that day fails with `Недостаточно костюмов: свободно 2`.
- Deposit received is tracked separately from rental payments.
- A return forfeiture reduces deposit held and is not rental income; only the `forfeit` ledger entry counts as retained deposit income.
- Late fee is stored in `extra_rent` and raises rental balance due.
- Backup/restore is atomic and reproduces booking and item records exactly.
