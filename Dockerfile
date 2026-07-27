# Production image for Railway — Directus 12.1.1 with hardened multi-stage build
ARG DIRECTUS_VERSION=12.1.1

# Stage 1: install npm extensions and patch host ranges for v12
FROM node:22-alpine AS extension-build

RUN corepack enable

WORKDIR /extension-build

RUN pnpm config set strictDepBuilds false

RUN echo '{"name":"extension-build","private":true}' > package.json \
	&& pnpm add \
		directus-extension-computed-interface@1.9.0 \
		directus-extension-upsert@1.0.5 \
		directus-extension-flexible-editor@1.8.4 \
		@directus-labs/simple-list-interface@1.0.0 \
		@directus-labs/migration-bundle@1.2.0 \
		directus-extension-sync@3.0.6 \
		@directus-labs/super-header-interface@1.2.0

COPY scripts/patch-extension-hosts.mjs ./scripts/patch-extension-hosts.mjs
RUN node ./scripts/patch-extension-hosts.mjs /extension-build/node_modules

# Stage 2: final hardened runtime
FROM directus/directus:${DIRECTUS_VERSION}

COPY --from=extension-build --chown=node:node /extension-build/node_modules/directus-extension-computed-interface /directus/extensions/directus-extension-computed-interface
COPY --from=extension-build --chown=node:node /extension-build/node_modules/directus-extension-upsert /directus/extensions/directus-extension-upsert
COPY --from=extension-build --chown=node:node /extension-build/node_modules/directus-extension-flexible-editor /directus/extensions/directus-extension-flexible-editor
COPY --from=extension-build --chown=node:node /extension-build/node_modules/@directus-labs/simple-list-interface /directus/extensions/directus-labs-simple-list-interface
COPY --from=extension-build --chown=node:node /extension-build/node_modules/@directus-labs/migration-bundle /directus/extensions/directus-labs-migration-bundle
COPY --from=extension-build --chown=node:node /extension-build/node_modules/directus-extension-sync /directus/extensions/directus-extension-sync
COPY --from=extension-build --chown=node:node /extension-build/node_modules/@directus-labs/super-header-interface /directus/extensions/directus-labs-super-header-interface

COPY --chown=node:node ./extensions/directus-extension-slugify-interface /directus/extensions/directus-extension-slugify-interface
COPY --chown=node:node ./extensions/directus-extension-hook-user-email-subjects /directus/extensions/directus-extension-hook-user-email-subjects
COPY --chown=node:node ./extensions/directus-extension-endpoint-krk-guide /directus/extensions/directus-extension-endpoint-krk-guide
COPY --chown=node:node ./extensions/directus-extension-push-notification /directus/extensions/directus-extension-push-notification
COPY --chown=node:node ./extensions/directus-extension-krk-tours /directus/extensions/directus-extension-krk-tours

COPY --chown=node:node ./templates /directus/templates
COPY --chown=node:node ./config.cjs /directus/config.cjs
COPY --chown=node:node ./entrypoint.sh /directus/entrypoint.sh

WORKDIR /directus

USER root
RUN chmod +x ./entrypoint.sh
USER node

ENTRYPOINT ["./entrypoint.sh"]
