-- Internet device prices for the catalogue cards.
-- ALTER TABLE ADD COLUMN is not idempotent in D1; run once.
ALTER TABLE devices_master ADD COLUMN price REAL;

-- Prices mirror the matching hardware row (h_i_*) where one exists.
UPDATE devices_master SET price = 85000  WHERE id = 'd12'; -- Huawei B818-263  -> h_i_1
UPDATE devices_master SET price = 95000  WHERE id = 'd13'; -- ZTE MC888        -> h_i_2
UPDATE devices_master SET price = 120000 WHERE id = 'd14'; -- ZTE MC888 PRO    -> h_i_3
UPDATE devices_master SET price = 70000  WHERE id = 'd15'; -- Huawei CPE PRO 2 -> h_i_4
UPDATE devices_master SET price = 45000  WHERE id = 'd16'; -- Cudy LT500       -> h_i_5
UPDATE devices_master SET price = 75000  WHERE id = 'd18'; -- TP-Link ER605    -> h_i_6
UPDATE devices_master SET price = 90000  WHERE id = 'd19'; -- TP-Link ER7206   -> h_i_7
UPDATE devices_master SET price = 160000 WHERE id = 'd22'; -- GL.iNet Spitz AX -> h_i_8
UPDATE devices_master SET price = 75000  WHERE id = 'd23'; -- GL.iNet Slate AX -> h_i_9
UPDATE devices_master SET price = 35000  WHERE id = 'd24'; -- Cudy WR2100      -> h_i_10
UPDATE devices_master SET price = 350000 WHERE id = 'd25'; -- Pepwave MAX BR1  -> h_i_11
