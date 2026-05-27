# Sharkey Migration Data Locations

Last updated: 2026-05-26

## Servers

- Old/source server: `64.118.155.189`
- New/current server: `152.53.167.211`
- Current production domain: `https://dc.hhhl.cc/`
- Temporary migration domain used before cutover: `https://temp.hhhl.cc/`

## Source Server Data

### Sharkey Application

- Main app directory: `/opt/sharkey`
- Config file: `/opt/sharkey/.config/default.yml`
- Current `/opt/sharkey/files` was empty during migration.
- Actual local upload files were found in an old deployment backup:
  - `/opt/sharkey.prev-latest/files`
  - Size at migration time: about `1.2G`
  - File count at migration time: `3819`

Important: do not assume `/opt/sharkey/files` is the only upload directory. Check old backup directories too:

- `/opt/sharkey.prev-*/files`
- `/opt/sharkey.before-*/files`
- `/opt/sharkey.deploy-old-*/files`

### PostgreSQL

- Database name: `sharkey`
- Database user: `sharkey`
- PostgreSQL runs locally on the server.
- Main data to migrate is the full `sharkey` database.

Use a custom-format dump:

```bash
sudo -u postgres pg_dump -Fc sharkey > /tmp/sharkey.dump
```

### Redis

- Redis runs locally on the server.
- Contains queues, timelines, cache, and other runtime state.
- During cutover, stop Sharkey first, then save/copy the Redis RDB if you want queue/cache continuity.

### Nginx

Relevant site config paths:

- `/etc/nginx/sites-available/dc.hhhl.cc`
- `/etc/nginx/sites-enabled/dc.hhhl.cc`
- `/etc/nginx/sites-available/temp.hhhl.cc`
- `/etc/nginx/sites-enabled/temp.hhhl.cc`

### TLS Certificates

Relevant Let's Encrypt paths:

- `/etc/letsencrypt/live/dc.hhhl.cc/`
- `/etc/letsencrypt/live/temp.hhhl.cc/`
- `/etc/letsencrypt/archive/`
- `/etc/letsencrypt/renewal/`

## New Server Data

### Sharkey Application

- App directory: `/opt/sharkey`
- Config file: `/opt/sharkey/.config/default.yml`
- Current configured URL: `https://dc.hhhl.cc/`
- Upload files directory: `/opt/sharkey/files`
- Uploaded files restored during migration:
  - About `1.2G`
  - `3819` files

### PostgreSQL

- Database name: `sharkey`
- Database user: `sharkey`
- PostgreSQL listens locally: `127.0.0.1:5432`

### Redis

- Redis listens locally: `127.0.0.1:6379`
- Old temporary-domain cache was cleared after cutover:
  - Pattern cleared: `temp.hhhl.cc:*`

### systemd

Service files:

- `/etc/systemd/system/sharkey.service`
- `/etc/systemd/system/sharkey.service.d/90-resource-allocation.conf`

Current runtime services:

- `sharkey`
- `nginx`
- `postgresql`
- `redis-server`

### Nginx

Relevant site config paths:

- `/etc/nginx/sites-available/dc.hhhl.cc`
- `/etc/nginx/sites-enabled/dc.hhhl.cc`
- `/etc/nginx/sites-available/temp.hhhl.cc`
- `/etc/nginx/sites-enabled/temp.hhhl.cc`
- `/etc/nginx/sites-available/00-reject-direct.conf`

### TLS Certificates

Relevant Let's Encrypt paths:

- `/etc/letsencrypt/live/dc.hhhl.cc/`
- `/etc/letsencrypt/live/temp.hhhl.cc/`
- `/etc/letsencrypt/archive/`
- `/etc/letsencrypt/renewal/`

### Cloudflare Direct-IP Protection

The new server has nftables rules limiting public 80/443 access to Cloudflare IP ranges.

- nftables table: `inet sharkey_edge`
- Purpose: only Cloudflare can reach ports `80` and `443`; direct non-Cloudflare access is dropped.

Check rules with:

```bash
nft list table inet sharkey_edge
```

## Cutover Checklist For Next Migration

1. Stop Sharkey on the source server before the final dump.

```bash
systemctl stop sharkey
```

2. Dump PostgreSQL.

```bash
sudo -u postgres pg_dump -Fc sharkey > /tmp/sharkey.dump
```

3. Save/copy Redis data if queue/cache continuity is needed.

```bash
redis-cli SAVE
cp /var/lib/redis/dump.rdb /tmp/redis-dump.rdb
```

4. Copy Sharkey config.

```bash
/opt/sharkey/.config/default.yml
```

5. Copy upload files.

First find the real file directory:

```bash
find /opt -maxdepth 3 -type d -name files -exec sh -c 'echo "$1"; find "$1" -type f | wc -l; du -sh "$1"' sh {} \;
```

In this migration, the real source was:

```bash
/opt/sharkey.prev-latest/files
```

Restore to the new server:

```bash
/opt/sharkey/files
```

6. Copy Nginx configs and Let's Encrypt certificates.

7. Restore PostgreSQL on the new server.

```bash
sudo -u postgres pg_restore -d sharkey --clean --if-exists /tmp/sharkey.dump
```

8. Restore Redis RDB if used.

9. Update `/opt/sharkey/.config/default.yml`.

Make sure:

```yaml
url: https://dc.hhhl.cc/
```

10. Clear old-domain Redis cache after domain cutover.

Example:

```bash
redis-cli --scan --pattern 'temp.hhhl.cc:*' | xargs -r redis-cli del
```

11. Start services.

```bash
systemctl daemon-reload
systemctl restart postgresql redis-server nginx sharkey
```

12. Verify the site.

```bash
systemctl is-active sharkey nginx postgresql redis-server
curl -sk https://dc.hhhl.cc/api/meta -H 'content-type: application/json' --data '{}'
curl -sk https://dc.hhhl.cc/api/notes/global-timeline -H 'content-type: application/json' --data '{"limit":5,"withFiles":false}'
```

Expected checks:

- `/api/meta` returns `https://dc.hhhl.cc`
- Latest timeline includes recent posts.
- File URLs under `/files/...` return HTTP 200.
- Old source Sharkey is stopped/disabled after cutover to avoid data split.

