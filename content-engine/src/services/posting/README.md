# services/posting

Post Bridge client + verification. Implemented in **M1**.

Rules (from architecture doc §4 and §6.1, non-negotiable):
- `POST /v1/posts` is never retried (duplicate-post incident 2026-05-08).
- Verify after create by re-listing and matching client-side; the `social_account_id` query filter is silently ignored.
- Per-user account allow-list checked before every call — Post Bridge has no workspace isolation.
- `is_aigc` is a per-workspace setting, not hardcoded.
