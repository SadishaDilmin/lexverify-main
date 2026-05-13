
-- Add firm_name and ai_disclaimer_accepted_at to profiles
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS firm_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ai_disclaimer_accepted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Update the handle_new_user function to include firm_name
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email, position, firm_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'position', ''),
    COALESCE(NEW.raw_user_meta_data->>'firm_name', '')
  );
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');
  RETURN NEW;
END;
$function$;
