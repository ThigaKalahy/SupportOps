-- P25: identidade do colaborador e portal somente leitura (D37–D45). ADITIVA (D23):
-- tipos e valores de enum novos, colunas nuláveis ou com padrão, tabelas novas vazias.
-- Daily_teamId_date_key reforça no banco a regra de uma daily por data (C10);
-- conferido antes que não há duplicatas em produção.

-- CreateEnum
CREATE TYPE "DailyStatus" AS ENUM ('DRAFT', 'CLOSED');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DISCARDED');

-- AlterEnum
ALTER TYPE "AgreementOrigin" ADD VALUE 'MEMBER';

-- AlterEnum
ALTER TYPE "TeamAccessLevel" ADD VALUE 'MEMBER';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "TeamMember" ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "Daily" ADD COLUMN     "openedAt" TIMESTAMPTZ,
ADD COLUMN     "openedByUserId" TEXT,
ADD COLUMN     "status" "DailyStatus" NOT NULL DEFAULT 'CLOSED';

-- AlterTable
ALTER TABLE "AgreementCheckin" ADD COLUMN     "divergedFromSelfReport" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "selfReportId" TEXT;

-- CreateTable
CREATE TABLE "AgreementSelfReport" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "outcome" "CheckinOutcome" NOT NULL,
    "blockerText" TEXT,
    "blockerReasonId" TEXT,
    "suggestedDueDate" DATE,
    "dailyId" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "AgreementSelfReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberProposal" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "suggestedDueDate" DATE,
    "note" TEXT,
    "dailyId" TEXT,
    "status" "ProposalStatus" NOT NULL DEFAULT 'PENDING',
    "resolvedAgreementId" TEXT,
    "managerNote" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "MemberProposal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgreementSelfReport_teamId_memberId_dailyId_idx" ON "AgreementSelfReport"("teamId", "memberId", "dailyId");

-- CreateIndex
CREATE INDEX "AgreementSelfReport_agreementId_idx" ON "AgreementSelfReport"("agreementId");

-- CreateIndex
CREATE INDEX "MemberProposal_teamId_memberId_status_idx" ON "MemberProposal"("teamId", "memberId", "status");

-- CreateIndex
CREATE INDEX "MemberProposal_dailyId_idx" ON "MemberProposal"("dailyId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMember_userId_key" ON "TeamMember"("userId");

-- CreateIndex
CREATE INDEX "TeamMember_userId_idx" ON "TeamMember"("userId");

-- CreateIndex
CREATE INDEX "Daily_teamId_status_idx" ON "Daily"("teamId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Daily_teamId_date_key" ON "Daily"("teamId", "date");

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Daily" ADD CONSTRAINT "Daily_openedByUserId_fkey" FOREIGN KEY ("openedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgreementCheckin" ADD CONSTRAINT "AgreementCheckin_selfReportId_fkey" FOREIGN KEY ("selfReportId") REFERENCES "AgreementSelfReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgreementSelfReport" ADD CONSTRAINT "AgreementSelfReport_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgreementSelfReport" ADD CONSTRAINT "AgreementSelfReport_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "TeamMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgreementSelfReport" ADD CONSTRAINT "AgreementSelfReport_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "Agreement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgreementSelfReport" ADD CONSTRAINT "AgreementSelfReport_blockerReasonId_fkey" FOREIGN KEY ("blockerReasonId") REFERENCES "BlockerReason"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgreementSelfReport" ADD CONSTRAINT "AgreementSelfReport_dailyId_fkey" FOREIGN KEY ("dailyId") REFERENCES "Daily"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberProposal" ADD CONSTRAINT "MemberProposal_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberProposal" ADD CONSTRAINT "MemberProposal_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "TeamMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberProposal" ADD CONSTRAINT "MemberProposal_dailyId_fkey" FOREIGN KEY ("dailyId") REFERENCES "Daily"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberProposal" ADD CONSTRAINT "MemberProposal_resolvedAgreementId_fkey" FOREIGN KEY ("resolvedAgreementId") REFERENCES "Agreement"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Um único relato PENDENTE por combinado (dailyId nulo = ainda não capturado por nenhuma daily).
CREATE UNIQUE INDEX "AgreementSelfReport_pending_agreementId_key" ON "AgreementSelfReport"("agreementId") WHERE "dailyId" IS NULL;
