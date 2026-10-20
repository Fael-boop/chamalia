-- Several services booked in one visit, back to back (e.g. nails then hair
-- treatment). Each service is its own appointment; combo_id ties them together.
alter table appointments add column combo_id uuid;
create index appointments_combo_idx on appointments (tenant_id, combo_id) where combo_id is not null;
