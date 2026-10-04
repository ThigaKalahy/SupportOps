-- Busca global (P16): Postgres full-text search em português, sem serviço externo.
-- Coluna tsvector GERADA (o banco mantém sozinha a cada escrita) + índice GIN.
-- Acentos: o dicionário 'portuguese' não os remove; "relatorio" precisa achar
-- "relatório". unaccent() não é IMMUTABLE (exigência de coluna gerada), então
-- um wrapper imutável com o dicionário qualificado pelo schema.

CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION public.immutable_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;

ALTER TABLE "TimelineEvent" ADD COLUMN "searchVector" tsvector GENERATED ALWAYS AS (
  to_tsvector('portuguese', public.immutable_unaccent(coalesce("title", '') || ' ' || coalesce("summary", '')))
) STORED;
CREATE INDEX "TimelineEvent_searchVector_idx" ON "TimelineEvent" USING GIN ("searchVector");

ALTER TABLE "Feedback" ADD COLUMN "searchVector" tsvector GENERATED ALWAYS AS (
  to_tsvector('portuguese', public.immutable_unaccent(
    coalesce("context", '') || ' ' || coalesce("behavior", '') || ' ' || coalesce("impact", '') || ' ' || coalesce("guidance", '')
  ))
) STORED;
CREATE INDEX "Feedback_searchVector_idx" ON "Feedback" USING GIN ("searchVector");

ALTER TABLE "OneOnOne" ADD COLUMN "searchVector" tsvector GENERATED ALWAYS AS (
  to_tsvector('portuguese', public.immutable_unaccent(
    coalesce("topics", '') || ' ' || coalesce("memberPerception", '') || ' ' || coalesce("managerPerception", '') || ' ' ||
    coalesce("wins", '') || ' ' || coalesce("difficulties", '') || ' ' || coalesce("development", '')
  ))
) STORED;
CREATE INDEX "OneOnOne_searchVector_idx" ON "OneOnOne" USING GIN ("searchVector");

ALTER TABLE "Note" ADD COLUMN "searchVector" tsvector GENERATED ALWAYS AS (
  to_tsvector('portuguese', public.immutable_unaccent(coalesce("title", '') || ' ' || coalesce("body", '')))
) STORED;
CREATE INDEX "Note_searchVector_idx" ON "Note" USING GIN ("searchVector");

ALTER TABLE "Agreement" ADD COLUMN "searchVector" tsvector GENERATED ALWAYS AS (
  to_tsvector('portuguese', public.immutable_unaccent(
    coalesce("title", '') || ' ' || coalesce("description", '') || ' ' || coalesce("outcome", '')
  ))
) STORED;
CREATE INDEX "Agreement_searchVector_idx" ON "Agreement" USING GIN ("searchVector");
