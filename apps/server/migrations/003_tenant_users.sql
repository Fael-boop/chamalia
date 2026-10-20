-- Logins for business owners: each one sees only their own tenant in the panel.
-- The agency admin logs in with ADMIN_PASSWORD and is not stored here.

create table tenant_users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  name text not null,
  login text not null unique check (login ~ '^[a-z0-9._-]{3,40}$'),
  -- scrypt hash (see apps/server/src/auth/passwords.ts), never the password itself.
  password_hash text not null,
  -- Sessions issued before this moment are rejected (password change / reset).
  password_changed_at timestamptz not null default now(),
  active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tenant_users_tenant_idx on tenant_users (tenant_id);

create trigger tenant_users_updated_at before update on tenant_users
  for each row execute function set_updated_at();

alter table tenant_users enable row level security;
