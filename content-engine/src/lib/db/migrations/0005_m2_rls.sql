-- RLS for M2 tables. Assets and brand_kits are workspace-scoped. Ingest jobs
-- and OCR use the service role and bypass these; the policies protect the
-- Supabase user session path from cross-workspace reads/writes.
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.brand_kits ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- assets: workspace members can read; workspace members can insert their own
-- uploads; only the uploader or a workspace admin can update/delete. Private
-- visibility is hidden from other members.
CREATE POLICY "assets_member_select" ON public.assets
  FOR SELECT USING (
    public.is_workspace_member(workspace_id)
    AND (visibility = 'workspace' OR uploaded_by = auth.uid())
  );
--> statement-breakpoint
CREATE POLICY "assets_member_insert" ON public.assets
  FOR INSERT WITH CHECK (
    public.is_workspace_member(workspace_id) AND uploaded_by = auth.uid()
  );
--> statement-breakpoint
CREATE POLICY "assets_owner_or_admin_update" ON public.assets
  FOR UPDATE USING (
    uploaded_by = auth.uid() OR public.is_workspace_admin(workspace_id)
  )
  WITH CHECK (
    uploaded_by = auth.uid() OR public.is_workspace_admin(workspace_id)
  );
--> statement-breakpoint
CREATE POLICY "assets_owner_or_admin_delete" ON public.assets
  FOR DELETE USING (
    uploaded_by = auth.uid() OR public.is_workspace_admin(workspace_id)
  );
--> statement-breakpoint

-- brand_kits: workspace members can read; admins can write.
CREATE POLICY "brand_kits_member_select" ON public.brand_kits
  FOR SELECT USING (public.is_workspace_member(workspace_id));
--> statement-breakpoint
CREATE POLICY "brand_kits_admin_write" ON public.brand_kits
  FOR ALL USING (public.is_workspace_admin(workspace_id))
  WITH CHECK (public.is_workspace_admin(workspace_id));
