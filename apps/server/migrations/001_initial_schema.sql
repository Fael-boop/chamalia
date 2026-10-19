-- Multi-tenant schema. Every business table carries tenant_id, and foreign keys
-- between tenant-owned rows include tenant_id, so a row can never point to
-- another tenant's data.

create extension if not exists btree_gist;

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Each client of the agency (a clinic, a barbershop...) with its own WhatsApp number.
create table tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  assistant_name text not null default 'Lia',
  business_type text not null default 'other'
    check (business_type in ('clinic', 'aesthetics', 'barbershop', 'other')),
  timezone text not null default 'America/Sao_Paulo',
  owner_name text,
  -- Owner gets notified here about new bookings and cancellations.
  owner_phone text check (owner_phone ~ '^[0-9]{10,15}$'),
  whatsapp_provider text not null default 'evolution'
    check (whatsapp_provider in ('evolution', 'meta_cloud')),
  -- Evolution: instance name. Meta Cloud: phone_number_id.
  whatsapp_instance text unique,
  whatsapp_number text check (whatsapp_number ~ '^[0-9]{10,15}$'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table services (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  name text not null,
  description text,
  duration_minutes integer not null check (duration_minutes between 5 and 480),
  price_cents integer check (price_cents >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id)
);

create table professionals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id)
);

-- Which professional performs which service.
create table professional_services (
  tenant_id uuid not null,
  professional_id uuid not null,
  service_id uuid not null,
  primary key (professional_id, service_id),
  foreign key (tenant_id, professional_id) references professionals (tenant_id, id) on delete cascade,
  foreign key (tenant_id, service_id) references services (tenant_id, id) on delete cascade
);

-- Weekly opening hours. Several rows on the same weekday model breaks
-- (e.g. 09:00-12:00 and 13:00-18:00). professional_id null = whole business.
create table business_hours (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  professional_id uuid,
  weekday smallint not null check (weekday between 0 and 6), -- 0 = Sunday
  opens_at time not null,
  closes_at time not null,
  check (closes_at > opens_at),
  foreign key (tenant_id, professional_id) references professionals (tenant_id, id) on delete cascade
);
create index business_hours_tenant_idx on business_hours (tenant_id, weekday);

-- Holidays, vacations, blocked slots. professional_id null = whole business.
create table time_off (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  professional_id uuid,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  check (ends_at > starts_at),
  foreign key (tenant_id, professional_id) references professionals (tenant_id, id) on delete cascade
);
create index time_off_tenant_idx on time_off (tenant_id, starts_at);

-- End customers who talk to the bot. Identified by phone within a tenant.
create table customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  phone text not null check (phone ~ '^[0-9]{10,15}$'),
  name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, phone),
  unique (tenant_id, id)
);

create table appointments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  customer_id uuid not null,
  service_id uuid not null,
  professional_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'confirmed', 'cancelled', 'completed', 'no_show')),
  source text not null default 'whatsapp' check (source in ('whatsapp', 'panel')),
  notes text,
  reminder_24h_sent_at timestamptz,
  reminder_2h_sent_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  foreign key (tenant_id, customer_id) references customers (tenant_id, id),
  foreign key (tenant_id, service_id) references services (tenant_id, id),
  foreign key (tenant_id, professional_id) references professionals (tenant_id, id),
  -- The database itself refuses double booking, even if two customers pick
  -- the same slot at the same moment.
  constraint appointments_no_overlap exclude using gist (
    professional_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status in ('scheduled', 'confirmed'))
);
create index appointments_tenant_day_idx on appointments (tenant_id, starts_at);
create index appointments_customer_idx on appointments (customer_id, starts_at);
-- Reminder job looks for upcoming appointments still waiting for a reminder.
create index appointments_reminders_idx on appointments (starts_at)
  where status in ('scheduled', 'confirmed');

-- One ongoing conversation per customer. `state` + `context` hold where the
-- customer is in the booking flow (chosen service, offered slots...).
create table conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  customer_id uuid not null,
  state text not null default 'idle',
  context jsonb not null default '{}',
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, customer_id),
  unique (tenant_id, id),
  foreign key (tenant_id, customer_id) references customers (tenant_id, id) on delete cascade
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  conversation_id uuid not null,
  direction text not null check (direction in ('inbound', 'outbound')),
  body text not null,
  -- Id given by Evolution/Meta; used to ignore duplicated webhook deliveries.
  provider_message_id text,
  created_at timestamptz not null default now(),
  unique (tenant_id, provider_message_id),
  foreign key (tenant_id, conversation_id) references conversations (tenant_id, id) on delete cascade
);
create index messages_conversation_idx on messages (conversation_id, created_at);

create trigger tenants_updated_at before update on tenants
  for each row execute function set_updated_at();
create trigger services_updated_at before update on services
  for each row execute function set_updated_at();
create trigger professionals_updated_at before update on professionals
  for each row execute function set_updated_at();
create trigger customers_updated_at before update on customers
  for each row execute function set_updated_at();
create trigger appointments_updated_at before update on appointments
  for each row execute function set_updated_at();
create trigger conversations_updated_at before update on conversations
  for each row execute function set_updated_at();

-- On Supabase, tables in "public" are reachable through its REST API with the
-- public anon key. RLS without policies closes that door; the bot connects as
-- the table owner and is not affected. Harmless on a plain Postgres.
alter table tenants enable row level security;
alter table services enable row level security;
alter table professionals enable row level security;
alter table professional_services enable row level security;
alter table business_hours enable row level security;
alter table time_off enable row level security;
alter table customers enable row level security;
alter table appointments enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
