#!/bin/sh
set -eu

if ! command -v postgres >/dev/null 2>&1; then
	apk add --no-cache postgresql17 postgresql17-client
fi

mkdir -p /run/postgresql
chown postgres:postgres /run/postgresql /var/lib/postgresql/data

if [ ! -s /var/lib/postgresql/data/PG_VERSION ]; then
	printf 'postgres' > /tmp/pgpass
	su postgres -c 'initdb -D /var/lib/postgresql/data --username=postgres --pwfile=/tmp/pgpass'
	rm /tmp/pgpass
	echo "listen_addresses = '*'" >> /var/lib/postgresql/data/postgresql.conf
	printf 'host all all all scram-sha-256\n' >> /var/lib/postgresql/data/pg_hba.conf
fi

su postgres -c 'pg_ctl -D /var/lib/postgresql/data -w start'
su postgres -c 'createdb sharkey_clean' || true
su postgres -c 'pg_ctl -D /var/lib/postgresql/data -m fast -w stop'
exec su postgres -c 'postgres -D /var/lib/postgresql/data'
