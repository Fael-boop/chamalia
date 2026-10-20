-- Ready answers the owner writes for questions customers ask often
-- ("tem estacionamento?", "qual o endereço?"). The assistant answers with these.
create table faq_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  question text not null check (length(question) between 1 and 200),
  answer text not null check (length(answer) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index faq_entries_tenant_idx on faq_entries (tenant_id, created_at);
alter table faq_entries enable row level security;
