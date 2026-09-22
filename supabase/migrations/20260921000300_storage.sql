-- =============================================================================
-- OrganIO · Almacenamiento de imágenes
--
-- Bucket privado. Ruta obligatoria: <user_id>/<task_id>/<uuid>.<ext>
-- - Solo se puede subir a la carpeta propia y a una tarea propia.
-- - Sin política UPDATE: los ficheros son inmutables (no se pueden sobrescribir).
-- - Límite de tamaño y tipos MIME aplicados por Storage antes de aceptar el fichero.
-- - Se sirven con URL firmadas de corta duración, nunca públicas.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attachments', 'attachments', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy attachments_select_own on storage.objects for select to authenticated
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy attachments_insert_own on storage.objects for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and array_length(storage.foldername(name), 1) = 2
    and name ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}/[a-f0-9-]{36}\.(jpg|png|webp|heic)$'
    and exists (
      select 1 from public.tasks t
      where t.id::text = (storage.foldername(name))[2]
        and t.user_id = (select auth.uid())
    )
  );

create policy attachments_delete_own on storage.objects for delete to authenticated
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
