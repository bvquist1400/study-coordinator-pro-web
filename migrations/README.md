Migration Notes

- This directory contains SQL migrations applied outside of a formal migration tool.
- Files are timestamp-prefixed for ordering and easy reference.
- These were moved from the repo root to reduce confusion and centralize schema changes.

How to apply locally

- Connect to your database and run the SQL files in order.
- All statements use IF NOT EXISTS where possible to be idempotent.

Files

- 20240901_add_ip_fields_migration.sql: Adds IP accountability fields to subject_visits and indexes.
- 20240901_add_return_ip_id_field.sql: Adds return_ip_id column and index to subject_visits.
