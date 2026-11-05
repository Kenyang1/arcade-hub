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

# Download the pinned EmulatorJS build into web/public/emulatorjs
RUN pnpm --dir web emulator:fetch

# Build React application
RUN pnpm --dir web build

#
# Stage 2: Run the webapp
#

FROM nginx:1.29-alpine AS production

# Remove default Nginx configuration
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom Nginx configuration
COPY infra/nginx/nginx.conf /etc/nginx/conf.d/default.conf

# Copy React production build
COPY --from=build /arcade-hub/web/dist /usr/share/nginx/html

# Expose HTTP port
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
