-- RLS for M1 tables. The posting service uses the service role and bypasses these;
-- these policies exist so a Supabase user session cannot poke at posting data
-- outside their allow-list even if a UI/API check is missed.
ALTER TABLE public.social_accounts ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.social_account_allowlist ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.post_log ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- social_accounts: workspace members can see the accounts in their workspace;
-- reading the row is NOT permission to post — allow-list controls that.
CREATE POLICY "social_accounts_member_select" ON public.social_accounts
  FOR SELECT USING (public.is_workspace_member(workspace_id));
--> statement-breakpoint
CREATE POLICY "social_accounts_admin_write" ON public.social_accounts
  FOR ALL USING (public.is_workspace_admin(workspace_id))
  WITH CHECK (public.is_workspace_admin(workspace_id));
--> statement-breakpoint

-- social_account_allowlist: a user sees their own entries;
-- admins of the owning workspace manage entries.
CREATE POLICY "social_account_allowlist_self_select" ON public.social_account_allowlist
  FOR SELECT USING (user_id = auth.uid());
--> statement-breakpoint
CREATE POLICY "social_account_allowlist_admin_manage" ON public.social_account_allowlist
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.social_accounts sa
      WHERE sa.id = social_account_id AND public.is_workspace_admin(sa.workspace_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.social_accounts sa
      WHERE sa.id = social_account_id AND public.is_workspace_admin(sa.workspace_id)
    )
  );
--> statement-breakpoint

-- post_log: workspace members can read; writes come from server-role posting service.
CREATE POLICY "post_log_member_select" ON public.post_log
  FOR SELECT USING (public.is_workspace_member(workspace_id));
