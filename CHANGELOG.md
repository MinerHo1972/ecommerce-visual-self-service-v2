# Changelog

## 2026-08-05 - Shared asset management and display names

### Added

- Shared `/assets` workspace for operator, designer, and admin roles.
- Concurrent batch upload queue with client-side MIME, size, and dimension validation; per-item cancel and retry; partial-success retention.
- Asset `display_name` independent from immutable original `filename`.
- Owner/admin write checks and owner/public/admin read checks shared by asset detail, preview, and signed URL routes.
- ESLint 9 flat configuration so lint is an executable deployment gate.

### Changed

- Applied Prisma migration `20260804000000_add_asset_display_name` in production.
- Historical rows were backfilled from filename without changing filename, TOS key, checksum, owner, type, or generated-image references.
- Operator/designer pages can open the shared asset workspace while preserving `GalleryPickModal`, `evss:pick-base`, `RegionInstructionList`, and LayerTemplate behavior.
- Ordinary template uploads remain `AssetType.template_material`; they do not create LayerTemplate records.
- Asset deletion is not exposed: single-asset DELETE and batch delete actions are disabled.

### Production Verification

- Release: `/root/evss-releases/s18-p1-seedream-full`
- Source fingerprint: `9215ffed3242f1b912ac76596d0719356e3e6dac5a998fcf829a2e1dec7a51d7`
- Migration state: 4 migrations, database up to date.
- Protected-data fingerprint before/after migration: `5bd21015e1d231e4853c502d04179ac1`.
- Prisma generate/validate, TypeScript, ESLint, and production build passed.
- PM2: two web cluster instances and one worker instance online.
- Provider: Seedream; API key presence verified without exposing its value.
- Browser role matrix remains unverified because the cloud Chrome process exited before creating a DevTools endpoint. API smoke checks were recorded separately and were not treated as browser evidence.
