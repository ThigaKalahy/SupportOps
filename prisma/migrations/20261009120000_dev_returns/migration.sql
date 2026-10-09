-- P20 — Devolução do desenvolvimento (D21, D22). Migration ADITIVA (D23): enum,
-- duas tabelas novas, índices, chaves e o catálogo inicial de motivos. Nenhuma
-- tabela existente é alterada, nenhum registro existente é reescrito.

-- CreateEnum
CREATE TYPE "DevReturnCategory" AS ENUM ('ANALYST', 'PROCESS');

-- CreateTable
CREATE TABLE "DevReturnReason" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category" "DevReturnCategory" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL,
    "requiresDetail" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "DevReturnReason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DevReturn" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ticketUrl" TEXT NOT NULL,
    "ticketRef" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "centralId" TEXT,
    "priorityValidationId" TEXT,
    "returnedAt" DATE NOT NULL,
    "reasonId" TEXT NOT NULL,
    "reasonOther" TEXT,
    "note" TEXT,
    "devContact" TEXT,
    "resolvedAt" DATE,
    "resolutionNote" TEXT,
    "registeredByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "deletedAt" TIMESTAMPTZ,

    CONSTRAINT "DevReturn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DevReturnReason_organizationId_order_idx" ON "DevReturnReason"("organizationId", "order");

-- CreateIndex
CREATE INDEX "DevReturn_organizationId_returnedAt_idx" ON "DevReturn"("organizationId", "returnedAt");

-- CreateIndex
CREATE INDEX "DevReturn_memberId_returnedAt_idx" ON "DevReturn"("memberId", "returnedAt");

-- CreateIndex
CREATE INDEX "DevReturn_reasonId_idx" ON "DevReturn"("reasonId");

-- CreateIndex
CREATE INDEX "DevReturn_ticketRef_idx" ON "DevReturn"("ticketRef");

-- CreateIndex
CREATE INDEX "DevReturn_centralId_returnedAt_idx" ON "DevReturn"("centralId", "returnedAt");

-- AddForeignKey
ALTER TABLE "DevReturnReason" ADD CONSTRAINT "DevReturnReason_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevReturn" ADD CONSTRAINT "DevReturn_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevReturn" ADD CONSTRAINT "DevReturn_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "TeamMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevReturn" ADD CONSTRAINT "DevReturn_centralId_fkey" FOREIGN KEY ("centralId") REFERENCES "Central"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevReturn" ADD CONSTRAINT "DevReturn_priorityValidationId_fkey" FOREIGN KEY ("priorityValidationId") REFERENCES "PriorityValidation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevReturn" ADD CONSTRAINT "DevReturn_reasonId_fkey" FOREIGN KEY ("reasonId") REFERENCES "DevReturnReason"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevReturn" ADD CONSTRAINT "DevReturn_registeredByUserId_fkey" FOREIGN KEY ("registeredByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Textos obrigatórios não vazios.
ALTER TABLE "DevReturnReason" ADD CONSTRAINT "DevReturnReason_label_not_empty" CHECK (length(btrim("label")) > 0);
ALTER TABLE "DevReturn" ADD CONSTRAINT "DevReturn_ticket_not_empty" CHECK (length(btrim("ticketRef")) > 0 AND length(btrim("ticketUrl")) > 0);

-- Motivo que exige detalhe ("Outro"): reasonOther não pode ser vazio. Também no
-- zod; o banco é a última barreira. Trigger porque depende de outra tabela.
CREATE FUNCTION "DevReturn_reason_detail_check"() RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "DevReturnReason" r WHERE r."id" = NEW."reasonId" AND r."requiresDetail")
     AND (NEW."reasonOther" IS NULL OR length(btrim(NEW."reasonOther")) = 0) THEN
    RAISE EXCEPTION 'DevReturn: o motivo % exige reasonOther', NEW."reasonId"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "DevReturn_reason_detail_trigger"
  BEFORE INSERT OR UPDATE OF "reasonId", "reasonOther" ON "DevReturn"
  FOR EACH ROW EXECUTE FUNCTION "DevReturn_reason_detail_check"();

-- Catálogo inicial de motivos para cada organização existente (dado de catálogo,
-- não backfill de histórico). Atribuíveis ao analista primeiro, depois processo.
INSERT INTO "DevReturnReason" ("id", "organizationId", "label", "category", "order", "requiresDetail")
SELECT 'drr_' || replace(gen_random_uuid()::text, '-', ''), o."id", r."label", r."category"::"DevReturnCategory", r."order", r."requiresDetail"
FROM "Organization" o
CROSS JOIN (VALUES
  ('Falta de informação no chamado', 'ANALYST', 1, false),
  ('Evidência insuficiente (sem log, print ou passo a passo)', 'ANALYST', 2, false),
  ('Não é bug: comportamento esperado', 'ANALYST', 3, false),
  ('Não é bug: erro de configuração', 'ANALYST', 4, false),
  ('Não é bug: erro de uso ou falta de treinamento', 'ANALYST', 5, false),
  ('Ambiente ou versão não informados', 'ANALYST', 6, false),
  ('Central ou cliente não identificado', 'ANALYST', 7, false),
  ('Chamado duplicado', 'ANALYST', 8, false),
  ('Fora do escopo do desenvolvimento', 'PROCESS', 9, false),
  ('Critério de triagem divergente entre as áreas', 'PROCESS', 10, false),
  ('Informação solicitada não era necessária', 'PROCESS', 11, false),
  ('Regra de negócio não documentada', 'PROCESS', 12, false),
  ('Outro', 'PROCESS', 13, true)
) AS r("label", "category", "order", "requiresDetail");
