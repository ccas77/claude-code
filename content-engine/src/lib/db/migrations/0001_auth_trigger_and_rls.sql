-- Auth trigger: mirror auth.users → public.profiles on signup, keep in sync on update
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name')
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        display_name = COALESCE(EXCLUDED.display_name, public.profiles.display_name);
  RETURN NEW;
END;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;--> statement-breakpoint
CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
--> statement-breakpoint

-- Helper: is the calling user a member of the given workspace?
CREATE OR REPLACE FUNCTION public.is_workspace_member(ws_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = ws_id AND user_id = auth.uid()
  );
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.is_workspace_admin(ws_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = ws_id AND user_id = auth.uid() AND role = 'admin'
  );
$$;
--> statement-breakpoint

-- Enable RLS on all M0 tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.pen_names ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.event_log ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- profiles: users see and update their own row
CREATE POLICY "profiles_self_select" ON public.profiles
  FOR SELECT USING (id = auth.uid());
--> statement-breakpoint
CREATE POLICY "profiles_self_update" ON public.profiles
  FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());
--> statement-breakpoint

-- workspaces: members can read; only admins can update; only the caller can create a workspace they will own
CREATE POLICY "workspaces_member_select" ON public.workspaces
  FOR SELECT USING (public.is_workspace_member(id));
--> statement-breakpoint
CREATE POLICY "workspaces_admin_update" ON public.workspaces
  FOR UPDATE USING (public.is_workspace_admin(id)) WITH CHECK (public.is_workspace_admin(id));
--> statement-breakpoint
CREATE POLICY "workspaces_self_insert" ON public.workspaces
  FOR INSERT WITH CHECK (owner_user_id = auth.uid());
--> statement-breakpoint

-- workspace_members: members can read the roster of their workspaces; only admins can insert/update/delete
CREATE POLICY "workspace_members_member_select" ON public.workspace_members
  FOR SELECT USING (public.is_workspace_member(workspace_id));
--> statement-breakpoint
CREATE POLICY "workspace_members_admin_write" ON public.workspace_members
  FOR ALL USING (public.is_workspace_admin(workspace_id))
  WITH CHECK (public.is_workspace_admin(workspace_id));
--> statement-breakpoint

-- pen_names: workspace members read; admins write
CREATE POLICY "pen_names_member_select" ON public.pen_names
  FOR SELECT USING (public.is_workspace_member(workspace_id));
--> statement-breakpoint
CREATE POLICY "pen_names_admin_write" ON public.pen_names
  FOR ALL USING (public.is_workspace_admin(workspace_id))
  WITH CHECK (public.is_workspace_admin(workspace_id));
--> statement-breakpoint

-- event_log: members read (append-only; writes come from server-role code, not user sessions)
CREATE POLICY "event_log_member_select" ON public.event_log
  FOR SELECT USING (workspace_id IS NULL OR public.is_workspace_member(workspace_id));
--> statement-breakpoint

-- Bootstrap seam: allow the first workspace_member row to be inserted by the workspace owner
-- (chicken-and-egg: without this, no one can add themselves to a workspace they just created).
CREATE POLICY "workspace_members_owner_bootstrap" ON public.workspace_members
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = workspace_id AND w.owner_user_id = auth.uid()
    )
  );
