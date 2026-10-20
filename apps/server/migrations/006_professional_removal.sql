-- Removed in the panel but kept because old appointments point to the person.
alter table professionals add column archived_at timestamptz;
