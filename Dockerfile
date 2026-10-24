# The backoffice as one image (solid-kit ADR 011): the static build behind
# nginx, in the Solid Kit look. An instance runs it from instance-template/ and
# brings its own values beside it, at run time:
#   /instance.json   mounted: the login default, sign-up provider, upload limits
#   /skin.css        mounted, with its fonts at /fonts/skin/: the vertical's look
#   /id.jsonld       written at start from PUBLIC_URL (docker-entrypoint.d/)
# Nothing an instance sets is compiled in, so every instance runs the same tag.

FROM node:22-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.29-alpine
COPY deploy/nginx-site.conf /etc/nginx/conf.d/default.conf
COPY deploy/docker-entrypoint.d/40-client-id.sh /docker-entrypoint.d/
COPY --from=build /src/dist /usr/share/nginx/html
# 127.0.0.1, not localhost: busybox resolves localhost to ::1 first, and nginx
# here listens on IPv4 only, so the check failed on a healthy site.
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=5s \
  CMD wget -q --spider http://127.0.0.1/index.html || exit 1
