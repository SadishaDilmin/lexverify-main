
-- Recreate the trigger on auth.users for new signups
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Backfill profile for existing user who signed up without the trigger
INSERT INTO public.profiles (user_id, full_name, email, position, firm_name, active)
VALUES (
  '2e402920-1b52-483c-a913-a8107adc5244',
  'Appan Pathmanathan',
  'appanp@smartlegal.co.uk',
  'Conveyancer',
  'Smart Legal',
  true
)
ON CONFLICT (user_id) DO NOTHING;

-- Backfill role for existing user
INSERT INTO public.user_roles (user_id, role)
VALUES ('2e402920-1b52-483c-a913-a8107adc5244', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;
