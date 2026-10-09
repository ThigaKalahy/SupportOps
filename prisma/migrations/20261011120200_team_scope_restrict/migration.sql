-- P22 · C — RESTRINGIR (D30, D31, D36).
-- teamId NOT NULL em todas as entidades de dado de time, FK para Team com
-- ON DELETE RESTRICT (time não se apaga por acidente), teamId no primeiro índice
-- composto e unicidades de catálogo por TIME (antes por organização): um segundo time
-- precisa poder ter a própria senioridade "Pleno" ou a própria central.
-- AlertThreshold passa a ter chave (teamId, key).

-- DropIndex
DROP INDEX "Seniority_organizationId_key_key";

-- DropIndex
DROP INDEX "Seniority_organizationId_order_key";

-- DropIndex
DROP INDEX "MemberTrait_memberId_kind_isActive_idx";

-- DropIndex
DROP INDEX "MemberChange_memberId_effectiveAt_idx";

-- DropIndex
DROP INDEX "Responsibility_organizationId_name_key";

-- DropIndex
DROP INDEX "MemberResponsibility_responsibilityId_idx";

-- DropIndex
DROP INDEX "MentorshipLink_mentorMemberId_idx";

-- DropIndex
DROP INDEX "DailyParticipant_memberId_idx";

-- DropIndex
DROP INDEX "Agreement_memberId_originalDueDate_idx";

-- DropIndex
DROP INDEX "Agreement_status_dueDate_idx";

-- DropIndex
DROP INDEX "AgreementParticipant_memberId_idx";

-- DropIndex
DROP INDEX "BlockerReason_organizationId_order_idx";

-- DropIndex
DROP INDEX "AgreementCheckin_agreementId_createdAt_idx";

-- DropIndex
DROP INDEX "OneOnOne_memberId_date_idx";

-- DropIndex
DROP INDEX "Feedback_memberId_date_idx";

-- DropIndex
DROP INDEX "Note_memberId_occurredAt_idx";

-- DropIndex
DROP INDEX "PriorityLevel_organizationId_key_key";

-- DropIndex
DROP INDEX "ReclassificationReason_organizationId_order_idx";

-- DropIndex
DROP INDEX "TicketUrlPattern_organizationId_order_idx";

-- DropIndex
DROP INDEX "PriorityValidation_organizationId_validatedAt_idx";

-- DropIndex
DROP INDEX "Central_organizationId_isActive_idx";

-- DropIndex
DROP INDEX "Central_organizationId_slug_key";

-- DropIndex
DROP INDEX "Competency_organizationId_name_key";

-- DropIndex
DROP INDEX "MemberCompetency_competencyId_idx";

-- DropIndex
DROP INDEX "DevelopmentPlan_memberId_status_idx";

-- DropIndex
DROP INDEX "DevelopmentAction_planId_idx";

-- DropIndex
DROP INDEX "MetricDefinition_organizationId_key_key";

-- DropIndex
DROP INDEX "MetricResult_metricDefinitionId_periodStart_idx";

-- DropIndex
DROP INDEX "ScoreDefinition_organizationId_name_version_key";

-- DropIndex
DROP INDEX "ScoreResult_memberId_periodStart_idx";

-- DropIndex
DROP INDEX "TimelineEvent_memberId_occurredAt_idx";

-- DropIndex
DROP INDEX "DevReturnReason_organizationId_order_idx";

-- DropIndex
DROP INDEX "DevReturn_organizationId_returnedAt_idx";

-- DropIndex
DROP INDEX "WatchItem_organizationId_status_heat_idx";

-- DropIndex
DROP INDEX "WatchReview_watchItemId_reviewedAt_idx";

-- AlterTable
ALTER TABLE "Team" ALTER COLUMN "slug" SET NOT NULL;

