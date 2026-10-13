-- C7: vários combinados por observação. Aditiva (D23): coluna nula, índice e FK; nenhum dado existente muda.

-- AlterTable
ALTER TABLE "Agreement" ADD COLUMN "watchItemId" TEXT;

-- CreateIndex
CREATE INDEX "Agreement_teamId_watchItemId_idx" ON "Agreement"("teamId", "watchItemId");

-- AddForeignKey
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_watchItemId_fkey" FOREIGN KEY ("watchItemId") REFERENCES "WatchItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
