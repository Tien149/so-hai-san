#!/bin/sh
# Chạy kiểm thử RLS trên Postgres cục bộ: sh supabase/tests/run.sh
set -e
DB=qhs_test
su postgres -c "dropdb --if-exists $DB && createdb $DB"
D=$(cd "$(dirname "$0")/.." && pwd)
su postgres -c "psql -q -v ON_ERROR_STOP=1 -d $DB -f $D/tests/stub_auth.sql"
for f in $D/migrations/*.sql; do su postgres -c "psql -q -v ON_ERROR_STOP=1 -d $DB -f $f"; done
su postgres -c "psql -d $DB -f $D/tests/rls_test.sql"
