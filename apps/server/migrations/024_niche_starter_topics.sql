-- "Química" (coloração, mechas, progressiva...) used to be written into the assistant's base
-- instructions, so it applied to every business, even a barbershop or a clinic. It becomes a
-- normal "Passar para a equipe" topic that each business can keep, edit or delete.

-- Topics a NEW business of that niche starts with (only beauty salons for now).
alter table niches add column starter_handoff_topics jsonb not null default '[]';

update niches
set starter_handoff_topics = '[{"topic":"Química: coloração, mechas, progressiva, alisamento e relaxamento","reason":"Precisa avaliar o cabelo e reservar tempo próprio"}]'
where slug = 'beauty_salon';

-- Businesses that already exist keep exactly what they had: every one of them was handing
-- química over, so each gets the topic (and can now delete it in "Passar para a equipe").
insert into handoff_topics (tenant_id, topic, reason)
select t.id, 'Química: coloração, mechas, progressiva, alisamento e relaxamento', 'Precisa avaliar o cabelo e reservar tempo próprio'
from tenants t
where not exists (
  select 1 from handoff_topics h where h.tenant_id = t.id and h.topic ilike 'química%'
);
