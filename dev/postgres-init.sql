-- Runs once on first startup of the postgres volume (docker-entrypoint-initdb.d).
-- Zitadel connects with a DSN and requires its database to already exist.
CREATE DATABASE zitadel;