-- AlterTable
ALTER TABLE "AlertThreshold" DROP CONSTRAINT "AlertThreshold_pkey",
ALTER COLUMN "teamId" SET NOT NULL,
ADD CONSTRAINT "AlertThreshold_pkey" PRIMARY KEY ("teamId", "key");

-- AlterTable
ALTER TABLE "Seniority" ALTER COLUMN "teamId" SET NOT NULL;

-- AlterTable
ALTER TABLE "MemberTrait" ALTER COLUMN "teamId" SET NOT NULL;

-- AlterTable
ALTER TABLE "MemberChange" ALTER COLUMN "teamId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Responsibility" ALTER COLUMN "teamId" SET NOT NULL;

-- AlterTable
ALTER TABLE "MemberResponsibility" ALTER COLUMN "teamId" SET NOT NULL;

-- AlterTable
ALTER TABLE "MentorshipLink" ALTER COLUMN "teamId" SET NOT NULL;

-- AlterTable
ALTER TABLE "DailyParticipant" ALTER COLUMN "teamId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Agreement" ALTER COLUMN "teamId" SET NOT NULL;

-- AlterTable
ALTER TABLE "AgreementParticipant" ALTER COLUMN "teamId" SET NOT NULL;

-- AlterTable
ALTER TABLE "BlockerReason" ALTER COLUMN "teamId" SET NOT NULL;

-- AlterTable
ALTER TABLE "AgreementCheckin" ALTER COLUMN "teamId" SET NOT NULL;

-- AlterTable
ALTER TABLE "OneOnOne" ALTER COLUMN "teamId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Feedback" ALTER COLUMN "teamId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Note" ALTER COLUMN "teamId" SET NOT NULL;

-- AlterTable
ALTER TABLE "PriorityLevel" ALTER COLUMN "teamId" SET NOT NULL;

-- AlterTable
ALTER TABLE "ReclassificationReason" ALTER COLUMN "teamId" SET NOT NULL;

-- AlterTable
ALTER TABLE "TicketUrlPattern" ALTER COLUMN "teamId" SET NOT NULL;

-- AlterTable
ALTER TABLE "PriorityValidation" ALTER COLUMN "teamId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Central" ALTER COLUMN "teamId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Competency" ALTER COLUMN "teamId" SET NOT NULL;

-- AlterTable
ALTER TABLE "CompetencyExpectation" ALTER COLUMN "teamId" SET NOT NULL;

-- AlterTable
ALTER TABLE "MemberCompetency" ALTER COLUMN "teamId" SET NOT NULL;

-- AlterTable
ALTER TABLE "DevelopmentPlan" ALTER COLUMN "teamId" SET NOT NULL;

-- AlterTable
ALTER TABLE "DevelopmentAction" ALTER COLUMN "teamId" SET NOT NULL;

-- AlterTable
ALTER TABLE "MetricDefinition" ALTER COLUMN "teamId" SET NOT NULL;

-- AlterTable
ALTER TABLE "MetricResult" ALTER COLUMN "teamId" SET NOT NULL;

-- AlterTable
ALTER TABLE "ScoreDefinition" ALTER COLUMN "teamId" SET NOT NULL;

-- AlterTable
ALTER TABLE "ScoreComponent" ALTER COLUMN "teamId" SET NOT NULL;

-- AlterTable
ALTER TABLE "ScoreResult" ALTER COLUMN "teamId" SET NOT NULL;

-- AlterTable
ALTER TABLE "ScoreResultComponent" ALTER COLUMN "teamId" SET NOT NULL;

-- AlterTable
ALTER TABLE "TimelineEvent" ALTER COLUMN "teamId" SET NOT NULL;

-- AlterTable
ALTER TABLE "DevReturnReason" ALTER COLUMN "teamId" SET NOT NULL;

-- AlterTable
ALTER TABLE "DevReturn" ALTER COLUMN "teamId" SET NOT NULL;

-- AlterTable
ALTER TABLE "WatchItem" ALTER COLUMN "teamId" SET NOT NULL;

