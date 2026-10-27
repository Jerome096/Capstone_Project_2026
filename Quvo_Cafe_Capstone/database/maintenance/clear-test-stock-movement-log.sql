-- Quvo Cafe: clear displayed pre-opening stock movement history.
-- Keeps the ledger rows required for unchanged stock quantities and payment retries.
-- First upload/extract the accompanying runtime ZIP, then run this in SQL Studio.
-- Preview first; change @Commit to 1 to apply. Safe to retry.
-- Cutoff: 28 October 2026 at 02:59:21 Philippine time; later movements remain visible.
SET NOCOUNT ON;
SET XACT_ABORT ON;
DECLARE @Commit bit = 0;
DECLARE @Cutoff datetime2(0) = '2026-10-27T18:59:21';
BEGIN TRY
 BEGIN TRANSACTION;
 DECLARE @Lock int;
 EXEC @Lock=sys.sp_getapplock @Resource='QuvoInventory',@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=10000;
 IF @Lock<0 THROW 51000,'Inventory is busy. Stop staff stock/order activity and retry.',1;
 IF OBJECT_ID('dbo.inventory_movements') IS NULL OR OBJECT_ID('dbo.system_audit_log') IS NULL
  THROW 51000,'Wrong database or missing inventory setup. No history changed.',1;
 DECLARE @Actor int=(SELECT MIN(s.staff_id) FROM dbo.staff_users s JOIN dbo.roles r ON r.role_id=s.role_id WHERE r.role_name='Admin' AND s.is_active=1);
 IF @Actor IS NULL THROW 51000,'An active admin account is required.',1;
 SELECT m.movement_id INTO #ArchiveMovements
 FROM dbo.inventory_movements m WITH(TABLOCKX,HOLDLOCK)
 WHERE m.recorded_at<=@Cutoff AND NOT EXISTS(
  SELECT 1 FROM dbo.system_audit_log a WHERE a.entity_type='inventory_movement'
  AND a.action='inventory_movement_archived' AND a.entity_key=CONVERT(nvarchar(100),m.movement_id));
 INSERT dbo.system_audit_log(actor_staff_id,action,entity_type,entity_key,details_json)
 SELECT @Actor,'inventory_movement_archived','inventory_movement',CONVERT(nvarchar(100),movement_id),
  N'{"reason":"Pre-opening test movement history cleared","stockBalanceRetained":true}'
 FROM #ArchiveMovements;
 SELECT (SELECT COUNT(*) FROM #ArchiveMovements) archived_log_entries,
  (SELECT COUNT(*) FROM dbo.inventory_movements m WHERE NOT EXISTS(
    SELECT 1 FROM dbo.system_audit_log a WHERE a.entity_type='inventory_movement'
    AND a.action='inventory_movement_archived' AND a.entity_key=CONVERT(nvarchar(100),m.movement_id))) remaining_visible_entries,
  CAST(1 AS bit) stock_quantities_preserved,@Commit applied;
 DROP TABLE #ArchiveMovements;
 IF @Commit=1 COMMIT TRANSACTION; ELSE ROLLBACK TRANSACTION;
END TRY
BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
 THROW;
END CATCH;
