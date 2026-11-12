-- Device classes for the internet details modal. Facts come from the device
-- names and the existing hardware categories, not from invented specs.
UPDATE devices_master SET specs = json_set(specs, '$.device_class', 'cpe')
  WHERE id IN ('d12', 'd13', 'd14', 'd15', 'd16', 'd17', 'd22');

UPDATE devices_master SET specs = json_set(specs, '$.device_class', 'router')
  WHERE id IN ('d5', 'd18', 'd19', 'd23', 'd24');

UPDATE devices_master SET specs = json_set(specs, '$.device_class', 'satellite')
  WHERE id IN ('d20', 'd21');

UPDATE devices_master SET specs = json_set(specs, '$.device_class', 'enterprise_router')
  WHERE id = 'd25';
