-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'MANAGER', 'VIEWER');

-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('PRIVATE', 'SHARED');

-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('ACTIVE', 'ON_LEAVE', 'OFFBOARDING', 'INACTIVE');

-- CreateEnum
CREATE TYPE "TraitKind" AS ENUM ('STRENGTH', 'DEVELOPMENT');

-- CreateEnum
CREATE TYPE "MemberChangeType" AS ENUM ('SENIORITY', 'POSITION', 'STATUS', 'RESPONSIBILITY');

-- CreateEnum
CREATE TYPE "AgreementOrigin" AS ENUM ('DAILY', 'ONE_ON_ONE', 'FEEDBACK', 'MEETING', 'INCIDENT', 'MANAGER', 'OTHER');

-- CreateEnum
CREATE TYPE "AgreementPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH');

-- CreateEnum
CREATE TYPE "AgreementStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BlockerCategory" AS ENUM ('EXTERNAL', 'INTERNAL', 'CAPACITY');

-- CreateEnum
CREATE TYPE "CheckinOutcome" AS ENUM ('DONE', 'PARTIAL', 'NOT_DONE');

-- CreateEnum
CREATE TYPE "FeedbackCategory" AS ENUM ('RECOGNITION', 'DEVELOPMENT', 'BEHAVIOR', 'TECHNICAL', 'PERFORMANCE', 'FORMAL');

-- CreateEnum
CREATE TYPE "ValidationOutcome" AS ENUM ('MAINTAINED', 'RAISED', 'LOWERED', 'RETURNED');

-- CreateEnum
CREATE TYPE "DevelopmentPlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ActionOwnerType" AS ENUM ('MEMBER', 'MANAGER', 'MENTOR');

-- CreateEnum
CREATE TYPE "DevelopmentActionStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MetricDirection" AS ENUM ('HIGHER_IS_BETTER', 'LOWER_IS_BETTER');

-- CreateEnum
CREATE TYPE "TimelineEventType" AS ENUM ('DAILY', 'FEEDBACK', 'ONE_ON_ONE', 'RECOGNITION', 'INCIDENT', 'AGREEMENT', 'AGREEMENT_DONE', 'ROLE_CHANGE', 'SENIORITY_CHANGE', 'DEVELOPMENT', 'NOTE');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "image" TEXT,
    "role" "Role" NOT NULL,
    "organizationId" TEXT NOT NULL,
    "passwordHash" TEXT,
    "passwordUpdatedAt" TIMESTAMPTZ,
    "lastLoginAt" TIMESTAMPTZ,
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "managerUserId" TEXT NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Seniority" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "Seniority_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMember" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "preferredName" TEXT NOT NULL,
    "email" TEXT,
    "position" TEXT NOT NULL,
    "seniorityId" TEXT NOT NULL,
    "joinedAt" DATE NOT NULL,
    "status" "MemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "avatarSeed" TEXT NOT NULL,
    "managerSummary" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "deletedAt" TIMESTAMPTZ,

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberTrait" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "kind" "TraitKind" NOT NULL,
    "text" TEXT NOT NULL,
    "observedAt" DATE NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "MemberTrait_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberChange" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "changeType" "MemberChangeType" NOT NULL,
    "fromValue" TEXT,
    "toValue" TEXT NOT NULL,
    "effectiveAt" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,

    CONSTRAINT "MemberChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Responsibility" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "Responsibility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberResponsibility" (
    "memberId" TEXT NOT NULL,
    "responsibilityId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "assignedAt" DATE NOT NULL,
    "endedAt" DATE,

    CONSTRAINT "MemberResponsibility_pkey" PRIMARY KEY ("memberId","responsibilityId","assignedAt")
);

