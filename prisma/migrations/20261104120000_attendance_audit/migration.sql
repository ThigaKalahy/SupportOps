-- C23: Auditoria de Atendimentos (D47). Só tabelas e enums NOVOS (D23): nenhuma tabela existente muda.
-- Rollback: desligar o módulo ATTENDANCE_AUDIT basta; as tabelas ficam inofensivas. Apagar só com autorização.

-- CreateEnum
CREATE TYPE "AuditBatchStatus" AS ENUM ('OPEN', 'PROCESSING', 'STOPPED', 'DONE');

-- CreateEnum
CREATE TYPE "AuditConversationStatus" AS ENUM ('IMPORTED', 'QUEUED', 'PROCESSING', 'DONE', 'FAILED', 'REVIEW_NEEDED');

-- CreateEnum
CREATE TYPE "AuditSender" AS ENUM ('CUSTOMER', 'ANALYST', 'SYSTEM', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "AuditRunStatus" AS ENUM ('SUCCESS', 'SIMULATED', 'INVALID_RESPONSE', 'ERROR');

-- CreateEnum
CREATE TYPE "AuditReviewAction" AS ENUM ('CONFIRMED', 'CORRECTED', 'RECLASSIFIED', 'NOTE', 'INCORRECT');

-- CreateEnum
CREATE TYPE "AuditFeedbackKind" AS ENUM ('REINFORCEMENT', 'CORRECTIVE', 'FEEDFORWARD', 'DEVELOPMENT');

-- CreateTable
CREATE TABLE "AuditAccess" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grantedByUserId" TEXT,
    "grantedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMPTZ,

    CONSTRAINT "AuditAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditConfig" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "simulation" BOOLEAN NOT NULL DEFAULT true,
    "model" TEXT NOT NULL DEFAULT 'gpt-5.4-nano',
    "criteriaVersion" TEXT NOT NULL DEFAULT 'v1',
    "maxPerRun" INTEGER NOT NULL DEFAULT 5,
    "concurrency" INTEGER NOT NULL DEFAULT 1,
    "requestsPerMinute" INTEGER NOT NULL DEFAULT 10,
    "tokensPerMinute" INTEGER NOT NULL DEFAULT 60000,
    "maxInputTokens" INTEGER NOT NULL DEFAULT 12000,
    "maxOutputTokens" INTEGER NOT NULL DEFAULT 2500,
    "monthlyBudgetUsd" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "batchBudgetUsd" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "inputPricePerMTok" DECIMAL(10,4),
    "cachedInputPricePerMTok" DECIMAL(10,4),
    "outputPricePerMTok" DECIMAL(10,4),
    "maskPersonalData" BOOLEAN NOT NULL DEFAULT true,
    "retentionDays" INTEGER NOT NULL DEFAULT 180,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "updatedByUserId" TEXT,

    CONSTRAINT "AuditConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditBatch" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "AuditBatchStatus" NOT NULL DEFAULT 'OPEN',
    "stopRequested" BOOLEAN NOT NULL DEFAULT false,
    "fileCount" INTEGER NOT NULL DEFAULT 0,
    "importedCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "warningCount" INTEGER NOT NULL DEFAULT 0,
    "report" JSONB,
    "budgetUsd" DECIMAL(10,4),
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditConversation" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "encoding" TEXT NOT NULL,
    "rawText" TEXT,
    "externalId" TEXT,
    "customerName" TEXT,
    "analystName" TEXT,
    "memberId" TEXT,
    "multipleAnalysts" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMPTZ,
    "endedAt" TIMESTAMPTZ,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "parseWarnings" JSONB,
    "status" "AuditConversationStatus" NOT NULL DEFAULT 'IMPORTED',
    "statusChangedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMPTZ,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "finalScore" DECIMAL(5,2),
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditMessage" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "sender" "AuditSender" NOT NULL,
    "authorName" TEXT,
    "sentAt" TIMESTAMPTZ,
    "text" TEXT NOT NULL,

    CONSTRAINT "AuditMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditRun" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "criteriaVersion" TEXT NOT NULL,
    "status" "AuditRunStatus" NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "startedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "cachedTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "reasoningTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DECIMAL(10,6) NOT NULL DEFAULT 0,
    "response" JSONB,
    "error" TEXT,

    CONSTRAINT "AuditRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditCriterionScore" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "criterion" TEXT NOT NULL,
    "weight" INTEGER NOT NULL,
    "score" DECIMAL(5,2),
    "applicable" BOOLEAN NOT NULL DEFAULT true,
    "justification" TEXT NOT NULL,

    CONSTRAINT "AuditCriterionScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvidence" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "criterion" TEXT,
    "kind" TEXT NOT NULL,
    "messagePosition" INTEGER,
    "quote" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AuditEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditReview" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "runId" TEXT,
    "action" "AuditReviewAction" NOT NULL,
    "criterion" TEXT,
    "scoreBefore" DECIMAL(5,2),
    "scoreAfter" DECIMAL(5,2),
    "note" TEXT NOT NULL,
    "reviewedByUserId" TEXT NOT NULL,
    "reviewedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditFeedbackSuggestion" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "memberId" TEXT,
    "conversationId" TEXT,
    "kind" "AuditFeedbackKind" NOT NULL,
    "situation" TEXT NOT NULL,
    "behavior" TEXT NOT NULL,
    "impact" TEXT NOT NULL,
    "suggestion" TEXT NOT NULL,
    "evidence" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" TIMESTAMPTZ,

    CONSTRAINT "AuditFeedbackSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditAnalystAlias" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "aliasKey" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditAnalystAlias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuditAccess_teamId_userId_key" ON "AuditAccess"("teamId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "AuditConfig_teamId_key" ON "AuditConfig"("teamId");

-- CreateIndex
CREATE INDEX "AuditBatch_teamId_createdAt_idx" ON "AuditBatch"("teamId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditConversation_teamId_status_idx" ON "AuditConversation"("teamId", "status");

-- CreateIndex
CREATE INDEX "AuditConversation_teamId_batchId_idx" ON "AuditConversation"("teamId", "batchId");

-- CreateIndex
CREATE INDEX "AuditConversation_teamId_memberId_idx" ON "AuditConversation"("teamId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "AuditConversation_teamId_contentHash_key" ON "AuditConversation"("teamId", "contentHash");

-- CreateIndex
CREATE INDEX "AuditMessage_teamId_conversationId_idx" ON "AuditMessage"("teamId", "conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "AuditMessage_conversationId_position_key" ON "AuditMessage"("conversationId", "position");

-- CreateIndex
CREATE INDEX "AuditRun_teamId_startedAt_idx" ON "AuditRun"("teamId", "startedAt");

-- CreateIndex
CREATE INDEX "AuditRun_teamId_conversationId_idx" ON "AuditRun"("teamId", "conversationId");

-- CreateIndex
CREATE INDEX "AuditCriterionScore_teamId_criterion_idx" ON "AuditCriterionScore"("teamId", "criterion");

-- CreateIndex
CREATE UNIQUE INDEX "AuditCriterionScore_runId_criterion_key" ON "AuditCriterionScore"("runId", "criterion");

-- CreateIndex
CREATE INDEX "AuditEvidence_teamId_runId_idx" ON "AuditEvidence"("teamId", "runId");

-- CreateIndex
CREATE INDEX "AuditReview_teamId_conversationId_idx" ON "AuditReview"("teamId", "conversationId");

-- CreateIndex
CREATE INDEX "AuditFeedbackSuggestion_teamId_memberId_idx" ON "AuditFeedbackSuggestion"("teamId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "AuditAnalystAlias_teamId_aliasKey_key" ON "AuditAnalystAlias"("teamId", "aliasKey");

-- AddForeignKey
ALTER TABLE "AuditAccess" ADD CONSTRAINT "AuditAccess_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditConfig" ADD CONSTRAINT "AuditConfig_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditBatch" ADD CONSTRAINT "AuditBatch_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditConversation" ADD CONSTRAINT "AuditConversation_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditConversation" ADD CONSTRAINT "AuditConversation_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "AuditBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditConversation" ADD CONSTRAINT "AuditConversation_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "TeamMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditMessage" ADD CONSTRAINT "AuditMessage_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditMessage" ADD CONSTRAINT "AuditMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AuditConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditRun" ADD CONSTRAINT "AuditRun_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditRun" ADD CONSTRAINT "AuditRun_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AuditConversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditCriterionScore" ADD CONSTRAINT "AuditCriterionScore_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditCriterionScore" ADD CONSTRAINT "AuditCriterionScore_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AuditRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvidence" ADD CONSTRAINT "AuditEvidence_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvidence" ADD CONSTRAINT "AuditEvidence_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AuditRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditReview" ADD CONSTRAINT "AuditReview_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditReview" ADD CONSTRAINT "AuditReview_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AuditConversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditFeedbackSuggestion" ADD CONSTRAINT "AuditFeedbackSuggestion_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditFeedbackSuggestion" ADD CONSTRAINT "AuditFeedbackSuggestion_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "TeamMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditFeedbackSuggestion" ADD CONSTRAINT "AuditFeedbackSuggestion_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AuditConversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditAnalystAlias" ADD CONSTRAINT "AuditAnalystAlias_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditAnalystAlias" ADD CONSTRAINT "AuditAnalystAlias_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "TeamMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

