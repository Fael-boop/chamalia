-- Splits the address so the assistant always has neighborhood and city, even
-- when the owner only fills the street. address stays "street and number".
alter table tenants
  add column address_neighborhood text check (length(address_neighborhood) <= 80),
  add column address_city text check (length(address_city) <= 80);
