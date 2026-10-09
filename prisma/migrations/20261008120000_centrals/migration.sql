-- P19 — Central de atendimento (D20). Migration ADITIVA (D23): tabela nova e duas
-- colunas NULLABLE; nenhum registro existente é alterado, nenhum backfill.


-- AlterTable
ALTER TABLE "Agreement" ADD COLUMN     "centralId" TEXT;

-- AlterTable
ALTER TABLE "PriorityValidation" ADD COLUMN     "centralId" TEXT;

-- CreateTable
CREATE TABLE "Central" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "externalId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "deletedAt" TIMESTAMPTZ,
    CONSTRAINT "Central_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Central_organizationId_isActive_idx" ON "Central"("organizationId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Central_organizationId_slug_key" ON "Central"("organizationId", "slug");

-- CreateIndex
CREATE INDEX "Agreement_centralId_createdAt_idx" ON "Agreement"("centralId", "createdAt");

-- CreateIndex
CREATE INDEX "PriorityValidation_centralId_validatedAt_idx" ON "PriorityValidation"("centralId", "validatedAt");

-- AddForeignKey
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_centralId_fkey" FOREIGN KEY ("centralId") REFERENCES "Central"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriorityValidation" ADD CONSTRAINT "PriorityValidation_centralId_fkey" FOREIGN KEY ("centralId") REFERENCES "Central"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Central" ADD CONSTRAINT "Central_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Slug é a chave de deduplicação: nunca vazio.
ALTER TABLE "Central" ADD CONSTRAINT "Central_slug_not_empty" CHECK ("slug" <> '' AND "name" <> '');
