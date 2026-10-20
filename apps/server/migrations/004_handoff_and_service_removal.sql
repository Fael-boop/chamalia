-- What the assistant always hands over to the owner (per service and per
-- topic), and removing services that already have appointments.

alter table services
  -- Customers asking for this service always go to the owner (e.g. chemistry needs an evaluation).
  add column handoff boolean not null default false,
  add column handoff_reason text check (length(handoff_reason) <= 300),
  -- Removed in the panel but kept because old appointments point to it.
  add column archived_at timestamptz;

-- Subjects the owner always handles herself ("price negotiation", "complaints"...).
create table handoff_topics (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  topic text not null check (length(topic) between 1 and 200),
  reason text check (length(reason) <= 300),
  created_at timestamptz not null default now()
);
create index handoff_topics_tenant_idx on handoff_topics (tenant_id, created_at);
alter table handoff_topics enable row level security;

-- The old free-text rule (tenants.handoff_rules) becomes the first topic.
insert into handoff_topics (tenant_id, topic)
select id, left(trim(handoff_rules), 200) from tenants where trim(coalesce(handoff_rules, '')) <> '';
update tenants set handoff_rules = null where handoff_rules is not null;
