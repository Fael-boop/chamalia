-- A conversation handed to the team goes back to the assistant by itself
-- after this many hours without anyone from the team writing in it.
alter table tenants
  add column handoff_return_hours integer not null default 12 check (handoff_return_hours between 1 and 168);
