FROM node:18-alpine

WORKDIR /app

# Copy backend and install dependencies
COPY backend/package*.json ./backend/
RUN cd backend && npm install --production

# Copy backend source
COPY backend/ ./backend/

# Copy frontend files
COPY "Main Pages/" "./Main Pages/"
COPY Novice/ ./Novice/
COPY Intermediate/ ./Intermediate/
COPY Expert/ ./Expert/

EXPOSE 3000

WORKDIR /app/backend
CMD ["node", "server.js"]
