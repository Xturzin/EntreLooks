-- EntreLooks — schema Supabase
-- Rodar no SQL Editor do Supabase (Settings → SQL Editor)

create table if not exists clothes (
   id          uuid primary key default gen_random_uuid(),
   user_id     uuid not null references auth.users(id) on delete cascade,
   image_url   text not null,
   type        text,
   color       text,
   style       text,
   occasion    text,
   wear_count  integer not null default 0,
   last_worn_at timestamptz,
   created_at  timestamptz not null default now()
);

create table if not exists looks (
   id          uuid primary key default gen_random_uuid(),
   user_id     uuid not null references auth.users(id) on delete cascade,
   clothes_ids uuid[] not null default '{}',
   mode        text not null default 'casual',
   saved       boolean not null default false,
   created_at  timestamptz not null default now()
);

create table if not exists look_interactions (
   id          uuid primary key default gen_random_uuid(),
   user_id     uuid not null references auth.users(id) on delete cascade,
   look_id     uuid not null references looks(id) on delete cascade,
   action      text not null check (action in ('accepted', 'rejected')),
   created_at  timestamptz not null default now()
);

create table if not exists user_style_profile (
   id               uuid primary key default gen_random_uuid(),
   user_id          uuid not null unique references auth.users(id) on delete cascade,
   style_summary    text,
   dominant_colors  text[],
   style_tags       text[],
   created_at       timestamptz not null default now(),
   updated_at       timestamptz not null default now()
);

-- índices para queries frequentes
create index if not exists clothes_user_id_idx        on clothes (user_id, created_at desc);
create index if not exists looks_user_saved_idx        on looks   (user_id, saved, created_at desc);
create index if not exists look_interactions_user_idx  on look_interactions (user_id, action, created_at desc);

-- RLS: cada usuário só acessa seus próprios dados
alter table clothes             enable row level security;
alter table looks               enable row level security;
alter table look_interactions   enable row level security;
alter table user_style_profile  enable row level security;

create policy "clothes: acesso próprio"            on clothes            for all using (auth.uid() = user_id);
create policy "looks: acesso próprio"              on looks              for all using (auth.uid() = user_id);
create policy "look_interactions: acesso próprio"  on look_interactions  for all using (auth.uid() = user_id);
create policy "user_style_profile: acesso próprio" on user_style_profile for all using (auth.uid() = user_id);

-- Storage: bucket "clothes" deve ser criado manualmente no painel do Supabase
-- Storage → New bucket → nome: clothes → Public bucket: true
