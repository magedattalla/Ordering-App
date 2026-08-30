create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public;

create type public.group_order_status as enum ('open', 'closed', 'placed');
create type public.group_order_role as enum ('host', 'member');
create type public.order_option_kind as enum ('variant', 'addition', 'removal');

create table public.group_orders (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (char_length(slug) between 8 and 64),
  vendor_name text not null check (char_length(vendor_name) between 1 and 100),
  title text check (title is null or char_length(title) between 1 and 100),
  status public.group_order_status not null default 'open',
  deadline_at timestamptz,
  priced_menu_enabled boolean not null default false,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  check (expires_at = created_at + interval '24 hours'),
  check (deadline_at is null or (deadline_at > created_at and deadline_at <= expires_at))
);

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  group_order_id uuid not null references public.group_orders(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 1 and 40),
  normalized_nickname text not null check (char_length(normalized_nickname) between 1 and 40),
  role public.group_order_role not null default 'member',
  is_ready boolean not null default false,
  joined_at timestamptz not null default now(),
  unique (group_order_id, auth_user_id),
  unique (group_order_id, normalized_nickname)
);
create unique index one_host_per_group_order_idx on public.participants(group_order_id) where role = 'host';
create index participants_auth_user_idx on public.participants(auth_user_id, group_order_id);

