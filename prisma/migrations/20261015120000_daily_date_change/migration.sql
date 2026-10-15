-- C10: trocar a data de uma daily já salva (decisão do usuário em 15/10/2026).
-- Os combinados criados nela nasceram com o prazo igual à data errada da daily; ao
-- corrigir a data, o prazo original acompanha. É a ÚNICA exceção à D17, ligada só
-- dentro da transação da troca de data (set_config local, `true` = vale até o fim
-- da transação). Fora dela, o prazo original continua imutável.
CREATE OR REPLACE FUNCTION "agreement_original_due_date_immutable"() RETURNS trigger AS $$
BEGIN
  IF NEW."originalDueDate" IS DISTINCT FROM OLD."originalDueDate"
     AND coalesce(current_setting('prontuario.daily_date_change', true), '') <> 'on' THEN
    RAISE EXCEPTION 'Agreement.originalDueDate é imutável (D17): % → %',
      OLD."originalDueDate", NEW."originalDueDate"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
