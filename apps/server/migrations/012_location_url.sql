-- Google Maps (or similar) link the assistant can send together with the address.
alter table tenants add column location_url text check (length(location_url) <= 500);
