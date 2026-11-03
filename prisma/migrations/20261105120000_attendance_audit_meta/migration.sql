-- C23 Fase C: metadados extraídos de cada conversa (coluna nova, nula — D23).
ALTER TABLE "AuditConversation" ADD COLUMN "meta" JSONB;
