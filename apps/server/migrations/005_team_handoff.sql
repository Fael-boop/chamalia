-- Handoffs can go to a professional or a receptionist instead of always the owner.

alter table professionals
  -- 'reception': team member who answers customers but performs no service
  -- (never offered in the agenda).
  add column kind text not null default 'professional' check (kind in ('professional', 'reception')),
  -- Where this person gets handoff notices. Empty: the notice goes to the owner.
  add column notify_phone text check (notify_phone ~ '^[0-9]{10,15}$');

-- Who resolves each handoff. null = the owner (tenants.owner_phone).
-- "on delete set null (column)" keeps tenant_id when the person is removed.
alter table services
  add column handoff_professional_id uuid,
  add foreign key (tenant_id, handoff_professional_id)
    references professionals (tenant_id, id) on delete set null (handoff_professional_id);

alter table handoff_topics
  add column professional_id uuid,
  add foreign key (tenant_id, professional_id)
    references professionals (tenant_id, id) on delete set null (professional_id);

-- Everything else the assistant can't handle ("when in doubt").
alter table tenants
  add column default_handoff_professional_id uuid,
  add foreign key (id, default_handoff_professional_id)
    references professionals (tenant_id, id) on delete set null (default_handoff_professional_id);
