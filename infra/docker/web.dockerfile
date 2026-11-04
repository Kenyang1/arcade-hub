#
# Stage 1: Build the webapp
#

FROM node:22-alpine AS build

WORKDIR /app

# Enable Corepack.
RUN corepack enable

# Copy workspace config.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy webapp config.
COPY web/package.json ./web/

# Install dependencies, including devDependencies
RUN pnpm install --frozen-lockfile --prod=false

# Copy the webapp's source code
COPY web/ ./web/

# Build React application
RUN pnpm --dir web build

#
# Stage 2: Run the webapp
#

# Production stage
#FROM nginx:alpine

#COPY --from=build /app/dist /usr/share/nginx/html

#EXPOSE 80