-- CreateTable
CREATE TABLE "MentorshipLink" (
    "id" TEXT NOT NULL,
    "mentorMemberId" TEXT NOT NULL,
    "menteeMemberId" TEXT NOT NULL,
    "competencyId" TEXT,
    "startedAt" DATE NOT NULL,
    "endedAt" DATE,
    "note" TEXT,

    CONSTRAINT "MentorshipLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Daily" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "summary" TEXT,
    "decisions" TEXT,
    "authorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyParticipant" (
    "dailyId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "present" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "blocker" TEXT,

    CONSTRAINT "DailyParticipant_pkey" PRIMARY KEY ("dailyId","memberId")
);

-- CreateTable
CREATE TABLE "Agreement" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "origin" "AgreementOrigin" NOT NULL,
    "sourceDailyId" TEXT,
    "sourceOneOnOneId" TEXT,
    "sourceFeedbackId" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "originalDueDate" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "priority" "AgreementPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "AgreementStatus" NOT NULL DEFAULT 'OPEN',
    "completedAt" DATE,
    "outcome" TEXT,
    "managerNote" TEXT,
    "replacesAgreementId" TEXT,
    "authorUserId" TEXT NOT NULL,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "deletedAt" TIMESTAMPTZ,

    CONSTRAINT "Agreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgreementParticipant" (
    "agreementId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,

    CONSTRAINT "AgreementParticipant_pkey" PRIMARY KEY ("agreementId","memberId")
);

-- CreateTable
CREATE TABLE "BlockerReason" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category" "BlockerCategory" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL,

    CONSTRAINT "BlockerReason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgreementCheckin" (
    "id" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "dailyId" TEXT NOT NULL,
    "outcome" "CheckinOutcome" NOT NULL,
    "blockerText" TEXT,
    "blockerReasonId" TEXT,
    "newDueDate" DATE,
    "authorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgreementCheckin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OneOnOne" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "durationMinutes" INTEGER,
    "topics" TEXT,
    "memberPerception" TEXT,
    "managerPerception" TEXT,
    "wins" TEXT,
    "difficulties" TEXT,
    "development" TEXT,
    "nextReviewAt" DATE,
    "visibility" "Visibility" NOT NULL DEFAULT 'PRIVATE',
    "authorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "deletedAt" TIMESTAMPTZ,

    CONSTRAINT "OneOnOne_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "category" "FeedbackCategory" NOT NULL,
    "context" TEXT,
    "behavior" TEXT NOT NULL,
    "impact" TEXT,
    "guidance" TEXT,
    "followUpAt" DATE,
    "visibility" "Visibility" NOT NULL DEFAULT 'PRIVATE',
    "authorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "deletedAt" TIMESTAMPTZ,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "occurredAt" TIMESTAMPTZ NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "visibility" "Visibility" NOT NULL DEFAULT 'PRIVATE',
    "authorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "deletedAt" TIMESTAMPTZ,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriorityLevel" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "color" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PriorityLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReclassificationReason" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL,

    CONSTRAINT "ReclassificationReason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketUrlPattern" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "regex" TEXT NOT NULL,
    "captureGroup" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL,

    CONSTRAINT "TicketUrlPattern_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriorityValidation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ticketUrl" TEXT NOT NULL,
    "ticketRef" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "analystPriorityId" TEXT NOT NULL,
    "supervisorPriorityId" TEXT,
    "analystRankSnapshot" INTEGER NOT NULL,
    "supervisorRankSnapshot" INTEGER,
    "outcome" "ValidationOutcome" NOT NULL,
    "reasonId" TEXT,
    "reasonOther" TEXT,
    "note" TEXT,
    "validatedAt" TIMESTAMPTZ NOT NULL,
    "validatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "deletedAt" TIMESTAMPTZ,

    CONSTRAINT "PriorityValidation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Competency" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Competency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetencyExpectation" (
    "competencyId" TEXT NOT NULL,
    "seniorityId" TEXT NOT NULL,
    "expectedLevel" INTEGER NOT NULL,
    "descriptor" TEXT,

    CONSTRAINT "CompetencyExpectation_pkey" PRIMARY KEY ("competencyId","seniorityId")
);

-- CreateTable
CREATE TABLE "MemberCompetency" (
    "memberId" TEXT NOT NULL,
    "competencyId" TEXT NOT NULL,
    "currentLevel" INTEGER NOT NULL,
    "targetLevel" INTEGER,
    "assessedAt" DATE NOT NULL,
    "evidence" TEXT,

    CONSTRAINT "MemberCompetency_pkey" PRIMARY KEY ("memberId","competencyId")
);

-- CreateTable
CREATE TABLE "DevelopmentPlan" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "competencyId" TEXT,
    "currentSituation" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "expectedEvidence" TEXT,
    "status" "DevelopmentPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "startedAt" DATE NOT NULL,
    "dueDate" DATE,
    "completedAt" DATE,
    "progressNote" TEXT,
    "lastReviewedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "deletedAt" TIMESTAMPTZ,

    CONSTRAINT "DevelopmentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DevelopmentAction" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "ownerType" "ActionOwnerType" NOT NULL,
    "ownerMemberId" TEXT,
    "dueDate" DATE,
    "status" "DevelopmentActionStatus" NOT NULL DEFAULT 'OPEN',
    "completedAt" DATE,
    "followUpNote" TEXT,

    CONSTRAINT "DevelopmentAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetricDefinition" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "unit" TEXT,
    "direction" "MetricDirection" NOT NULL,
    "sourceSystem" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "MetricDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetricResult" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "metricDefinitionId" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "importedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceRef" TEXT,

    CONSTRAINT "MetricResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoreDefinition" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScoreDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoreComponent" (
    "scoreDefinitionId" TEXT NOT NULL,
    "metricDefinitionId" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "normalizationMin" DOUBLE PRECISION NOT NULL,
    "normalizationMax" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ScoreComponent_pkey" PRIMARY KEY ("scoreDefinitionId","metricDefinitionId")
);

