# Staff CMS or member LIFF app: built once, served by nginx, which also forwards /api to the API.
# Build from the repository root:
#   docker build -f deploy/web.Dockerfile --build-arg APP=cms  -t getpoint-cms .
#   docker build -f deploy/web.Dockerfile --build-arg APP=liff -t getpoint-liff .
FROM node:24-bookworm-slim AS build
ARG APP
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/cms/package.json apps/cms/
COPY apps/liff/package.json apps/liff/
RUN test "$APP" = cms -o "$APP" = liff \
  && npm ci -w "@getpoint/$APP" -w @getpoint/shared --include-workspace-root --ignore-scripts

COPY packages/shared packages/shared
COPY apps/$APP apps/$APP
RUN npm run build -w "@getpoint/$APP"

FROM nginx:1.27-alpine
ARG APP
COPY deploy/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY deploy/nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/apps/$APP/dist /usr/share/nginx/html
EXPOSE 80
