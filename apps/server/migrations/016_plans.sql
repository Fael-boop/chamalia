-- Plans the agency sells and each business's subscription.
-- "Agenda Online" = panel only; "Agenda Online + Lia" = panel plus the WhatsApp assistant.
create table plans (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null check (length(name) between 1 and 60),
  includes_assistant boolean not null,
  -- Price of one month and of a 12-month payment (yearly discount). null = not for sale yet.
  price_cents_monthly integer check (price_cents_monthly >= 0),
  price_cents_yearly integer check (price_cents_yearly >= 0),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
alter table plans enable row level security;

insert into plans (slug, name, includes_assistant, price_cents_monthly, sort_order) values
  ('agenda', 'Agenda Online', false, null, 1),
  ('agenda-lia', 'Agenda Online + Lia', true, 29700, 2);

-- One subscription per business, kept on the tenant row.
-- monthly/annual: access until paid_until (null = never paid = blocked); lifetime: never expires.
alter table tenants
  add column plan_id uuid references plans (id),
  add column billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly', 'annual', 'lifetime')),
  add column paid_until timestamptz;

-- Businesses that already exist keep working exactly as today.
update tenants set plan_id = (select id from plans where slug = 'agenda-lia'), billing_cycle = 'lifetime';

-- A business created without a plan gets the full one.
create function default_plan_id() returns uuid language sql stable as $$
  select id from plans where slug = 'agenda-lia'
$$;
alter table tenants alter column plan_id set default default_plan_id();
alter table tenants alter column plan_id set not null;

-- Every payment, asked for by the business on the payment page or registered by the agency.
-- paid: the agency confirmed it (or a gateway did, later) and paid_until moved forward.
create table payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  plan_id uuid not null references plans (id),
  months integer not null check (months between 1 and 36),
  amount_cents integer not null check (amount_cents >= 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'cancelled')),
  method text not null default 'pix' check (method in ('pix', 'manual')),
  -- The business pressed "Já paguei": the agency should check the bank.
  reported_at timestamptz,
  paid_at timestamptz,
  note text check (length(note) <= 300),
  created_at timestamptz not null default now()
);
create index payments_tenant_idx on payments (tenant_id, created_at desc);
create index payments_pending_idx on payments (status) where status = 'pending';
alter table payments enable row level security;
