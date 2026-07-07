-- EntreLooks, schema do banco (Supabase / PostgreSQL)
-- Rodar no SQL Editor do Supabase.
-- A autenticação é do próprio Supabase (auth.users). As tabelas abaixo guardam
-- os dados do app e apontam pro usuário por user_id.
--
-- Este arquivo reflete o banco que está no ar: o perfil de estilo é chaveado
-- por user_id (sem coluna id) e a tabela de roupas não tem travas de valor
-- (CHECK) em style/occasion, então a IA pode gravar qualquer texto nesses campos.

-- Roupas do armário
create table if not exists clothes (
   id           uuid primary key default gen_random_uuid(),
   user_id      uuid not null references auth.users(id) on delete cascade,
   image_url    text not null,
   type         text,          -- ex: camiseta, calça, tênis
   color        text,          -- cor principal em português
   style        text,          -- ex: casual, elegante, esportivo
   occasion     text,          -- ex: dia a dia, trabalho, festa
   nickname     text,          -- apelido opcional que a pessoa dá pra peça
   wear_count   integer not null default 0,
   last_worn_at timestamptz,
   created_at   timestamptz not null default now()
);

-- Looks montados (na mão ou pela IA). clothes_ids guarda as peças que compõem o look.
create table if not exists looks (
   id          uuid primary key default gen_random_uuid(),
   user_id     uuid not null references auth.users(id) on delete cascade,
   clothes_ids uuid[] not null default '{}',
   mode        text not null default 'casual',
   saved       boolean not null default false,
   created_at  timestamptz not null default now()
);

-- Aceites e rejeições de looks, usados pra IA aprender o gosto do usuário
create table if not exists look_interactions (
   id         uuid primary key default gen_random_uuid(),
   user_id    uuid not null references auth.users(id) on delete cascade,
   look_id    uuid not null references looks(id) on delete cascade,
   action     text not null check (action in ('accepted', 'rejected')),
   created_at timestamptz not null default now()
);

-- Looks planejados por dia (um look por data). Substitui se já houver algo no dia.
create table if not exists planned_looks (
   id         uuid primary key default gen_random_uuid(),
   user_id    uuid not null references auth.users(id) on delete cascade,
   look_id    uuid not null references looks(id) on delete cascade,
   date       date not null,
   created_at timestamptz not null default now(),
   unique (user_id, date)
);

-- Resumo do estilo do usuário (um por pessoa, por isso user_id é a chave)
create table if not exists user_style_profile (
   user_id         uuid primary key references auth.users(id) on delete cascade,
   style_summary   text,
   dominant_colors text[] default '{}',
   style_tags      text[] default '{}',
   updated_at      timestamptz not null default now()
);

-- Índices para as consultas mais frequentes
create index if not exists clothes_user_id_idx       on clothes (user_id, created_at desc);
create index if not exists looks_user_saved_idx      on looks   (user_id, saved, created_at desc);
create index if not exists look_interactions_user_idx on look_interactions (user_id, action, created_at desc);
create index if not exists planned_looks_user_idx    on planned_looks (user_id, date);

-- RLS: cada usuário só enxerga e mexe nos próprios dados
alter table clothes            enable row level security;
alter table looks              enable row level security;
alter table look_interactions  enable row level security;
alter table planned_looks      enable row level security;
alter table user_style_profile enable row level security;

create policy "clothes: acesso próprio"            on clothes            for all using (auth.uid() = user_id);
create policy "looks: acesso próprio"              on looks              for all using (auth.uid() = user_id);
create policy "look_interactions: acesso próprio"  on look_interactions  for all using (auth.uid() = user_id);
create policy "planned_looks: acesso próprio"      on planned_looks      for all using (auth.uid() = user_id);
create policy "user_style_profile: acesso próprio" on user_style_profile for all using (auth.uid() = user_id);

-- Storage: o bucket "clothes" é criado à mão no painel do Supabase (Storage, New bucket,
-- nome "clothes", marcado como público). As imagens ficam em {user_id}/{cloth_id}.png.
