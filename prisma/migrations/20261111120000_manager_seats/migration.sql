-- C25: gestores recebem combinados. Coluna nova e nula em TeamMember (D23): nenhuma linha
-- existente muda; os lugares de gestor são criados pelo app (ensureManagerSeats).
ALTER TABLE "TeamMember" ADD COLUMN "managerUserId" TEXT;

ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_managerUserId_fkey"
  FOREIGN KEY ("managerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "TeamMember_teamId_managerUserId_key" ON "TeamMember"("teamId", "managerUserId");

-- Lugar de gestor nunca é login do portal (D37/D38).
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_manager_seat_no_login"
  CHECK ("managerUserId" IS NULL OR "userId" IS NULL);
