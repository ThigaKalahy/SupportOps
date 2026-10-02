-- P11: motivo de reclassificação genérico ("Outro") exige texto livre.
ALTER TABLE "ReclassificationReason" ADD COLUMN "requiresDetail" BOOLEAN NOT NULL DEFAULT false;

UPDATE "ReclassificationReason" SET "requiresDetail" = true WHERE lower(btrim("label")) = 'outro';

-- PriorityValidation: com motivo que exige detalhe, reasonOther não pode ser
-- vazio. Também validado no zod; o banco é a última barreira. Trigger (e não
-- CHECK) porque a regra depende de outra tabela.
CREATE FUNCTION "PriorityValidation_reason_detail_check"() RETURNS trigger AS $$
BEGIN
  IF NEW."reasonId" IS NOT NULL
     AND EXISTS (SELECT 1 FROM "ReclassificationReason" r WHERE r."id" = NEW."reasonId" AND r."requiresDetail")
     AND (NEW."reasonOther" IS NULL OR length(btrim(NEW."reasonOther")) = 0) THEN
    RAISE EXCEPTION 'PriorityValidation: o motivo % exige reasonOther', NEW."reasonId"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PriorityValidation_reason_detail_trigger"
  BEFORE INSERT OR UPDATE OF "reasonId", "reasonOther" ON "PriorityValidation"
  FOR EACH ROW EXECUTE FUNCTION "PriorityValidation_reason_detail_check"();
