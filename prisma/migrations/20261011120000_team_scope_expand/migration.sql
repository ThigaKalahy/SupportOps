-- P22 · A — EXPANDIR (D23, D29–D36).
-- Cria TeamAccess e TeamModule; acrescenta User.isPlatformAdmin, Team.slug/isActive/
-- createdAt/createdByUserId, AuditLog.teamId e teamId NULLABLE nas entidades de dado de
-- time. Nenhuma constraint nova em tabela existente, nenhum dado alterado.
-- Team.createdAt do time que já existe fica com o instante desta migration.

-- CreateEnum
CREATE TYPE "TeamAccessLevel" AS ENUM ('MANAGER', 'VIEWER');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdByUserId" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "slug" TEXT;

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "teamId" TEXT;

-- AlterTable
ALTER TABLE "AlertThreshold" ADD COLUMN     "teamId" TEXT;

-- AlterTable
ALTER TABLE "Seniority" ADD COLUMN     "teamId" TEXT;

-- AlterTable
ALTER TABLE "MemberTrait" ADD COLUMN     "teamId" TEXT;

-- AlterTable
ALTER TABLE "MemberChange" ADD COLUMN     "teamId" TEXT;

-- AlterTable
ALTER TABLE "Responsibility" ADD COLUMN     "teamId" TEXT;

-- AlterTable
ALTER TABLE "MemberResponsibility" ADD COLUMN     "teamId" TEXT;

-- AlterTable
ALTER TABLE "MentorshipLink" ADD COLUMN     "teamId" TEXT;

-- AlterTable
ALTER TABLE "DailyParticipant" ADD COLUMN     "teamId" TEXT;

-- AlterTable
ALTER TABLE "Agreement" ADD COLUMN     "teamId" TEXT;

-- AlterTable
ALTER TABLE "AgreementParticipant" ADD COLUMN     "teamId" TEXT;

-- AlterTable
ALTER TABLE "BlockerReason" ADD COLUMN     "teamId" TEXT;

-- AlterTable
ALTER TABLE "AgreementCheckin" ADD COLUMN     "teamId" TEXT;

-- AlterTable
ALTER TABLE "OneOnOne" ADD COLUMN     "teamId" TEXT;

-- AlterTable
ALTER TABLE "Feedback" ADD COLUMN     "teamId" TEXT;

-- AlterTable
ALTER TABLE "Note" ADD COLUMN     "teamId" TEXT;

-- AlterTable
ALTER TABLE "PriorityLevel" ADD COLUMN     "teamId" TEXT;

-- AlterTable
ALTER TABLE "ReclassificationReason" ADD COLUMN     "teamId" TEXT;

-- AlterTable
ALTER TABLE "TicketUrlPattern" ADD COLUMN     "teamId" TEXT;

-- AlterTable
ALTER TABLE "PriorityValidation" ADD COLUMN     "teamId" TEXT;

-- AlterTable
ALTER TABLE "Central" ADD COLUMN     "teamId" TEXT;

-- AlterTable
ALTER TABLE "Competency" ADD COLUMN     "teamId" TEXT;

-- AlterTable
ALTER TABLE "CompetencyExpectation" ADD COLUMN     "teamId" TEXT;

-- AlterTable
ALTER TABLE "MemberCompetency" ADD COLUMN     "teamId" TEXT;

-- AlterTable
ALTER TABLE "DevelopmentPlan" ADD COLUMN     "teamId" TEXT;

-- AlterTable
ALTER TABLE "DevelopmentAction" ADD COLUMN     "teamId" TEXT;

-- AlterTable
ALTER TABLE "MetricDefinition" ADD COLUMN     "teamId" TEXT;

-- AlterTable
ALTER TABLE "MetricResult" ADD COLUMN     "teamId" TEXT;

-- AlterTable
ALTER TABLE "ScoreDefinition" ADD COLUMN     "teamId" TEXT;

-- AlterTable
ALTER TABLE "ScoreComponent" ADD COLUMN     "teamId" TEXT;

-- AlterTable
ALTER TABLE "ScoreResult" ADD COLUMN     "teamId" TEXT;

-- AlterTable
ALTER TABLE "ScoreResultComponent" ADD COLUMN     "teamId" TEXT;

-- AlterTable
ALTER TABLE "TimelineEvent" ADD COLUMN     "teamId" TEXT;

-- AlterTable
ALTER TABLE "DevReturnReason" ADD COLUMN     "teamId" TEXT;

-- AlterTable
ALTER TABLE "DevReturn" ADD COLUMN     "teamId" TEXT;

-- AlterTable
ALTER TABLE "WatchItem" ADD COLUMN     "teamId" TEXT;

-- AlterTable
ALTER TABLE "WatchReview" ADD COLUMN     "teamId" TEXT;

-- CreateTable
CREATE TABLE "TeamAccess" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "level" "TeamAccessLevel" NOT NULL,
    "grantedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedByUserId" TEXT,
    "revokedAt" TIMESTAMPTZ,

    CONSTRAINT "TeamAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamModule" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "enabledAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changedByUserId" TEXT,

    CONSTRAINT "TeamModule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeamAccess_userId_revokedAt_idx" ON "TeamAccess"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "TeamAccess_teamId_level_idx" ON "TeamAccess"("teamId", "level");

-- CreateIndex
CREATE UNIQUE INDEX "TeamAccess_userId_teamId_key" ON "TeamAccess"("userId", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamModule_teamId_moduleKey_key" ON "TeamModule"("teamId", "moduleKey");


-- AddForeignKey
ALTER TABLE "TeamAccess" ADD CONSTRAINT "TeamAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamAccess" ADD CONSTRAINT "TeamAccess_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamAccess" ADD CONSTRAINT "TeamAccess_grantedByUserId_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamModule" ADD CONSTRAINT "TeamModule_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamModule" ADD CONSTRAINT "TeamModule_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

