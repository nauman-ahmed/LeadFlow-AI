-- =============================================================================
-- Migration 002 — Sprint 3
-- Replace the partial unique index on appointments.cal_booking_id with an
-- unconditional UNIQUE constraint so that PostgREST upserts (
-- `?on_conflict=cal_booking_id`) work from the Next.js chat-book route and
-- the n8n cal-webhook workflow.
--
-- Why the partial index doesn't work:
--   Postgres `ON CONFLICT (col)` requires the conflict target to match a
--   unique constraint OR a non-partial unique index. The schema.sql index
--   filtered on `cal_booking_id IS NOT NULL`, which is correct semantics
--   but isn't a valid ON CONFLICT target.
--
-- Why dropping the partial index is safe:
--   NULL values are still allowed to repeat under the default
--   NULLS DISTINCT semantics of UNIQUE in PostgreSQL 15+ (Supabase).
--
-- Apply: paste into Supabase SQL editor and run once.
-- Idempotent: safe to re-run.
-- =============================================================================

drop index if exists appointments_cal_booking_id_idx;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'appointments_cal_booking_id_key'
  ) then
    alter table appointments
      add constraint appointments_cal_booking_id_key unique (cal_booking_id);
  end if;
end $$;
