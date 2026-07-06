-- ============================================================================
-- MIGRAÇÃO — rode no SQL Editor se você JÁ tinha rodado o schema.sql antes.
-- Adiciona a exclusão de busca inteira (mantendo os leads já trabalhados).
-- (Se rodar o schema.sql completo de novo, não precisa deste arquivo.)
-- ============================================================================
create or replace function public.delete_search_smart(p_search_id uuid)
returns json language plpgsql security invoker as $$
declare v_uid uuid := auth.uid(); v_kept int; v_deleted int;
begin
  update public.results set search_id = null
   where search_id = p_search_id and user_id = v_uid
     and coalesce(prospect_status,'novo') <> 'novo';
  get diagnostics v_kept = row_count;

  delete from public.results
   where search_id = p_search_id and user_id = v_uid
     and coalesce(prospect_status,'novo') = 'novo';
  get diagnostics v_deleted = row_count;

  delete from public.searches where id = p_search_id and user_id = v_uid;

  return json_build_object('kept', v_kept, 'deleted', v_deleted);
end $$;

grant execute on function public.delete_search_smart(uuid) to authenticated;
