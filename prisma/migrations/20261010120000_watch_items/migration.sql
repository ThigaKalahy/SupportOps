-- P21 — Em observação (D24–D27). Migration ADITIVA (D23): enums novos, um valor
-- novo em TimelineEventType, duas tabelas novas e uma coluna NULLABLE em
-- TimelineEvent (watchItemId). Nenhum registro existente é alterado.
--
-- ALTER TYPE ... ADD VALUE fica sozinho no topo: o valor novo não é usado nesta migration.

-- AlterEnum
ALTER TYPE "TimelineEventType" ADD VALUE 'WATCH';

-- CreateEnum
CREATE TYPE "WatchHeat" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "WatchStatus" AS ENUM ('ACTIVE', 'RESOLVED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "WatchOrigin" AS ENUM ('DAILY', 'AGREEMENT', 'PRIORITY_VALIDATION', 'DEV_RETURN', 'ONE_ON_ONE', 'FEEDBACK', 'MANUAL');

-- AlterTable
ALTER TABLE "TimelineEvent" ADD COLUMN     "watchItemId" TEXT;

-- CreateTable
CREATE TABLE "WatchItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "context" TEXT,
    "heat" "WatchHeat" NOT NULL,
    "status" "WatchStatus" NOT NULL DEFAULT 'ACTIVE',
    "origin" "WatchOrigin" NOT NULL,
    "visibility" "Visibility" NOT NULL DEFAULT 'PRIVATE',
    "memberId" TEXT,
    "centralId" TEXT,
    "agreementId" TEXT,
    "dailyId" TEXT,
    "priorityValidationId" TEXT,
    "devReturnId" TEXT,
    "oneOnOneId" TEXT,
    "feedbackId" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,
    "lastReviewedAt" TIMESTAMPTZ NOT NULL,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "heatChangedAt" TIMESTAMPTZ NOT NULL,
    "resolvedAt" TIMESTAMPTZ,
    "resolutionNote" TEXT,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "deletedAt" TIMESTAMPTZ,

    CONSTRAINT "WatchItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WatchReview" (
    "id" TEXT NOT NULL,
    "watchItemId" TEXT NOT NULL,
    "reviewedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "heatBefore" "WatchHeat" NOT NULL,
    "heatAfter" "WatchHeat" NOT NULL,
    "authorUserId" TEXT NOT NULL,

    CONSTRAINT "WatchReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WatchItem_organizationId_status_heat_idx" ON "WatchItem"("organizationId", "status", "heat");

-- CreateIndex
CREATE INDEX "WatchItem_memberId_status_idx" ON "WatchItem"("memberId", "status");

-- CreateIndex
CREATE INDEX "WatchItem_centralId_status_idx" ON "WatchItem"("centralId", "status");

-- CreateIndex
CREATE INDEX "WatchItem_status_lastReviewedAt_idx" ON "WatchItem"("status", "lastReviewedAt");

-- CreateIndex
CREATE INDEX "WatchReview_watchItemId_reviewedAt_idx" ON "WatchReview"("watchItemId", "reviewedAt");

-- CreateIndex
CREATE INDEX "TimelineEvent_watchItemId_idx" ON "TimelineEvent"("watchItemId");

-- AddForeignKey
ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_watchItemId_fkey" FOREIGN KEY ("watchItemId") REFERENCES "WatchItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchItem" ADD CONSTRAINT "WatchItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchItem" ADD CONSTRAINT "WatchItem_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchItem" ADD CONSTRAINT "WatchItem_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "TeamMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchItem" ADD CONSTRAINT "WatchItem_centralId_fkey" FOREIGN KEY ("centralId") REFERENCES "Central"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchItem" ADD CONSTRAINT "WatchItem_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "Agreement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchItem" ADD CONSTRAINT "WatchItem_dailyId_fkey" FOREIGN KEY ("dailyId") REFERENCES "Daily"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchItem" ADD CONSTRAINT "WatchItem_priorityValidationId_fkey" FOREIGN KEY ("priorityValidationId") REFERENCES "PriorityValidation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchItem" ADD CONSTRAINT "WatchItem_devReturnId_fkey" FOREIGN KEY ("devReturnId") REFERENCES "DevReturn"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchItem" ADD CONSTRAINT "WatchItem_oneOnOneId_fkey" FOREIGN KEY ("oneOnOneId") REFERENCES "OneOnOne"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchItem" ADD CONSTRAINT "WatchItem_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "Feedback"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchReview" ADD CONSTRAINT "WatchReview_watchItemId_fkey" FOREIGN KEY ("watchItemId") REFERENCES "WatchItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchReview" ADD CONSTRAINT "WatchReview_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Título obrigatório e não vazio; resolver exige texto (D27): resolvida sem resolutionNote é recusada.
ALTER TABLE "WatchItem" ADD CONSTRAINT "WatchItem_title_not_empty" CHECK (length(btrim("title")) > 0);
ALTER TABLE "WatchItem" ADD CONSTRAINT "WatchItem_resolution_required" CHECK (
  "status" <> 'RESOLVED' OR ("resolvedAt" IS NOT NULL AND "resolutionNote" IS NOT NULL AND length(btrim("resolutionNote")) > 0)
);
ALTER TABLE "WatchItem" ADD CONSTRAINT "WatchItem_review_count_non_negative" CHECK ("reviewCount" >= 0);