-- CreateTable
CREATE TABLE "ScoreResult" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "scoreDefinitionId" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "computedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScoreResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoreResultComponent" (
    "scoreResultId" TEXT NOT NULL,
    "metricDefinitionId" TEXT NOT NULL,
    "rawValue" DOUBLE PRECISION NOT NULL,
    "normalizedValue" DOUBLE PRECISION NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "contribution" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ScoreResultComponent_pkey" PRIMARY KEY ("scoreResultId","metricDefinitionId")
);

-- CreateTable
CREATE TABLE "TimelineEvent" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "occurredAt" TIMESTAMPTZ NOT NULL,
    "type" "TimelineEventType" NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "authorUserId" TEXT NOT NULL,
    "visibility" "Visibility" NOT NULL DEFAULT 'PRIVATE',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "agreementId" TEXT,
    "oneOnOneId" TEXT,
    "feedbackId" TEXT,
    "dailyId" TEXT,
    "noteId" TEXT,
    "developmentPlanId" TEXT,
    "memberChangeId" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimelineEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");

-- CreateIndex
CREATE INDEX "Team_organizationId_idx" ON "Team"("organizationId");

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_at_idx" ON "AuditLog"("organizationId", "at" DESC);

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_at_idx" ON "AuditLog"("userId", "at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Seniority_organizationId_key_key" ON "Seniority"("organizationId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Seniority_organizationId_order_key" ON "Seniority"("organizationId", "order");

-- CreateIndex
CREATE INDEX "TeamMember_teamId_status_idx" ON "TeamMember"("teamId", "status");

-- CreateIndex
CREATE INDEX "TeamMember_seniorityId_idx" ON "TeamMember"("seniorityId");

-- CreateIndex
CREATE INDEX "MemberTrait_memberId_kind_isActive_idx" ON "MemberTrait"("memberId", "kind", "isActive");

