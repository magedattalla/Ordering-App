create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public;

create type public.room_status as enum ('open', 'final');
create type public.room_member_role as enum ('host', 'member');

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  restaurant_name text not null check (char_length(restaurant_name) between 1 and 100),
  combo_size integer not null check (combo_size > 0),
  status public.room_status not null default 'open',
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table public.room_members (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.room_member_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  normalized_name text not null check (char_length(normalized_name) between 1 and 100),
  piece_count integer not null check (piece_count > 0),
  sort_order bigint not null check (sort_order > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (room_id, normalized_name)
);

create index room_members_user_id_idx on public.room_members(user_id);
create index order_items_room_sort_idx on public.order_items(room_id, sort_order);
create index rooms_expires_at_idx on public.rooms(expires_at);

create table private.room_invites (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now()
);

alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.order_items enable row level security;

grant select on public.rooms, public.room_members, public.order_items to authenticated;
revoke insert, update, delete on public.rooms, public.room_members, public.order_items from anon, authenticated;

create policy "Room members can read active rooms"
on public.rooms for select to authenticated
using (
  expires_at > now()
  and exists (
    select 1 from public.room_members m
    where m.room_id = rooms.id and m.user_id = (select auth.uid())
  )
);

create policy "Members can read their own membership"
on public.room_members for select to authenticated
using (user_id = (select auth.uid()));

create policy "Room members can read active items"
on public.order_items for select to authenticated
using (
  exists (
    select 1 from public.rooms r
    join public.room_members m on m.room_id = r.id
    where r.id = order_items.room_id
      and r.expires_at > now()
      and m.user_id = (select auth.uid())
  )
);

create or replace function private.assert_active_member(
  p_room_id uuid,
  p_actor_id uuid,
  p_host_only boolean default false
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_role public.room_member_role;
  v_status public.room_status;
  v_expires_at timestamptz;
begin
  select m.role, r.status, r.expires_at
  into v_role, v_status, v_expires_at
  from public.rooms r
  join public.room_members m on m.room_id = r.id
  where r.id = p_room_id and m.user_id = p_actor_id;

  if v_role is null then
    raise exception 'You do not have access to this room';
  end if;
  if v_expires_at <= now() then
    raise exception 'This room expired after 24 hours';
  end if;
  if v_status <> 'open' then
    raise exception 'This order is already final';
  end if;
  if p_host_only and v_role <> 'host' then
    raise exception 'Only the room creator can finish the order';
  end if;
end;
$$;

create or replace function public.get_room_snapshot(
  p_room_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_room public.rooms;
begin
  select * into v_room from public.rooms where id = p_room_id;
  if not found then
    raise exception 'This room was not found';
  end if;
  if v_room.expires_at <= now() then
    raise exception 'This room expired after 24 hours';
  end if;
  if not exists (
    select 1 from public.room_members
    where room_id = p_room_id and user_id = p_actor_id
  ) then
    raise exception 'You do not have access to this room';
  end if;

  return jsonb_build_object(
    'id', v_room.id,
    'slug', v_room.slug,
    'restaurantName', v_room.restaurant_name,
    'comboSize', v_room.combo_size,
    'status', v_room.status,
    'expiresAt', v_room.expires_at,
    'isHost', exists (
      select 1 from public.room_members
      where room_id = p_room_id and user_id = p_actor_id and role = 'host'
    ),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', item.id,
        'name', item.name,
        'pieceCount', item.piece_count,
        'sortOrder', item.sort_order
      ) order by item.sort_order)
      from public.order_items item
      where item.room_id = p_room_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.get_room_snapshot_by_slug(
  p_slug text,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_room_id uuid;
begin
  select id into v_room_id from public.rooms where slug = p_slug;
  if v_room_id is null then
    raise exception 'This room was not found';
  end if;
  return public.get_room_snapshot(v_room_id, p_actor_id);
end;
$$;

create or replace function public.create_room(
  p_actor_id uuid,
  p_restaurant_name text,
  p_combo_size integer,
  p_slug text,
  p_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_room_id uuid;
  v_restaurant_name text := regexp_replace(btrim(p_restaurant_name), '\\s+', ' ', 'g');
begin
  if p_actor_id is null then raise exception 'A private session is required'; end if;
  if v_restaurant_name = '' or char_length(v_restaurant_name) > 100 then raise exception 'Enter a valid restaurant name'; end if;
  if p_combo_size is null or p_combo_size <= 0 then raise exception 'Enter a positive combo size'; end if;
  if p_slug is null or char_length(p_slug) < 8 or char_length(p_slug) > 64 then raise exception 'Invalid room link'; end if;
  if p_token_hash is null or char_length(p_token_hash) <> 64 then raise exception 'Invalid room link'; end if;

  insert into public.rooms (slug, restaurant_name, combo_size, created_by, expires_at)
  values (p_slug, v_restaurant_name, p_combo_size, p_actor_id, now() + interval '24 hours')
  returning id into v_room_id;

  insert into public.room_members (room_id, user_id, role)
  values (v_room_id, p_actor_id, 'host');

  insert into private.room_invites (room_id, token_hash)
  values (v_room_id, p_token_hash);

  return public.get_room_snapshot(v_room_id, p_actor_id);
end;
$$;

create or replace function public.join_room(
  p_slug text,
  p_token_hash text,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_room_id uuid;
begin
  select r.id into v_room_id
  from public.rooms r
  join private.room_invites invite on invite.room_id = r.id
  where r.slug = p_slug and invite.token_hash = p_token_hash and r.expires_at > now();
  if v_room_id is null then raise exception 'This private room link is invalid or expired'; end if;

  insert into public.room_members (room_id, user_id, role)
  values (v_room_id, p_actor_id, 'member')
  on conflict (room_id, user_id) do nothing;

  return public.get_room_snapshot(v_room_id, p_actor_id);
end;
$$;

create or replace function public.add_or_increment_item(
  p_room_id uuid,
  p_actor_id uuid,
  p_name text,
  p_piece_count integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_name text := regexp_replace(btrim(p_name), '\\s+', ' ', 'g');
  v_normalized_name text;
  v_sort_order bigint;
begin
  perform 1 from public.rooms where id = p_room_id for update;
  perform private.assert_active_member(p_room_id, p_actor_id);
  if v_name = '' or char_length(v_name) > 100 then raise exception 'Enter a valid item name'; end if;
  if p_piece_count is null or p_piece_count <= 0 then raise exception 'Pieces must be a positive whole number'; end if;
  v_normalized_name := lower(v_name);
  select coalesce(max(sort_order), 0) + 1 into v_sort_order from public.order_items where room_id = p_room_id;

  insert into public.order_items (room_id, name, normalized_name, piece_count, sort_order)
  values (p_room_id, v_name, v_normalized_name, p_piece_count, v_sort_order)
  on conflict (room_id, normalized_name)
  do update set piece_count = public.order_items.piece_count + excluded.piece_count, updated_at = now();

  update public.rooms set updated_at = now() where id = p_room_id;
  return public.get_room_snapshot(p_room_id, p_actor_id);
end;
$$;

create or replace function public.change_item_count(
  p_room_id uuid,
  p_actor_id uuid,
  p_item_id uuid,
  p_delta integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_count integer;
begin
  perform 1 from public.rooms where id = p_room_id for update;
  perform private.assert_active_member(p_room_id, p_actor_id);
  if p_delta is null or p_delta = 0 then raise exception 'Choose a valid change'; end if;
  select piece_count into v_count from public.order_items where id = p_item_id and room_id = p_room_id for update;
  if v_count is null then raise exception 'That item no longer exists'; end if;
  if v_count + p_delta <= 0 then
    delete from public.order_items where id = p_item_id;
  else
    update public.order_items set piece_count = v_count + p_delta, updated_at = now() where id = p_item_id;
  end if;
  update public.rooms set updated_at = now() where id = p_room_id;
  return public.get_room_snapshot(p_room_id, p_actor_id);
end;
$$;

create or replace function public.rename_item(
  p_room_id uuid,
  p_actor_id uuid,
  p_item_id uuid,
  p_name text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_name text := regexp_replace(btrim(p_name), '\\s+', ' ', 'g');
  v_normalized_name text;
  v_item public.order_items;
  v_existing_id uuid;
begin
  perform 1 from public.rooms where id = p_room_id for update;
  perform private.assert_active_member(p_room_id, p_actor_id);
  if v_name = '' or char_length(v_name) > 100 then raise exception 'Enter a valid item name'; end if;
  select * into v_item from public.order_items where id = p_item_id and room_id = p_room_id for update;
  if not found then raise exception 'That item no longer exists'; end if;
  v_normalized_name := lower(v_name);
  select id into v_existing_id from public.order_items
  where room_id = p_room_id and normalized_name = v_normalized_name and id <> p_item_id
  for update;
  if v_existing_id is not null then
    update public.order_items set piece_count = piece_count + v_item.piece_count, updated_at = now() where id = v_existing_id;
    delete from public.order_items where id = p_item_id;
  else
    update public.order_items set name = v_name, normalized_name = v_normalized_name, updated_at = now() where id = p_item_id;
  end if;
  update public.rooms set updated_at = now() where id = p_room_id;
  return public.get_room_snapshot(p_room_id, p_actor_id);
end;
$$;

create or replace function public.remove_item(
  p_room_id uuid,
  p_actor_id uuid,
  p_item_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  perform 1 from public.rooms where id = p_room_id for update;
  perform private.assert_active_member(p_room_id, p_actor_id);
  delete from public.order_items where id = p_item_id and room_id = p_room_id;
  if not found then raise exception 'That item no longer exists'; end if;
  update public.rooms set updated_at = now() where id = p_room_id;
  return public.get_room_snapshot(p_room_id, p_actor_id);
end;
$$;

create or replace function public.finalize_room(
  p_room_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_combo_size integer;
  v_total integer;
begin
  select combo_size into v_combo_size from public.rooms where id = p_room_id for update;
  if v_combo_size is null then raise exception 'This room was not found'; end if;
  perform private.assert_active_member(p_room_id, p_actor_id, true);
  select coalesce(sum(piece_count), 0) into v_total from public.order_items where room_id = p_room_id;
  if v_total <> v_combo_size then raise exception 'The combo must be exact before finishing'; end if;
  update public.rooms set status = 'final', updated_at = now() where id = p_room_id;
  return public.get_room_snapshot(p_room_id, p_actor_id);
end;
$$;

create or replace function public.cleanup_expired_rooms()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer;
begin
  delete from public.rooms where expires_at <= now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.get_room_snapshot(uuid, uuid) from public, anon, authenticated;
revoke all on function public.get_room_snapshot_by_slug(text, uuid) from public, anon, authenticated;
revoke all on function public.create_room(uuid, text, integer, text, text) from public, anon, authenticated;
revoke all on function public.join_room(text, text, uuid) from public, anon, authenticated;
revoke all on function public.add_or_increment_item(uuid, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.change_item_count(uuid, uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.rename_item(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.remove_item(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.finalize_room(uuid, uuid) from public, anon, authenticated;
revoke all on function public.cleanup_expired_rooms() from public, anon, authenticated;

grant execute on function public.get_room_snapshot(uuid, uuid) to service_role;
grant execute on function public.get_room_snapshot_by_slug(text, uuid) to service_role;
grant execute on function public.create_room(uuid, text, integer, text, text) to service_role;
grant execute on function public.join_room(text, text, uuid) to service_role;
grant execute on function public.add_or_increment_item(uuid, uuid, text, integer) to service_role;
grant execute on function public.change_item_count(uuid, uuid, uuid, integer) to service_role;
grant execute on function public.rename_item(uuid, uuid, uuid, text) to service_role;
grant execute on function public.remove_item(uuid, uuid, uuid) to service_role;
grant execute on function public.finalize_room(uuid, uuid) to service_role;
grant execute on function public.cleanup_expired_rooms() to service_role;

alter publication supabase_realtime add table public.rooms, public.order_items;
