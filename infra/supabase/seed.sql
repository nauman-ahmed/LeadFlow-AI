-- =============================================================================
-- LeadFlow AI — seed data (Sprint 0)
-- Inserts one demo tenant + one sample lead so the mock CRM is non-empty on
-- first boot. Safe to run multiple times: uses ON CONFLICT DO NOTHING.
-- =============================================================================

-- Demo tenant
insert into tenants (id, name)
values ('00000000-0000-0000-0000-000000000001', 'Acme CRM Onboarding')
on conflict (id) do nothing;

-- Sample lead (web)
insert into leads (
  id, tenant_id, name, email, phone, language, source, status,
  qualification_score, tags
) values (
  '00000000-0000-0000-0000-0000000000aa',
  '00000000-0000-0000-0000-000000000001',
  'Sample Visitor',
  'visitor@example.com',
  null,
  'en',
  'web',
  'new',
  0,
  array['source:web', 'lang:en']
) on conflict (id) do nothing;

-- Sample conversation
insert into conversations (
  id, lead_id, channel, external_id, language, started_at
) values (
  '00000000-0000-0000-0000-0000000000bb',
  '00000000-0000-0000-0000-0000000000aa',
  'web',
  'demo-session-001',
  'en',
  now()
) on conflict (id) do nothing;

-- Sample messages
insert into messages (conversation_id, role, content) values
  ('00000000-0000-0000-0000-0000000000bb', 'user', 'Hi! I want to learn about your onboarding service.'),
  ('00000000-0000-0000-0000-0000000000bb', 'assistant', 'Welcome! I can help with that. May I ask what stage your team is at?')
on conflict do nothing;
