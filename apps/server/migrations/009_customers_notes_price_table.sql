-- Owner's notes about a customer (preferences, allergies...).
alter table customers add column notes text check (length(notes) <= 1000);

-- The price list the assistant sends when a customer asks for it: written
-- text, one file (image or PDF), or both. One row per business.
create table price_tables (
  tenant_id uuid primary key references tenants (id) on delete cascade,
  body text check (length(body) <= 4000),
  file_name text,
  file_mime text check (file_mime in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  file_data bytea,
  updated_at timestamptz not null default now(),
  check ((file_data is null) = (file_mime is null))
);
alter table price_tables enable row level security;
