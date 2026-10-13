-- C4: troca de responsável de combinado e férias. Aditiva (D23): tipo de evento novo e duas tabelas novas, sem tocar dado existente.

-- AlterEnum
ALTER TYPE "TimelineEventType" ADD VALUE 'AGREEMENT_TRANSFER';

-- CreateTable
CREATE TABLE "AgreementTransfer" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "fromMemberId" TEXT NOT NULL,
    "toMemberId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "transferredAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "authorUserId" TEXT NOT NULL,

    CONSTRAINT "AgreementTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberVacation" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,

    CONSTRAINT "MemberVacation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgreementTransfer_teamId_agreementId_transferredAt_idx" ON "AgreementTransfer"("teamId", "agreementId", "transferredAt");

-- CreateIndex
CREATE INDEX "MemberVacation_teamId_memberId_startDate_idx" ON "MemberVacation"("teamId", "memberId", "startDate");

-- CreateIndex
CREATE INDEX "MemberVacation_teamId_endDate_idx" ON "MemberVacation"("teamId", "endDate");

-- AddForeignKey
ALTER TABLE "AgreementTransfer" ADD CONSTRAINT "AgreementTransfer_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "Agreement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgreementTransfer" ADD CONSTRAINT "AgreementTransfer_fromMemberId_fkey" FOREIGN KEY ("fromMemberId") REFERENCES "TeamMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgreementTransfer" ADD CONSTRAINT "AgreementTransfer_toMemberId_fkey" FOREIGN KEY ("toMemberId") REFERENCES "TeamMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgreementTransfer" ADD CONSTRAINT "AgreementTransfer_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgreementTransfer" ADD CONSTRAINT "AgreementTransfer_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberVacation" ADD CONSTRAINT "MemberVacation_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "TeamMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberVacation" ADD CONSTRAINT "MemberVacation_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberVacation" ADD CONSTRAINT "MemberVacation_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Regras no banco (o zod confere o mesmo na escrita).
ALTER TABLE "AgreementTransfer" ADD CONSTRAINT "AgreementTransfer_distinct_members" CHECK ("fromMemberId" <> "toMemberId");
ALTER TABLE "AgreementTransfer" ADD CONSTRAINT "AgreementTransfer_reason_not_blank" CHECK (length(btrim("reason")) > 0);
ALTER TABLE "MemberVacation" ADD CONSTRAINT "MemberVacation_end_after_start" CHECK ("endDate" >= "startDate");
