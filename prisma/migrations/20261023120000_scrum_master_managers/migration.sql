-- C20: gestores no sorteio de scrum master. Aditiva (D23): coluna nova com padrão, memberId passa a aceitar nulo (sorteio de gestor) e CHECK de exatamente um sorteado.

-- AlterTable
ALTER TABLE "TeamAccess" ADD COLUMN     "inScrumMasterDraw" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ScrumMasterDraw" ADD COLUMN     "participantName" TEXT,
ADD COLUMN     "userId" TEXT,
ALTER COLUMN "memberId" DROP NOT NULL;


-- Um sorteio aponta para uma pessoa do time OU para um gestor participante, nunca os dois nem nenhum.
ALTER TABLE "ScrumMasterDraw" ADD CONSTRAINT "ScrumMasterDraw_one_winner_check" CHECK (("memberId" IS NOT NULL) <> ("userId" IS NOT NULL));
