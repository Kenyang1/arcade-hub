# 1. Use Node.js as the base image
FROM node:22-alpine AS build

# 2. Set the working directory
WORKDIR /arcade-hub

# Enable Corepack.
RUN corepack enable

# Copy workspace config.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy web API and contract package files..
COPY api/package.json ./api/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy the web API's source code
COPY api/ ./api/
COPY packages/contracts/ ./packages/contracts/

# Build the web API
RUN pnpm --dir api build

#
# Stage 2: Production dependencies
#

FROM node:22-alpine AS production-dependencies

WORKDIR /arcade-hub

RUN corepack enable

# Copy workspace config.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy web API and contract package files..
COPY api/package.json ./api/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json

RUN pnpm install --prod --frozen-lockfile

#
# Stage 3: Run the web API
#

FROM node:22-alpine AS production

WORKDIR /arcade-hub

ENV NODE_ENV=production

COPY --from=production-dependencies /arcade-hub/node_modules ./node_modules
COPY --from=production-dependencies /arcade-hub/api/node_modules ./api/node_modules

COPY --from=build /arcade-hub/api/package.json ./api/package.json
COPY --from=build /arcade-hub/api/dist ./api/dist

EXPOSE 5080

CMD ["node", "api/dist/server.js"]
