FROM node:22-slim@sha256:d415caac2f1f77b98caaf9415c5f807e14bc8d7bdea62561ea2fef4fbd08a73c AS build

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

FROM node:22-slim@sha256:d415caac2f1f77b98caaf9415c5f807e14bc8d7bdea62561ea2fef4fbd08a73c AS runtime

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY --from=build --chown=node:node /app/dist dist
COPY --chown=node:node server.entry.js .
COPY --chown=node:node specs ./specs
COPY --chown=node:node migrations ./migrations
RUN mkdir -p data && chown node:node data

EXPOSE 3000

USER node

CMD ["node", "server.entry.js"]
