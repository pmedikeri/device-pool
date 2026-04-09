#!/bin/sh
# Clean up E2E test data from the database
# Run after Playwright tests: ./scripts/cleanup-test-data.sh

cd "$(dirname "$0")/.."

echo "Cleaning E2E test data..."

docker compose exec -T postgres psql -U devicepool -d devicepool -c "
DELETE FROM sessions WHERE \"deviceId\" IN (SELECT id FROM devices WHERE \"ipAddress\" IN ('10.0.0.1','10.99.0.1'));
DELETE FROM reservations WHERE \"deviceId\" IN (SELECT id FROM devices WHERE \"ipAddress\" IN ('10.0.0.1','10.99.0.1'));
DELETE FROM device_heartbeats WHERE \"deviceId\" IN (SELECT id FROM devices WHERE \"ipAddress\" IN ('10.0.0.1','10.99.0.1'));
DELETE FROM device_access_methods WHERE \"deviceId\" IN (SELECT id FROM devices WHERE \"ipAddress\" IN ('10.0.0.1','10.99.0.1'));
DELETE FROM device_capabilities WHERE \"deviceId\" IN (SELECT id FROM devices WHERE \"ipAddress\" IN ('10.0.0.1','10.99.0.1'));
DELETE FROM maintenance_windows WHERE \"deviceId\" IN (SELECT id FROM devices WHERE \"ipAddress\" IN ('10.0.0.1','10.99.0.1'));
UPDATE enrollment_tokens SET \"deviceId\" = NULL WHERE \"deviceId\" IN (SELECT id FROM devices WHERE \"ipAddress\" IN ('10.0.0.1','10.99.0.1'));
DELETE FROM devices WHERE \"ipAddress\" IN ('10.0.0.1','10.99.0.1');
DELETE FROM enrollment_tokens WHERE \"createdByUserId\" IN (SELECT id FROM users WHERE email LIKE '%1775%' OR email LIKE 'e2e%' OR email LIKE 'edge%' OR email LIKE 'conn%' OR email LIKE 'res%' OR email LIKE 'devmgmt%' OR email LIKE 'enroll%' OR email LIKE 'sshkey%');
DELETE FROM users WHERE email LIKE '%1775%' OR email LIKE 'e2e%' OR email LIKE 'edge%' OR email LIKE 'conn%' OR email LIKE 'res%' OR email LIKE 'devmgmt%' OR email LIKE 'enroll%' OR email LIKE 'sshkey%' OR email LIKE 'newuser%' OR email LIKE 'repeatuser%' OR email LIKE 'casetest%' OR email LIKE 'uitest%' OR email LIKE 'cleanup%';
SELECT 'Remaining: ' || count(*) || ' devices, ' || (SELECT count(*) FROM users) || ' users' FROM devices;
"

echo "Done!"
