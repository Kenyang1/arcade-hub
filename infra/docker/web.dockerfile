#
# Stage 1: Build the webapp
#

FROM node:22-alpine AS build

WORKDIR /arcade-hub

# Enable Corepack.
RUN corepack enable

# Copy workspace config.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy webapp and web API config.
COPY web/package.json ./web/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy the webapp's source code
COPY web/ ./web/
COPY packages/contracts/ ./packages/contracts/

# Build React application
RUN pnpm --dir web build

#
# Stage 2: Run the webapp
#

# Production stage
#FROM nginx:alpine

#COPY --from=build /app/dist /usr/share/nginx/html

#EXPOSE 80