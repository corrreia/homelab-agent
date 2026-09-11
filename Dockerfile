FROM node:22-slim@sha256:d415caac2f1f77b98caaf9415c5f807e14bc8d7bdea62561ea2fef4fbd08a73c AS build

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# Runtime dependencies, resolved separately so that pnpm, corepack and the pnpm store
# never reach the final image: `--node-linker=hoisted` writes a flat node_modules the
# runtime stage can copy wholesale, instead of a symlink farm over a virtual store.
FROM node:22-slim@sha256:d415caac2f1f77b98caaf9415c5f807e14bc8d7bdea62561ea2fef4fbd08a73c AS deps

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod --node-linker=hoisted

# Build tooling that @tanstack/react-start, better-auth and drizzle-orm declare as runtime
# dependencies but the built server never loads, plus the SQLite C sources that are only
# needed to compile better-sqlite3 (the prebuilt .node binary stays). Verified by booting
# the built server without them and exercising /, /api/spec and an MCP initialize; recheck
# after dependency upgrades, since a new version could start importing one of these lazily.
RUN rm -rf \
      node_modules/drizzle-kit \
      node_modules/prettier \
      node_modules/@babel \
      node_modules/@esbuild \
      node_modules/@esbuild-kit \
      node_modules/@rollup \
      node_modules/@types \
      node_modules/caniuse-lite \
      node_modules/esbuild \
      node_modules/lightningcss-linux-x64-gnu \
      node_modules/rollup \
      node_modules/tsx \
      node_modules/unplugin \
      node_modules/vite \
      node_modules/vitefu \
      node_modules/better-sqlite3/deps \
      node_modules/better-sqlite3/src

FROM node:22-slim@sha256:d415caac2f1f77b98caaf9415c5f807e14bc8d7bdea62561ea2fef4fbd08a73c AS runtime

WORKDIR /app

# package.json carries "type": "module", which server.entry.js needs to load as ESM.
COPY --chown=node:node package.json ./
COPY --from=deps --chown=node:node /app/node_modules node_modules
COPY --from=build --chown=node:node /app/dist dist
COPY --chown=node:node server.entry.js .
COPY --chown=node:node specs ./specs
COPY --chown=node:node migrations ./migrations
RUN mkdir -p data && chown node:node data

EXPOSE 3000

USER node

CMD ["node", "server.entry.js"]
