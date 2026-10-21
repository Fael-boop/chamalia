-- Simple rules the business writes to train its assistant ("sempre pergunte o
-- nome", "nunca ofereça desconto"). Sent to the model with every message.
create table assistant_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  kind text not null check (kind in ('always', 'never')),
  text text not null check (length(text) between 1 and 300),
  created_at timestamptz not null default now()
);
create index assistant_rules_tenant_idx on assistant_rules (tenant_id, created_at);
alter table assistant_rules enable row level security;
