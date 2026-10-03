-- CreateTable
CREATE TABLE "AlertThreshold" (
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "AlertThreshold_pkey" PRIMARY KEY ("organizationId","key")
);

-- AddForeignKey
ALTER TABLE "AlertThreshold" ADD CONSTRAINT "AlertThreshold_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Limiar é contagem de dias, pontos ou combinados: nunca negativo.
ALTER TABLE "AlertThreshold" ADD CONSTRAINT "AlertThreshold_value_check" CHECK ("value" >= 0);
