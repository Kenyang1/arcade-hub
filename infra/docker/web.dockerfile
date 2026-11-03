FROM node:22-alpine AS build

WORKDIR /web

# Copy package files
COPY ../../web/package.json ../../web/pnpm-lock.yaml ./

# Install pnpm
RUN corepack enable

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy the remaining React project files
COPY ../../web/ .

# Build React application
RUN pnpm build

# Production stage
FROM nginx:alpine

COPY --from=build /web/dist /usr/share/nginx/html

EXPOSE 80