create table public.order_lines (
  id uuid primary key default gen_random_uuid(),
  group_order_id uuid not null references public.group_orders(id) on delete cascade,
  item_name text not null check (char_length(item_name) between 1 and 120),
  normalized_item_name text not null check (char_length(normalized_item_name) between 1 and 120),
  quantity integer not null check (quantity between 1 and 999),
  instructions text not null default '' check (char_length(instructions) <= 500),
  creator_participant_id uuid not null references public.participants(id),
  sort_order bigint not null check (sort_order > 0),
  menu_provider text,
  menu_item_ref text,
  currency_code text check (currency_code is null or currency_code ~ '^[A-Z]{3}$'),
  unit_price_minor bigint check (unit_price_minor is null or unit_price_minor >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index order_lines_order_sort_idx on public.order_lines(group_order_id, sort_order);

create table public.order_line_participants (
  group_order_id uuid not null references public.group_orders(id) on delete cascade,
  order_line_id uuid not null references public.order_lines(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (order_line_id, participant_id)
);
create index order_line_participants_order_idx on public.order_line_participants(group_order_id);
create index order_line_participants_person_idx on public.order_line_participants(participant_id);

create table public.order_line_options (
  id uuid primary key default gen_random_uuid(),
  group_order_id uuid not null references public.group_orders(id) on delete cascade,
  order_line_id uuid not null references public.order_lines(id) on delete cascade,
  kind public.order_option_kind not null,
  name text not null check (char_length(name) between 1 and 120),
  provider_option_ref text,
  price_adjustment_minor bigint not null default 0,
  sort_order integer not null default 1 check (sort_order > 0)
);
create index order_line_options_order_idx on public.order_line_options(group_order_id, order_line_id);

create table private.group_order_invites (
  group_order_id uuid primary key references public.group_orders(id) on delete cascade,
  token_hash text not null unique check (char_length(token_hash) = 64),
  created_at timestamptz not null default now()
);
create table private.menu_provider_connections (
  group_order_id uuid primary key references public.group_orders(id) on delete cascade,
  provider text not null,
  provider_vendor_ref text not null,
  encrypted_details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.group_orders enable row level security;
alter table public.participants enable row level security;
alter table public.order_lines enable row level security;
alter table public.order_line_participants enable row level security;
alter table public.order_line_options enable row level security;

grant select on public.group_orders, public.participants, public.order_lines, public.order_line_participants, public.order_line_options to authenticated;
revoke insert, update, delete on public.group_orders, public.participants, public.order_lines, public.order_line_participants, public.order_line_options from anon, authenticated;

create or replace function private.is_active_group_order_member(p_group_order_id uuid, p_actor_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.participants p join public.group_orders o on o.id = p.group_order_id
    where p.group_order_id = p_group_order_id and p.auth_user_id = p_actor_id and o.expires_at > now()
  )
$$;
revoke all on function private.is_active_group_order_member(uuid, uuid) from public, anon, authenticated;

create policy "Members read active group orders" on public.group_orders for select to authenticated
using (private.is_active_group_order_member(id));
create policy "Members read active participants" on public.participants for select to authenticated
using (private.is_active_group_order_member(group_order_id));
create policy "Members read active order lines" on public.order_lines for select to authenticated
using (private.is_active_group_order_member(group_order_id));
create policy "Members read active line assignments" on public.order_line_participants for select to authenticated
using (private.is_active_group_order_member(group_order_id));
create policy "Members read active line options" on public.order_line_options for select to authenticated
using (private.is_active_group_order_member(group_order_id));

create or replace function private.require_group_order_member(
  p_group_order_id uuid, p_actor_id uuid, p_host_only boolean default false, p_open_only boolean default false
) returns uuid language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_participant public.participants; v_order public.group_orders;
begin
  select * into v_order from public.group_orders where id = p_group_order_id;
  if not found then raise exception 'This order was not found'; end if;
  if v_order.expires_at <= now() then raise exception 'This order expired after 24 hours'; end if;
  select * into v_participant from public.participants where group_order_id = p_group_order_id and auth_user_id = p_actor_id;
  if not found then raise exception 'You do not have access to this order'; end if;
  if p_host_only and v_participant.role <> 'host' then raise exception 'Only the host can do that'; end if;
  if p_open_only and v_order.status <> 'open' then
    if v_order.status = 'placed' then raise exception 'This order has been placed'; else raise exception 'This order is closed for edits'; end if;
  end if;
  return v_participant.id;
end;
$$;
revoke all on function private.require_group_order_member(uuid, uuid, boolean, boolean) from public, anon, authenticated;

create or replace function public.get_group_order_snapshot_v2(p_group_order_id uuid, p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, private
as $$
declare v_order public.group_orders; v_participant_id uuid; v_is_host boolean;
begin
  v_participant_id := private.require_group_order_member(p_group_order_id, p_actor_id);
  select * into v_order from public.group_orders where id = p_group_order_id;
  select role = 'host' into v_is_host from public.participants where id = v_participant_id;
  return jsonb_build_object(
    'id', v_order.id, 'slug', v_order.slug, 'vendorName', v_order.vendor_name, 'title', v_order.title,
    'status', v_order.status, 'deadlineAt', v_order.deadline_at, 'createdAt', v_order.created_at,
    'expiresAt', v_order.expires_at, 'currentParticipantId', v_participant_id, 'isHost', v_is_host,
    'capabilities', jsonb_build_object('pricedMenu', v_order.priced_menu_enabled),
    'participants', coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.id, 'nickname', p.nickname, 'role', p.role, 'isReady', p.is_ready,
      'joinedAt', p.joined_at, 'isCurrentUser', p.id = v_participant_id
    ) order by case when p.role = 'host' then 0 else 1 end, p.joined_at) from public.participants p where p.group_order_id = v_order.id), '[]'::jsonb),
    'lines', coalesce((select jsonb_agg(jsonb_build_object(
      'id', l.id, 'itemName', l.item_name, 'quantity', l.quantity, 'instructions', l.instructions,
      'creatorParticipantId', l.creator_participant_id, 'sortOrder', l.sort_order,
      'menuItemRef', l.menu_item_ref, 'unitPriceMinor', l.unit_price_minor,
      'participantIds', coalesce((select jsonb_agg(lp.participant_id order by lp.created_at) from public.order_line_participants lp where lp.order_line_id = l.id), '[]'::jsonb),
      'options', coalesce((select jsonb_agg(jsonb_build_object('id', op.id, 'kind', op.kind, 'name', op.name, 'priceAdjustmentMinor', op.price_adjustment_minor) order by op.sort_order) from public.order_line_options op where op.order_line_id = l.id), '[]'::jsonb),
      'canEdit', v_is_host or l.creator_participant_id = v_participant_id or exists (select 1 from public.order_line_participants lp where lp.order_line_id = l.id and lp.participant_id = v_participant_id)
    ) order by l.sort_order) from public.order_lines l where l.group_order_id = v_order.id), '[]'::jsonb)
  );
end;
$$;

create or replace function public.get_group_order_snapshot_by_slug_v2(p_slug text, p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_id uuid; begin select id into v_id from public.group_orders where slug = p_slug; if v_id is null then raise exception 'This order was not found'; end if; return public.get_group_order_snapshot_v2(v_id, p_actor_id); end;
$$;

create or replace function public.create_group_order_v2(p_actor_id uuid, p_host_nickname text, p_vendor_name text, p_title text, p_deadline_at timestamptz, p_slug text, p_token_hash text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, private
as $$
declare v_order_id uuid; v_now timestamptz := now(); v_nickname text := regexp_replace(btrim(p_host_nickname), '\s+', ' ', 'g'); v_vendor text := regexp_replace(btrim(p_vendor_name), '\s+', ' ', 'g'); v_title text := nullif(regexp_replace(btrim(coalesce(p_title, '')), '\s+', ' ', 'g'), '');
begin
  if p_actor_id is null then raise exception 'A private session is required'; end if;
  if v_nickname = '' or char_length(v_nickname) > 40 then raise exception 'Enter a valid nickname'; end if;
  if v_vendor = '' or char_length(v_vendor) > 100 then raise exception 'Enter a valid restaurant or vendor'; end if;
  if v_title is not null and char_length(v_title) > 100 then raise exception 'Order titles can be up to 100 characters'; end if;
  if p_deadline_at is not null and (p_deadline_at <= v_now or p_deadline_at > v_now + interval '24 hours') then raise exception 'The deadline must be within 24 hours'; end if;
  if char_length(p_slug) < 8 or char_length(p_slug) > 64 or char_length(p_token_hash) <> 64 then raise exception 'Invalid private order link'; end if;
  insert into public.group_orders(slug, vendor_name, title, deadline_at, created_by, created_at, updated_at, expires_at)
  values(p_slug, v_vendor, v_title, p_deadline_at, p_actor_id, v_now, v_now, v_now + interval '24 hours') returning id into v_order_id;
  insert into public.participants(group_order_id, auth_user_id, nickname, normalized_nickname, role) values(v_order_id, p_actor_id, v_nickname, lower(v_nickname), 'host');
  insert into private.group_order_invites(group_order_id, token_hash) values(v_order_id, p_token_hash);
  return public.get_group_order_snapshot_v2(v_order_id, p_actor_id);
end;
$$;

create or replace function public.join_group_order_v2(p_slug text, p_token_hash text, p_actor_id uuid, p_nickname text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, private
as $$
declare v_order_id uuid; v_nickname text := regexp_replace(btrim(p_nickname), '\s+', ' ', 'g');
begin
  select o.id into v_order_id from public.group_orders o join private.group_order_invites i on i.group_order_id = o.id where o.slug = p_slug and i.token_hash = p_token_hash and o.expires_at > now() for update of o;
  if v_order_id is null then raise exception 'This private order link is invalid or expired'; end if;
  if v_nickname = '' or char_length(v_nickname) > 40 then raise exception 'Enter a valid nickname'; end if;
  if exists(select 1 from public.participants where group_order_id = v_order_id and auth_user_id = p_actor_id) then return public.get_group_order_snapshot_v2(v_order_id, p_actor_id); end if;
  if (select count(*) from public.participants where group_order_id = v_order_id) >= 100 then raise exception 'This order already has 100 people'; end if;
  if exists(select 1 from public.participants where group_order_id = v_order_id and normalized_nickname = lower(v_nickname)) then raise exception 'That nickname is already in use'; end if;
  insert into public.participants(group_order_id, auth_user_id, nickname, normalized_nickname) values(v_order_id, p_actor_id, v_nickname, lower(v_nickname));
  update public.group_orders set updated_at = now() where id = v_order_id;
  return public.get_group_order_snapshot_v2(v_order_id, p_actor_id);
end;
$$;

create or replace function private.assert_line_editable(p_order_id uuid, p_line_id uuid, p_participant_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public
as $$
begin
  if not exists(select 1 from public.order_lines l join public.participants p on p.id = p_participant_id where l.id = p_line_id and l.group_order_id = p_order_id and (p.role = 'host' or l.creator_participant_id = p_participant_id or exists(select 1 from public.order_line_participants lp where lp.order_line_id = l.id and lp.participant_id = p_participant_id))) then raise exception 'You cannot edit that item'; end if;
end;
$$;
revoke all on function private.assert_line_editable(uuid, uuid, uuid) from public, anon, authenticated;

create or replace function private.replace_line_assignments(p_order_id uuid, p_line_id uuid, p_participant_ids uuid[])
returns void language plpgsql security definer set search_path = pg_catalog, public
as $$
begin
  if coalesce(array_length(p_participant_ids, 1), 0) = 0 then raise exception 'Assign the item to at least one person'; end if;
  if exists(select 1 from unnest(p_participant_ids) id where not exists(select 1 from public.participants p where p.id = id and p.group_order_id = p_order_id)) then raise exception 'One of those people is no longer in the order'; end if;
  delete from public.order_line_participants where order_line_id = p_line_id;
  insert into public.order_line_participants(group_order_id, order_line_id, participant_id) select p_order_id, p_line_id, id from unnest(p_participant_ids) id group by id;
end;
$$;
revoke all on function private.replace_line_assignments(uuid, uuid, uuid[]) from public, anon, authenticated;

create or replace function public.add_order_line_v2(p_group_order_id uuid, p_actor_id uuid, p_item_name text, p_quantity integer, p_instructions text, p_participant_ids uuid[])
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, private
as $$
declare v_me uuid; v_line_id uuid; v_name text := regexp_replace(btrim(p_item_name), '\s+', ' ', 'g'); v_instructions text := btrim(coalesce(p_instructions, '')); v_sort bigint;
begin
  perform 1 from public.group_orders where id = p_group_order_id for update; v_me := private.require_group_order_member(p_group_order_id, p_actor_id, false, true);
  if v_name = '' or char_length(v_name) > 120 then raise exception 'Enter a valid item name'; end if; if p_quantity < 1 or p_quantity > 999 then raise exception 'Quantity must be between 1 and 999'; end if; if char_length(v_instructions) > 500 then raise exception 'Instructions can be up to 500 characters'; end if;
  select coalesce(max(sort_order), 0) + 1 into v_sort from public.order_lines where group_order_id = p_group_order_id;
  insert into public.order_lines(group_order_id, item_name, normalized_item_name, quantity, instructions, creator_participant_id, sort_order) values(p_group_order_id, v_name, lower(v_name), p_quantity, v_instructions, v_me, v_sort) returning id into v_line_id;
  perform private.replace_line_assignments(p_group_order_id, v_line_id, p_participant_ids); update public.participants set is_ready = false where id = v_me; update public.group_orders set updated_at = now() where id = p_group_order_id;
  return public.get_group_order_snapshot_v2(p_group_order_id, p_actor_id);
end;
$$;

create or replace function public.edit_order_line_v2(p_group_order_id uuid, p_actor_id uuid, p_line_id uuid, p_item_name text, p_quantity integer, p_instructions text, p_participant_ids uuid[])
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, private
as $$
declare v_me uuid; v_name text := regexp_replace(btrim(p_item_name), '\s+', ' ', 'g'); v_instructions text := btrim(coalesce(p_instructions, ''));
begin
  perform 1 from public.group_orders where id = p_group_order_id for update; v_me := private.require_group_order_member(p_group_order_id, p_actor_id, false, true); perform private.assert_line_editable(p_group_order_id, p_line_id, v_me);
  if v_name = '' or char_length(v_name) > 120 then raise exception 'Enter a valid item name'; end if; if p_quantity < 1 or p_quantity > 999 then raise exception 'Quantity must be between 1 and 999'; end if; if char_length(v_instructions) > 500 then raise exception 'Instructions can be up to 500 characters'; end if;
  update public.order_lines set item_name = v_name, normalized_item_name = lower(v_name), quantity = p_quantity, instructions = v_instructions, updated_at = now() where id = p_line_id and group_order_id = p_group_order_id;
  if not found then raise exception 'That item no longer exists'; end if; perform private.replace_line_assignments(p_group_order_id, p_line_id, p_participant_ids); update public.participants set is_ready = false where id = v_me; update public.group_orders set updated_at = now() where id = p_group_order_id;
  return public.get_group_order_snapshot_v2(p_group_order_id, p_actor_id);
end;
$$;

create or replace function public.remove_order_line_v2(p_group_order_id uuid, p_actor_id uuid, p_line_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, private
as $$ declare v_me uuid; begin perform 1 from public.group_orders where id = p_group_order_id for update; v_me := private.require_group_order_member(p_group_order_id, p_actor_id, false, true); perform private.assert_line_editable(p_group_order_id, p_line_id, v_me); delete from public.order_lines where id = p_line_id and group_order_id = p_group_order_id; update public.participants set is_ready = false where id = v_me; update public.group_orders set updated_at = now() where id = p_group_order_id; return public.get_group_order_snapshot_v2(p_group_order_id, p_actor_id); end $$;

create or replace function public.set_participant_readiness_v2(p_group_order_id uuid, p_actor_id uuid, p_is_ready boolean)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, private
as $$ declare v_me uuid; begin v_me := private.require_group_order_member(p_group_order_id, p_actor_id, false, true); update public.participants set is_ready = p_is_ready where id = v_me; update public.group_orders set updated_at = now() where id = p_group_order_id; return public.get_group_order_snapshot_v2(p_group_order_id, p_actor_id); end $$;

create or replace function public.rename_participant_v2(p_group_order_id uuid, p_actor_id uuid, p_participant_id uuid, p_nickname text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, private
as $$
declare v_me uuid; v_name text := regexp_replace(btrim(p_nickname), '\s+', ' ', 'g'); v_role public.group_order_role;
begin
  v_me := private.require_group_order_member(p_group_order_id, p_actor_id); select role into v_role from public.participants where id = v_me;
  if v_role <> 'host' and v_me <> p_participant_id then raise exception 'Only the host can rename other people'; end if;
  if v_name = '' or char_length(v_name) > 40 then raise exception 'Enter a valid nickname'; end if;
  update public.participants set nickname = v_name, normalized_nickname = lower(v_name) where id = p_participant_id and group_order_id = p_group_order_id; if not found then raise exception 'That person is no longer in the order'; end if;
  return public.get_group_order_snapshot_v2(p_group_order_id, p_actor_id);
end;
$$;

create or replace function public.remove_participant_v2(p_group_order_id uuid, p_actor_id uuid, p_participant_id uuid, p_reassign_to_participant_id uuid default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, private
as $$
declare v_host uuid; v_target_role public.group_order_role;
begin
  perform 1 from public.group_orders where id = p_group_order_id for update; v_host := private.require_group_order_member(p_group_order_id, p_actor_id, true);
  select role into v_target_role from public.participants where id = p_participant_id and group_order_id = p_group_order_id; if v_target_role is null then raise exception 'That person is no longer in the order'; end if; if v_target_role = 'host' then raise exception 'Transfer host control before removing the host'; end if;
  if p_reassign_to_participant_id is not null and not exists(select 1 from public.participants where id = p_reassign_to_participant_id and group_order_id = p_group_order_id) then raise exception 'The reassignment person is no longer in the order'; end if;
  if p_reassign_to_participant_id is not null then
    insert into public.order_line_participants(group_order_id, order_line_id, participant_id) select p_group_order_id, lp.order_line_id, p_reassign_to_participant_id from public.order_line_participants lp where lp.participant_id = p_participant_id on conflict do nothing;
    update public.order_lines set creator_participant_id = p_reassign_to_participant_id where group_order_id = p_group_order_id and creator_participant_id = p_participant_id;
  else
    delete from public.order_lines l where l.group_order_id = p_group_order_id and l.creator_participant_id = p_participant_id and not exists(select 1 from public.order_line_participants lp where lp.order_line_id = l.id and lp.participant_id <> p_participant_id);
    update public.order_lines set creator_participant_id = v_host where group_order_id = p_group_order_id and creator_participant_id = p_participant_id;
  end if;
  delete from public.order_line_participants where participant_id = p_participant_id; delete from public.participants where id = p_participant_id; update public.group_orders set updated_at = now() where id = p_group_order_id;
  return public.get_group_order_snapshot_v2(p_group_order_id, p_actor_id);
end;
$$;

create or replace function public.transfer_group_order_host_v2(p_group_order_id uuid, p_actor_id uuid, p_new_host_participant_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, private
as $$
declare v_host uuid; begin perform 1 from public.group_orders where id = p_group_order_id for update; v_host := private.require_group_order_member(p_group_order_id, p_actor_id, true); if not exists(select 1 from public.participants where id = p_new_host_participant_id and group_order_id = p_group_order_id) then raise exception 'That person is no longer in the order'; end if; update public.participants set role = 'member' where id = v_host; update public.participants set role = 'host' where id = p_new_host_participant_id; return public.get_group_order_snapshot_v2(p_group_order_id, p_actor_id); end;
$$;

create or replace function public.set_group_order_status_v2(p_group_order_id uuid, p_actor_id uuid, p_status public.group_order_status)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, private
as $$
declare v_current public.group_order_status; begin perform 1 from public.group_orders where id = p_group_order_id for update; perform private.require_group_order_member(p_group_order_id, p_actor_id, true); select status into v_current from public.group_orders where id = p_group_order_id; if v_current = 'placed' then raise exception 'A placed order cannot be changed'; end if; if p_status = 'placed' and v_current <> 'closed' then raise exception 'Close the order before placing it'; end if; update public.group_orders set status = p_status, updated_at = now() where id = p_group_order_id; return public.get_group_order_snapshot_v2(p_group_order_id, p_actor_id); end;
$$;

create or replace function public.cleanup_expired_group_orders_v2()
returns integer language plpgsql security definer set search_path = pg_catalog, public
as $$ declare v_count integer; begin delete from public.group_orders where expires_at <= now(); get diagnostics v_count = row_count; return v_count; end $$;

revoke all on function public.get_group_order_snapshot_v2(uuid, uuid) from public, anon, authenticated;
revoke all on function public.get_group_order_snapshot_by_slug_v2(text, uuid) from public, anon, authenticated;
revoke all on function public.create_group_order_v2(uuid, text, text, text, timestamptz, text, text) from public, anon, authenticated;
revoke all on function public.join_group_order_v2(text, text, uuid, text) from public, anon, authenticated;
revoke all on function public.add_order_line_v2(uuid, uuid, text, integer, text, uuid[]) from public, anon, authenticated;
revoke all on function public.edit_order_line_v2(uuid, uuid, uuid, text, integer, text, uuid[]) from public, anon, authenticated;
revoke all on function public.remove_order_line_v2(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.set_participant_readiness_v2(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.rename_participant_v2(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.remove_participant_v2(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.transfer_group_order_host_v2(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.set_group_order_status_v2(uuid, uuid, public.group_order_status) from public, anon, authenticated;
revoke all on function public.cleanup_expired_group_orders_v2() from public, anon, authenticated;

grant execute on function public.get_group_order_snapshot_v2(uuid, uuid), public.get_group_order_snapshot_by_slug_v2(text, uuid), public.create_group_order_v2(uuid, text, text, text, timestamptz, text, text), public.join_group_order_v2(text, text, uuid, text), public.add_order_line_v2(uuid, uuid, text, integer, text, uuid[]), public.edit_order_line_v2(uuid, uuid, uuid, text, integer, text, uuid[]), public.remove_order_line_v2(uuid, uuid, uuid), public.set_participant_readiness_v2(uuid, uuid, boolean), public.rename_participant_v2(uuid, uuid, uuid, text), public.remove_participant_v2(uuid, uuid, uuid, uuid), public.transfer_group_order_host_v2(uuid, uuid, uuid), public.set_group_order_status_v2(uuid, uuid, public.group_order_status), public.cleanup_expired_group_orders_v2() to service_role;

alter publication supabase_realtime add table public.group_orders, public.participants, public.order_lines, public.order_line_participants;
