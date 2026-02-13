FROM node:18-bullseye AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY . .
RUN npm run build

FROM node:18-bullseye AS runtime
WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY --from=builder /app/build ./build
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/public ./public
COPY --from=builder /app/config ./config
COPY --from=builder /app/db ./db
COPY --from=builder /app/helpers ./helpers
COPY --from=builder /app/routes ./routes
COPY --from=builder /app/middleware ./middleware
RUN mkdir -p uploads/notice-attachments uploads/task-attachments uploads/ticket-attachments

EXPOSE 5000

CMD ["node", "server.js"]