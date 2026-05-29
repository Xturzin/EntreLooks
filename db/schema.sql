-- EntreLooks — Schema SQL
-- Banco: Supabase (PostgreSQL)
-- Auth gerenciada pelo Supabase Auth; tabelas de dados referenciadas por user_id (uuid)

-- ─────────────────────────────────────────────
-- EXTENSÃO
-- ─────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────
-- ROUPAS
-- ─────────────────────────────────────────────
CREATE TABLE clothes (
    id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    image_url    TEXT        NOT NULL,
    type         TEXT,                           -- ex: "camiseta", "calça", "tênis"
    color        TEXT,                           -- cor principal em português
    style        TEXT CHECK (style IN ('casual','elegante','esportivo','formal','streetwear')),
    occasion     TEXT CHECK (occasion IN ('dia a dia','trabalho','festa','academia','praia')),
    wear_count   INTEGER     NOT NULL DEFAULT 0,
    last_worn_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_clothes_user_id    ON clothes (user_id);
CREATE INDEX idx_clothes_created_at ON clothes (user_id, created_at DESC);

-- ─────────────────────────────────────────────
-- LOOKS
-- ─────────────────────────────────────────────
CREATE TABLE looks (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    clothes_ids UUID[]      NOT NULL DEFAULT '{}',  -- IDs das peças que compõem o look
    mode        TEXT        NOT NULL DEFAULT 'casual'
                            CHECK (mode IN ('casual','elegante','trabalho','festa')),
    saved       BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_looks_user_saved ON looks (user_id, saved, created_at DESC);

-- ─────────────────────────────────────────────
-- INTERAÇÕES COM LOOKS  (aceitar / rejeitar)
-- ─────────────────────────────────────────────
CREATE TABLE look_interactions (
    id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    look_id    UUID        NOT NULL REFERENCES looks(id) ON DELETE CASCADE,
    action     TEXT        NOT NULL CHECK (action IN ('accepted', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, look_id, action)   -- evita duplicação de rejeição/aceitação
);

CREATE INDEX idx_interactions_user_action ON look_interactions (user_id, action, created_at DESC);

-- ─────────────────────────────────────────────
-- PERFIL DE ESTILO
-- ─────────────────────────────────────────────
CREATE TABLE user_style_profile (
    user_id         UUID    PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    style_summary   TEXT,                   -- parágrafo gerado por IA
    dominant_colors TEXT[]  DEFAULT '{}',   -- ex: ["preto", "branco"]
    style_tags      TEXT[]  DEFAULT '{}',   -- ex: ["casual", "streetwear"]
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- ROW LEVEL SECURITY (RLS)
-- ─────────────────────────────────────────────
-- Todas as tabelas exigem que user_id = auth.uid()

ALTER TABLE clothes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE looks               ENABLE ROW LEVEL SECURITY;
ALTER TABLE look_interactions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_style_profile  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own clothes"    ON clothes            FOR ALL USING (user_id = auth.uid());
CREATE POLICY "own looks"      ON looks              FOR ALL USING (user_id = auth.uid());
CREATE POLICY "own interactions" ON look_interactions FOR ALL USING (user_id = auth.uid());
CREATE POLICY "own profile"    ON user_style_profile FOR ALL USING (user_id = auth.uid());

-- ─────────────────────────────────────────────
-- STORAGE BUCKET  (configurado no dashboard Supabase)
-- ─────────────────────────────────────────────
-- Bucket: "clothes"  (público para leitura)
-- Path:   {user_id}/{cloth_id}.png
-- Acesso de escrita restrito ao próprio usuário via RLS do Storage
