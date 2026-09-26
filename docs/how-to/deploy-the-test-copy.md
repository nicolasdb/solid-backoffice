# Deploy the test copy (test.nicolasdb.eu)

`claude/*` branches are work in progress, tried locally with `npm run dev`.
When a change needs a check online (a phone, a real origin for invitation
links), push it to the `dev` branch: CI checks it and deploys it to
<https://test.nicolasdb.eu>. Production (`backoffice.nicolasdb.eu`) is not
deployed by CI; it is still `make vps-deploy` from a laptop.

## Every time

```bash
git push origin HEAD:dev        # from the branch you want to try online
```

Then watch the run: `gh run watch` (from `dropbox-container`), or the
repository's Actions tab. The `deploy-test` job only runs on `dev`, after
`verify` and `pods` pass.

CI copies `dist/` only. After a change to `docker-compose.yml` or
`deploy/nginx-site.conf`, push them by hand:

```bash
make vps-deploy TARGET=test
```

## How it is wired

- **On the server:** `/home/nicolas/solid-backoffice-test/`, container
  `solid-backoffice-test-web` on the `gateway` network, beside production
  (`/home/nicolas/solid-backoffice/`, `solid-backoffice-web`). `make vps-push`
  writes the `.env` that gives the container its name and domain.
- **The deploy key** can only write into the test copy's `dist/`. Its line in
  the server's `authorized_keys` is
  `restrict,command="rrsync -wo /home/nicolas/solid-backoffice-test/dist" ssh-ed25519 …`:
  no shell, no other folder, no reading back.
- **GitHub, environment `test`:** secrets `TEST_DEPLOY_KEY` (the private key)
  and `TEST_KNOWN_HOSTS` (the server's host key, so CI refuses an impostor);
  variable `DEPLOY_HOST` (`128.140.72.105`).
- **The gateway** proxies `test.nicolasdb.eu` to the container:
  `deploy/gateway-16-test.conf`, installed in `hetzner-gateway` as
  `nginx/conf.d/16-test.conf`, with a dedicated certificate.
- **No secret in the build.** Everything in `dist/` is public; the deploy key
  is the only secret, and it lives in GitHub.

## Set it up once

### 1. The test copy on the server

```bash
make vps-deploy TARGET=test
```

### 2. The deploy key

Run on the laptop (the private key never touches the disk outside `$D`, and
goes to GitHub through `gh` in `dropbox-container`):

```bash
D=$(mktemp -d) && ssh-keygen -q -t ed25519 -N "" -C "github-actions solid-backoffice test deploy" -f $D/key
ssh hetzner "cp ~/.ssh/authorized_keys ~/.ssh/authorized_keys.bak && echo 'restrict,command=\"rrsync -wo /home/nicolas/solid-backoffice-test/dist\" $(cat $D/key.pub)' >> ~/.ssh/authorized_keys"
ssh-keyscan -t ed25519 128.140.72.105 > $D/known_hosts
distrobox enter dropbox-container -- sh -c "cd $PWD && gh secret set TEST_DEPLOY_KEY --env test < $D/key && gh secret set TEST_KNOWN_HOSTS --env test < $D/known_hosts && gh variable set DEPLOY_HOST --env test --body 128.140.72.105"
rm -rf $D
```

`gh secret set --env test` needs the `test` environment to exist; create it
first if it does not:
`distrobox enter dropbox-container -- gh api -X PUT repos/nicolasdb/solid-backoffice/environments/test`.

Check the restriction holds: `ssh -i <key> root@128.140.72.105 id` must fail
(before deleting `$D`), and a CI run must succeed.

### 3. The gateway entry

The certificate does not exist yet, and nginx refuses a config that names a
missing one — which would stop every site's reload. So in three steps, from
`hetzner-gateway` (installed as a single file, like `14-sportr.conf` and
`15-dashboard.conf`, not by `make vps-push`):

```bash
cp ../solid-backoffice/deploy/gateway-16-test.conf nginx/conf.d/16-test.conf
# 1. port 80 only, for the ACME challenge
awk '/^server \{/{n++} n==1' nginx/conf.d/16-test.conf | ssh hetzner "cat > /home/nicolas/hetzner-gateway/nginx/conf.d/16-test.conf"
ssh hetzner "docker exec nginx-gateway nginx -t && docker exec nginx-gateway nginx -s reload"
# 2. the certificate
ssh hetzner "certbot certonly --webroot -w /var/www/certbot -d test.nicolasdb.eu"
# 3. the whole file
scp nginx/conf.d/16-test.conf hetzner:/home/nicolas/hetzner-gateway/nginx/conf.d/16-test.conf
ssh hetzner "docker exec nginx-gateway nginx -t && docker exec nginx-gateway nginx -s reload"
curl -sI https://test.nicolasdb.eu | head -1
```

Then add the line to `services-registry.md` and commit `16-test.conf` in
`hetzner-gateway`.

### 4. The `dev` branch

```bash
git push origin HEAD:dev
```