-- AlterTable
ALTER TABLE "WatchReview" ALTER COLUMN "teamId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Team_organizationId_slug_key" ON "Team"("organizationId", "slug");

-- CreateIndex
CREATE INDEX "AuditLog_teamId_at_idx" ON "AuditLog"("teamId", "at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Seniority_teamId_key_key" ON "Seniority"("teamId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Seniority_teamId_order_key" ON "Seniority"("teamId", "order");

-- CreateIndex
CREATE INDEX "MemberTrait_teamId_memberId_kind_isActive_idx" ON "MemberTrait"("teamId", "memberId", "kind", "isActive");

-- CreateIndex
CREATE INDEX "MemberChange_teamId_memberId_effectiveAt_idx" ON "MemberChange"("teamId", "memberId", "effectiveAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Responsibility_teamId_name_key" ON "Responsibility"("teamId", "name");

-- CreateIndex
CREATE INDEX "MemberResponsibility_teamId_responsibilityId_idx" ON "MemberResponsibility"("teamId", "responsibilityId");

-- CreateIndex
CREATE INDEX "MentorshipLink_teamId_mentorMemberId_idx" ON "MentorshipLink"("teamId", "mentorMemberId");

-- CreateIndex
CREATE INDEX "DailyParticipant_teamId_memberId_idx" ON "DailyParticipant"("teamId", "memberId");

-- CreateIndex
CREATE INDEX "Agreement_teamId_memberId_originalDueDate_idx" ON "Agreement"("teamId", "memberId", "originalDueDate");

-- CreateIndex
CREATE INDEX "Agreement_teamId_status_dueDate_idx" ON "Agreement"("teamId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "AgreementParticipant_teamId_memberId_idx" ON "AgreementParticipant"("teamId", "memberId");

-- CreateIndex
CREATE INDEX "BlockerReason_teamId_order_idx" ON "BlockerReason"("teamId", "order");

-- CreateIndex
CREATE INDEX "AgreementCheckin_teamId_agreementId_createdAt_idx" ON "AgreementCheckin"("teamId", "agreementId", "createdAt");

-- CreateIndex
CREATE INDEX "OneOnOne_teamId_memberId_date_idx" ON "OneOnOne"("teamId", "memberId", "date" DESC);

-- CreateIndex
CREATE INDEX "Feedback_teamId_memberId_date_idx" ON "Feedback"("teamId", "memberId", "date" DESC);

-- CreateIndex
CREATE INDEX "Note_teamId_memberId_occurredAt_idx" ON "Note"("teamId", "memberId", "occurredAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "PriorityLevel_teamId_key_key" ON "PriorityLevel"("teamId", "key");

-- CreateIndex
CREATE INDEX "ReclassificationReason_teamId_order_idx" ON "ReclassificationReason"("teamId", "order");

-- CreateIndex
CREATE INDEX "TicketUrlPattern_teamId_order_idx" ON "TicketUrlPattern"("teamId", "order");

-- CreateIndex
CREATE INDEX "PriorityValidation_teamId_validatedAt_idx" ON "PriorityValidation"("teamId", "validatedAt");

-- CreateIndex
CREATE INDEX "Central_teamId_isActive_idx" ON "Central"("teamId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Central_teamId_slug_key" ON "Central"("teamId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Competency_teamId_name_key" ON "Competency"("teamId", "name");

-- CreateIndex
CREATE INDEX "CompetencyExpectation_teamId_idx" ON "CompetencyExpectation"("teamId");

-- CreateIndex
CREATE INDEX "MemberCompetency_teamId_competencyId_idx" ON "MemberCompetency"("teamId", "competencyId");

-- CreateIndex
CREATE INDEX "DevelopmentPlan_teamId_memberId_status_idx" ON "DevelopmentPlan"("teamId", "memberId", "status");

-- CreateIndex
CREATE INDEX "DevelopmentAction_teamId_planId_idx" ON "DevelopmentAction"("teamId", "planId");

-- CreateIndex
CREATE UNIQUE INDEX "MetricDefinition_teamId_key_key" ON "MetricDefinition"("teamId", "key");

-- CreateIndex
CREATE INDEX "MetricResult_teamId_metricDefinitionId_periodStart_idx" ON "MetricResult"("teamId", "metricDefinitionId", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "ScoreDefinition_teamId_name_version_key" ON "ScoreDefinition"("teamId", "name", "version");

-- CreateIndex
CREATE INDEX "ScoreComponent_teamId_idx" ON "ScoreComponent"("teamId");

-- CreateIndex
CREATE INDEX "ScoreResult_teamId_memberId_periodStart_idx" ON "ScoreResult"("teamId", "memberId", "periodStart");

-- CreateIndex
CREATE INDEX "ScoreResultComponent_teamId_idx" ON "ScoreResultComponent"("teamId");

-- CreateIndex
CREATE INDEX "TimelineEvent_teamId_memberId_occurredAt_idx" ON "TimelineEvent"("teamId", "memberId", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "DevReturnReason_teamId_order_idx" ON "DevReturnReason"("teamId", "order");

-- CreateIndex
CREATE INDEX "DevReturn_teamId_returnedAt_idx" ON "DevReturn"("teamId", "returnedAt");

-- CreateIndex
CREATE INDEX "WatchItem_teamId_status_heat_idx" ON "WatchItem"("teamId", "status", "heat");

-- CreateIndex
CREATE INDEX "WatchReview_teamId_watchItemId_reviewedAt_idx" ON "WatchReview"("teamId", "watchItemId", "reviewedAt");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertThreshold" ADD CONSTRAINT "AlertThreshold_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Seniority" ADD CONSTRAINT "Seniority_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberTrait" ADD CONSTRAINT "MemberTrait_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberChange" ADD CONSTRAINT "MemberChange_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Responsibility" ADD CONSTRAINT "Responsibility_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberResponsibility" ADD CONSTRAINT "MemberResponsibility_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MentorshipLink" ADD CONSTRAINT "MentorshipLink_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyParticipant" ADD CONSTRAINT "DailyParticipant_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgreementParticipant" ADD CONSTRAINT "AgreementParticipant_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockerReason" ADD CONSTRAINT "BlockerReason_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgreementCheckin" ADD CONSTRAINT "AgreementCheckin_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OneOnOne" ADD CONSTRAINT "OneOnOne_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriorityLevel" ADD CONSTRAINT "PriorityLevel_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReclassificationReason" ADD CONSTRAINT "ReclassificationReason_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketUrlPattern" ADD CONSTRAINT "TicketUrlPattern_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriorityValidation" ADD CONSTRAINT "PriorityValidation_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Central" ADD CONSTRAINT "Central_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Competency" ADD CONSTRAINT "Competency_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetencyExpectation" ADD CONSTRAINT "CompetencyExpectation_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberCompetency" ADD CONSTRAINT "MemberCompetency_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevelopmentPlan" ADD CONSTRAINT "DevelopmentPlan_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevelopmentAction" ADD CONSTRAINT "DevelopmentAction_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetricDefinition" ADD CONSTRAINT "MetricDefinition_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetricResult" ADD CONSTRAINT "MetricResult_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreDefinition" ADD CONSTRAINT "ScoreDefinition_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreComponent" ADD CONSTRAINT "ScoreComponent_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreResult" ADD CONSTRAINT "ScoreResult_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreResultComponent" ADD CONSTRAINT "ScoreResultComponent_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevReturnReason" ADD CONSTRAINT "DevReturnReason_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevReturn" ADD CONSTRAINT "DevReturn_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchItem" ADD CONSTRAINT "WatchItem_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchReview" ADD CONSTRAINT "WatchReview_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
