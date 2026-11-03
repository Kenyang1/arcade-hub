# 1. Use Node.js as the base image
FROM node:22-alpine

# 2. Set the working directory
WORKDIR /api

# 3. Copy package.json and package-lock.json
COPY ../../api/package*.json ./

# 4. Install dependencies
RUN npm install

# 5. Copy the remaining project files
COPY . .

# 6. Expose the application port
EXPOSE 3000

# 7. Start the application
CMD ["npm", "start"]