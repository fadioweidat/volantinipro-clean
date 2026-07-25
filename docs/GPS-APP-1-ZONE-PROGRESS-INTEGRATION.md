# GPS-APP-1 — Zone Progress Client Integration

Date: 2026-07-25

Scope: client integration only. No database migration, production SQL, repair,
database push, deployment, commit, push, or pull request is included.

## Backend contract

| RPC | Return | Execute grant | Runtime authorization |
| --- | --- | --- | --- |
| `get_campaign_zone_progress(p_campaign_id uuid)` | `jsonb` array | `authenticated`, `service_role` | campaign owner or `gps_is_admin()` |
| `admin_set_zone_manual_progress(p_campaign_zone_id uuid, p_manual_percent numeric, p_reason text)` | `campaign_zone_progress` | `authenticated`, `service_role` | `gps_is_admin()` only |
| `admin_clear_zone_manual_progress(p_campaign_zone_id uuid, p_reason text)` | `campaign_zone_progress` | `authenticated`, `service_role` | `gps_is_admin()` only |

The read RPC returns a restricted customer projection and the extended Admin
projection. Both mutation RPCs validate inputs, serialize writes through a
transaction advisory lock, update the progress row, and append immutable audit
history.

No history RPC exists. Admin history uses the approved direct SELECT surface on
`campaign_zone_progress_history`, filtered by `campaign_id_snapshot`; forced RLS
and the Admin-only policy remain authoritative. The client never reads or writes
`campaign_zone_progress` directly.

## Role and UI mapping

| Role | Surface | Allowed workflow |
| --- | --- | --- |
| Customer | `/customer/campaigns/:id/tracking` → `CampaignTracking` | read current zone progress through the read RPC |
| Admin | `/admin/campaigns/:id/gps` → `GpsMonitor` | read progress, set/clear override through RPCs, read retained history |
| Operator | `/driver/tracking/:id` → `TrackingPage` | no zone-progress access; existing operator tracking remains unchanged |

The operator surface is deliberately excluded because the deployed RPC and RLS
contracts do not authorize an ordinary operator to read campaign-owner progress
or perform Admin overrides.

## Integration map

| Backend surface | Client service | Hook/state | UI component | Tests |
| --- | --- | --- | --- | --- |
| `get_campaign_zone_progress` | `getCampaignZoneProgress` | `useZoneProgress` loading/success/empty/error | `ZoneProgressPanel` customer and Admin views | client arguments, normalization, hook load, empty/error rendering |
| `admin_set_zone_manual_progress` | `setZoneManualProgress` | mutation state + mandatory refresh | Admin controls in `ZoneProgressPanel` | validation, authorization mapping, set→refresh integration |
| `admin_clear_zone_manual_progress` | `clearZoneManualProgress` | mutation state + mandatory refresh | Admin controls in `ZoneProgressPanel` | validation, authorization mapping, clear→refresh integration |
| history table Admin SELECT policy | `getCampaignZoneProgressHistory` | Admin history state | immutable history list | policy-surface query contract and integration flow |

## Client behavior

- UUID, percentage, and mandatory reason are validated before RPC invocation.
- Database authorization details are mapped to safe user-facing errors.
- Loading, refreshing, success, empty, and failure states are explicit.
- Successful set/clear operations reload both current progress and Admin history.
- No hardcoded campaign, zone, identity, progress, or authorization fallback is
  present.
- Server RPC checks and forced RLS remain the security boundary; route names are
  not treated as authorization.

## Verification

- Existing GPS/browser/client regression contracts: PASS.
- Zone-progress client and authorization contracts: PASS.
- Hook/reducer/component state contracts: PASS.
- Main integration flow get→set→refresh→clear→history: PASS.
- Production build: PASS.
