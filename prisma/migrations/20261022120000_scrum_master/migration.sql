-- C19: scrum master da daily (D46). Aditiva: tabela e enum novos, nada existente muda (D23).

warn The configuration property `package.json#prisma` is deprecated and will be removed in Prisma 7. Please migrate to a Prisma config file (e.g., `prisma.config.ts`).
For more information, see: https://pris.ly/prisma-config

-- CreateEnum
CREATE TYPE "ScrumMasterDrawMethod" AS ENUM ('ROULETTE', 'AUTO');

-- CreateTable
CREATE TABLE "ScrumMasterDraw" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "memberId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "method" "ScrumMasterDrawMethod" NOT NULL,
    "drawnByUserId" TEXT,
    "skippedAt" TIMESTAMPTZ,
    "skippedByUserId" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScrumMasterDraw_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScrumMasterDraw_teamId_date_idx" ON "ScrumMasterDraw"("teamId", "date");

-- CreateIndex
CREATE INDEX "ScrumMasterDraw_teamId_round_idx" ON "ScrumMasterDraw"("teamId", "round");

-- AddForeignKey
ALTER TABLE "ScrumMasterDraw" ADD CONSTRAINT "ScrumMasterDraw_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrumMasterDraw" ADD CONSTRAINT "ScrumMasterDraw_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "TeamMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Um sorteio VÁLIDO por time e data: o pulado (a pessoa faltou) não conta; dois giros ao mesmo tempo ficam com um só.
CREATE UNIQUE INDEX "ScrumMasterDraw_active_teamId_date_key" ON "ScrumMasterDraw"("teamId", "date") WHERE "skippedAt" IS NULL;
