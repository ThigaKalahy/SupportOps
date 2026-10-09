-- P22 · B — BACKFILL, determinístico (D30, D33).
-- Existe exatamente um time (T). Todo dado existente é dele. Nada é inventado:
-- - T recebe slug 'suporte' e isActive true;
-- - toda linha das entidades de dado de time recebe teamId = T.id;
-- - User OWNER: isPlatformAdmin = true + TeamAccess MANAGER em T;
--   User MANAGER: TeamAccess MANAGER; User VIEWER: TeamAccess VIEWER
--   (grantedByUserId nulo = concedido por esta migration);
-- - TeamModule em T: PRIORITY_VALIDATION, DEV_RETURNS e CENTRALS ligados.
-- Falha com erro explícito se houver outro número de times ou se sobrar teamId nulo.
-- AuditLog.teamId fica nulo no histórico: login e scripts não têm time.

DO $$
DECLARE
  t_id   TEXT;
  t_org  TEXT;
  n      INT;
  tbl    TEXT;
  tables TEXT[] := ARRAY[
    'Seniority',
    'Competency',
    'CompetencyExpectation',
    'Responsibility',
    'BlockerReason',
    'Central',
    'TicketUrlPattern',
    'PriorityLevel',
    'ReclassificationReason',
    'DevReturnReason',
    'MetricDefinition',
    'ScoreDefinition',
    'WatchItem',
    'AlertThreshold',
    'Agreement',
    'OneOnOne',
    'Feedback',
    'Note',
    'TimelineEvent',
    'DevelopmentPlan',
    'MemberChange',
    'MentorshipLink',
    'MemberCompetency',
    'AgreementCheckin',
    'PriorityValidation',
    'DevReturn',
    'MemberTrait',
    'MemberResponsibility',
    'DailyParticipant',
    'AgreementParticipant',
    'WatchReview',
    'DevelopmentAction',
    'ScoreComponent',
    'MetricResult',
    'ScoreResult',
    'ScoreResultComponent'
  ];
BEGIN
  SELECT count(*) INTO n FROM "Team";
  IF n <> 1 THEN
    RAISE EXCEPTION 'P22 backfill: esperava exatamente 1 time, encontrou %', n;
  END IF;
  SELECT "id", "organizationId" INTO t_id, t_org FROM "Team";

  UPDATE "Team" SET "slug" = 'suporte', "isActive" = true WHERE "id" = t_id;

  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('UPDATE %I SET "teamId" = $1 WHERE "teamId" IS NULL', tbl) USING t_id;
  END LOOP;

  UPDATE "User" SET "isPlatformAdmin" = true WHERE "role" = 'OWNER' AND "organizationId" = t_org;

  INSERT INTO "TeamAccess" ("id", "userId", "teamId", "level")
  SELECT 'p22_access_' || u."id", u."id", t_id,
         CASE WHEN u."role" = 'VIEWER' THEN 'VIEWER' ELSE 'MANAGER' END::"TeamAccessLevel"
  FROM "User" u
  WHERE u."organizationId" = t_org
  ON CONFLICT ("userId", "teamId") DO NOTHING;

  INSERT INTO "TeamModule" ("id", "teamId", "moduleKey", "isEnabled")
  SELECT 'p22_module_' || k, t_id, k, true
  FROM unnest(ARRAY['PRIORITY_VALIDATION', 'DEV_RETURNS', 'CENTRALS']) AS k
  ON CONFLICT ("teamId", "moduleKey") DO NOTHING;

  -- Verificação: nenhuma linha pode ficar sem time.
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('SELECT count(*) FROM %I WHERE "teamId" IS NULL', tbl) INTO n;
    IF n > 0 THEN
      RAISE EXCEPTION 'P22 backfill: % linha(s) de "%" ficaram sem teamId', n, tbl;
    END IF;
  END LOOP;
  SELECT count(*) INTO n FROM "Team" WHERE "slug" IS NULL;
  IF n > 0 THEN
    RAISE EXCEPTION 'P22 backfill: time sem slug';
  END IF;
END $$;
