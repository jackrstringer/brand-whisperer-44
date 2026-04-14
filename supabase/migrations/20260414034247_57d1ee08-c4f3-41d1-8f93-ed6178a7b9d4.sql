UPDATE brand_profiles
SET processing_status = 'idle', processing_error = NULL,
    audit_findings = audit_findings - '_error' - '_status'
WHERE brand_id = (SELECT id FROM brands WHERE name ILIKE '%larine%' LIMIT 1);