-- CreateIndex
CREATE INDEX "MemberChange_memberId_effectiveAt_idx" ON "MemberChange"("memberId", "effectiveAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Responsibility_organizationId_name_key" ON "Responsibility"("organizationId", "name");

-- CreateIndex
CREATE INDEX "MemberResponsibility_responsibilityId_idx" ON "MemberResponsibility"("responsibilityId");

-- CreateIndex
CREATE INDEX "MentorshipLink_mentorMemberId_idx" ON "MentorshipLink"("mentorMemberId");

-- CreateIndex
CREATE INDEX "MentorshipLink_menteeMemberId_idx" ON "MentorshipLink"("menteeMemberId");

-- CreateIndex
CREATE INDEX "Daily_teamId_date_idx" ON "Daily"("teamId", "date" DESC);

-- CreateIndex
CREATE INDEX "DailyParticipant_memberId_idx" ON "DailyParticipant"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "Agreement_replacesAgreementId_key" ON "Agreement"("replacesAgreementId");

-- CreateIndex
CREATE INDEX "Agreement_memberId_originalDueDate_idx" ON "Agreement"("memberId", "originalDueDate");

-- CreateIndex
CREATE INDEX "Agreement_status_dueDate_idx" ON "Agreement"("status", "dueDate");

-- CreateIndex
CREATE INDEX "Agreement_sourceDailyId_idx" ON "Agreement"("sourceDailyId");

-- CreateIndex
CREATE INDEX "AgreementParticipant_memberId_idx" ON "AgreementParticipant"("memberId");

-- CreateIndex
CREATE INDEX "BlockerReason_organizationId_order_idx" ON "BlockerReason"("organizationId", "order");

-- CreateIndex
CREATE INDEX "AgreementCheckin_agreementId_createdAt_idx" ON "AgreementCheckin"("agreementId", "createdAt");

-- CreateIndex
CREATE INDEX "AgreementCheckin_dailyId_idx" ON "AgreementCheckin"("dailyId");

-- CreateIndex
CREATE INDEX "OneOnOne_memberId_date_idx" ON "OneOnOne"("memberId", "date" DESC);

-- CreateIndex
CREATE INDEX "Feedback_memberId_date_idx" ON "Feedback"("memberId", "date" DESC);

-- CreateIndex
CREATE INDEX "Feedback_followUpAt_idx" ON "Feedback"("followUpAt");

-- CreateIndex
CREATE INDEX "Note_memberId_occurredAt_idx" ON "Note"("memberId", "occurredAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "PriorityLevel_organizationId_key_key" ON "PriorityLevel"("organizationId", "key");

-- CreateIndex
CREATE INDEX "ReclassificationReason_organizationId_order_idx" ON "ReclassificationReason"("organizationId", "order");

-- CreateIndex
CREATE INDEX "TicketUrlPattern_organizationId_order_idx" ON "TicketUrlPattern"("organizationId", "order");

-- CreateIndex
CREATE INDEX "PriorityValidation_organizationId_validatedAt_idx" ON "PriorityValidation"("organizationId", "validatedAt");

-- CreateIndex
CREATE INDEX "PriorityValidation_memberId_validatedAt_idx" ON "PriorityValidation"("memberId", "validatedAt");

-- CreateIndex
CREATE INDEX "PriorityValidation_reasonId_idx" ON "PriorityValidation"("reasonId");

-- CreateIndex
CREATE INDEX "PriorityValidation_outcome_validatedAt_idx" ON "PriorityValidation"("outcome", "validatedAt");

-- CreateIndex
CREATE INDEX "PriorityValidation_ticketRef_idx" ON "PriorityValidation"("ticketRef");

-- CreateIndex
CREATE UNIQUE INDEX "Competency_organizationId_name_key" ON "Competency"("organizationId", "name");

-- CreateIndex
CREATE INDEX "MemberCompetency_competencyId_idx" ON "MemberCompetency"("competencyId");

-- CreateIndex
CREATE INDEX "DevelopmentPlan_memberId_status_idx" ON "DevelopmentPlan"("memberId", "status");

-- CreateIndex
CREATE INDEX "DevelopmentPlan_status_lastReviewedAt_idx" ON "DevelopmentPlan"("status", "lastReviewedAt");

-- CreateIndex
CREATE INDEX "DevelopmentAction_planId_idx" ON "DevelopmentAction"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "MetricDefinition_organizationId_key_key" ON "MetricDefinition"("organizationId", "key");

-- CreateIndex
CREATE INDEX "MetricResult_metricDefinitionId_periodStart_idx" ON "MetricResult"("metricDefinitionId", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "MetricResult_memberId_metricDefinitionId_periodStart_period_key" ON "MetricResult"("memberId", "metricDefinitionId", "periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "ScoreDefinition_organizationId_name_version_key" ON "ScoreDefinition"("organizationId", "name", "version");

-- CreateIndex
CREATE INDEX "ScoreResult_memberId_periodStart_idx" ON "ScoreResult"("memberId", "periodStart");

-- CreateIndex
CREATE INDEX "TimelineEvent_memberId_occurredAt_idx" ON "TimelineEvent"("memberId", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "TimelineEvent_type_idx" ON "TimelineEvent"("type");

-- CreateIndex
CREATE INDEX "TimelineEvent_agreementId_idx" ON "TimelineEvent"("agreementId");

-- CreateIndex
CREATE INDEX "TimelineEvent_oneOnOneId_idx" ON "TimelineEvent"("oneOnOneId");

-- CreateIndex
CREATE INDEX "TimelineEvent_feedbackId_idx" ON "TimelineEvent"("feedbackId");

-- CreateIndex
CREATE INDEX "TimelineEvent_noteId_idx" ON "TimelineEvent"("noteId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_managerUserId_fkey" FOREIGN KEY ("managerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Seniority" ADD CONSTRAINT "Seniority_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_seniorityId_fkey" FOREIGN KEY ("seniorityId") REFERENCES "Seniority"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberTrait" ADD CONSTRAINT "MemberTrait_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "TeamMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberChange" ADD CONSTRAINT "MemberChange_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "TeamMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberChange" ADD CONSTRAINT "MemberChange_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Responsibility" ADD CONSTRAINT "Responsibility_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberResponsibility" ADD CONSTRAINT "MemberResponsibility_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "TeamMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberResponsibility" ADD CONSTRAINT "MemberResponsibility_responsibilityId_fkey" FOREIGN KEY ("responsibilityId") REFERENCES "Responsibility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MentorshipLink" ADD CONSTRAINT "MentorshipLink_mentorMemberId_fkey" FOREIGN KEY ("mentorMemberId") REFERENCES "TeamMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MentorshipLink" ADD CONSTRAINT "MentorshipLink_menteeMemberId_fkey" FOREIGN KEY ("menteeMemberId") REFERENCES "TeamMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MentorshipLink" ADD CONSTRAINT "MentorshipLink_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Daily" ADD CONSTRAINT "Daily_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Daily" ADD CONSTRAINT "Daily_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyParticipant" ADD CONSTRAINT "DailyParticipant_dailyId_fkey" FOREIGN KEY ("dailyId") REFERENCES "Daily"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyParticipant" ADD CONSTRAINT "DailyParticipant_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "TeamMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "TeamMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_sourceDailyId_fkey" FOREIGN KEY ("sourceDailyId") REFERENCES "Daily"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_sourceOneOnOneId_fkey" FOREIGN KEY ("sourceOneOnOneId") REFERENCES "OneOnOne"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_sourceFeedbackId_fkey" FOREIGN KEY ("sourceFeedbackId") REFERENCES "Feedback"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_replacesAgreementId_fkey" FOREIGN KEY ("replacesAgreementId") REFERENCES "Agreement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgreementParticipant" ADD CONSTRAINT "AgreementParticipant_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "Agreement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgreementParticipant" ADD CONSTRAINT "AgreementParticipant_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "TeamMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockerReason" ADD CONSTRAINT "BlockerReason_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgreementCheckin" ADD CONSTRAINT "AgreementCheckin_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "Agreement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgreementCheckin" ADD CONSTRAINT "AgreementCheckin_dailyId_fkey" FOREIGN KEY ("dailyId") REFERENCES "Daily"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgreementCheckin" ADD CONSTRAINT "AgreementCheckin_blockerReasonId_fkey" FOREIGN KEY ("blockerReasonId") REFERENCES "BlockerReason"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgreementCheckin" ADD CONSTRAINT "AgreementCheckin_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OneOnOne" ADD CONSTRAINT "OneOnOne_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "TeamMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OneOnOne" ADD CONSTRAINT "OneOnOne_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "TeamMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "TeamMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriorityLevel" ADD CONSTRAINT "PriorityLevel_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReclassificationReason" ADD CONSTRAINT "ReclassificationReason_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketUrlPattern" ADD CONSTRAINT "TicketUrlPattern_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriorityValidation" ADD CONSTRAINT "PriorityValidation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriorityValidation" ADD CONSTRAINT "PriorityValidation_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "TeamMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriorityValidation" ADD CONSTRAINT "PriorityValidation_analystPriorityId_fkey" FOREIGN KEY ("analystPriorityId") REFERENCES "PriorityLevel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriorityValidation" ADD CONSTRAINT "PriorityValidation_supervisorPriorityId_fkey" FOREIGN KEY ("supervisorPriorityId") REFERENCES "PriorityLevel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriorityValidation" ADD CONSTRAINT "PriorityValidation_reasonId_fkey" FOREIGN KEY ("reasonId") REFERENCES "ReclassificationReason"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriorityValidation" ADD CONSTRAINT "PriorityValidation_validatedByUserId_fkey" FOREIGN KEY ("validatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Competency" ADD CONSTRAINT "Competency_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetencyExpectation" ADD CONSTRAINT "CompetencyExpectation_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetencyExpectation" ADD CONSTRAINT "CompetencyExpectation_seniorityId_fkey" FOREIGN KEY ("seniorityId") REFERENCES "Seniority"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberCompetency" ADD CONSTRAINT "MemberCompetency_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "TeamMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberCompetency" ADD CONSTRAINT "MemberCompetency_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevelopmentPlan" ADD CONSTRAINT "DevelopmentPlan_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "TeamMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevelopmentPlan" ADD CONSTRAINT "DevelopmentPlan_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevelopmentAction" ADD CONSTRAINT "DevelopmentAction_planId_fkey" FOREIGN KEY ("planId") REFERENCES "DevelopmentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevelopmentAction" ADD CONSTRAINT "DevelopmentAction_ownerMemberId_fkey" FOREIGN KEY ("ownerMemberId") REFERENCES "TeamMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetricDefinition" ADD CONSTRAINT "MetricDefinition_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetricResult" ADD CONSTRAINT "MetricResult_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "TeamMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetricResult" ADD CONSTRAINT "MetricResult_metricDefinitionId_fkey" FOREIGN KEY ("metricDefinitionId") REFERENCES "MetricDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreDefinition" ADD CONSTRAINT "ScoreDefinition_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreComponent" ADD CONSTRAINT "ScoreComponent_scoreDefinitionId_fkey" FOREIGN KEY ("scoreDefinitionId") REFERENCES "ScoreDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreComponent" ADD CONSTRAINT "ScoreComponent_metricDefinitionId_fkey" FOREIGN KEY ("metricDefinitionId") REFERENCES "MetricDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreResult" ADD CONSTRAINT "ScoreResult_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "TeamMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreResult" ADD CONSTRAINT "ScoreResult_scoreDefinitionId_fkey" FOREIGN KEY ("scoreDefinitionId") REFERENCES "ScoreDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreResultComponent" ADD CONSTRAINT "ScoreResultComponent_scoreResultId_fkey" FOREIGN KEY ("scoreResultId") REFERENCES "ScoreResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreResultComponent" ADD CONSTRAINT "ScoreResultComponent_metricDefinitionId_fkey" FOREIGN KEY ("metricDefinitionId") REFERENCES "MetricDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "TeamMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "Agreement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_oneOnOneId_fkey" FOREIGN KEY ("oneOnOneId") REFERENCES "OneOnOne"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "Feedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_dailyId_fkey" FOREIGN KEY ("dailyId") REFERENCES "Daily"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_developmentPlanId_fkey" FOREIGN KEY ("developmentPlanId") REFERENCES "DevelopmentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_memberChangeId_fkey" FOREIGN KEY ("memberChangeId") REFERENCES "MemberChange"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ═════════════════════════════════════════════════════════════════════════
-- SQL manual: regras que o schema.prisma não consegue expressar.
-- ═════════════════════════════════════════════════════════════════════════

-- PriorityValidation (D14): reasonId obrigatório quando o resultado não é
-- MAINTAINED. Também validado no zod; o banco é a última barreira.
ALTER TABLE "PriorityValidation"
  ADD CONSTRAINT "PriorityValidation_reason_required_check"
  CHECK ("outcome" = 'MAINTAINED' OR "reasonId" IS NOT NULL);

-- PriorityValidation: fora de RETURNED, a prioridade validada e o rank do
-- momento são obrigatórios. RETURNED dispensa os dois.
ALTER TABLE "PriorityValidation"
  ADD CONSTRAINT "PriorityValidation_supervisor_required_check"
  CHECK (
    "outcome" = 'RETURNED'
    OR ("supervisorPriorityId" IS NOT NULL AND "supervisorRankSnapshot" IS NOT NULL)
  );

-- PriorityValidation: o resultado persistido tem de ser coerente com os ranks
-- gravados no mesmo registro. RETURNED é ação explícita, não derivada de ranks.
ALTER TABLE "PriorityValidation"
  ADD CONSTRAINT "PriorityValidation_outcome_consistency_check"
  CHECK (
    "outcome" = 'RETURNED'
    OR ("outcome" = 'MAINTAINED' AND "supervisorRankSnapshot" = "analystRankSnapshot")
    OR ("outcome" = 'RAISED' AND "supervisorRankSnapshot" > "analystRankSnapshot")
    OR ("outcome" = 'LOWERED' AND "supervisorRankSnapshot" < "analystRankSnapshot")
  );

-- AgreementCheckin (D11): revisão parcial ou não feita exige o impeditivo
-- descrito, não vazio.
ALTER TABLE "AgreementCheckin"
  ADD CONSTRAINT "AgreementCheckin_blocker_required_check"
  CHECK ("outcome" = 'DONE' OR ("blockerText" IS NOT NULL AND length(btrim("blockerText")) > 0));

-- MentorshipLink: ninguém mentora a si mesmo.
ALTER TABLE "MentorshipLink"
  ADD CONSTRAINT "MentorshipLink_distinct_members_check"
  CHECK ("mentorMemberId" <> "menteeMemberId");

-- MetricResult: cobertura nunca negativa ("Número sem cobertura é mentira").
ALTER TABLE "MetricResult"
  ADD CONSTRAINT "MetricResult_sample_size_check"
  CHECK ("sampleSize" >= 0);

-- TimelineEvent.tags: text[] nativo com índice GIN (filtro por tag sem tabela).
CREATE INDEX "TimelineEvent_tags_idx" ON "TimelineEvent" USING GIN ("tags");

-- Agreement.originalDueDate (D17): gravado na criação e NUNCA alterado, nem por
-- reagendamento. Sem isso, todo combinado arrastado pareceria cumprido no prazo.
CREATE FUNCTION "agreement_original_due_date_immutable"() RETURNS trigger AS $$
BEGIN
  IF NEW."originalDueDate" IS DISTINCT FROM OLD."originalDueDate" THEN
    RAISE EXCEPTION 'Agreement.originalDueDate é imutável (D17): % → %',
      OLD."originalDueDate", NEW."originalDueDate"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Agreement_original_due_date_immutable"
  BEFORE UPDATE OF "originalDueDate" ON "Agreement"
  FOR EACH ROW EXECUTE FUNCTION "agreement_original_due_date_immutable"();
