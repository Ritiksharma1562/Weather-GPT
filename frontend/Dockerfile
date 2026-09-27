FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
ARG BACKEND_URL=http://backend:8000
ARG NEXT_PUBLIC_WS_URL=ws://127.0.0.1:8000/ws/live
ENV BACKEND_URL=$BACKEND_URL NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL NEXT_TELEMETRY_DISABLED=1
RUN npm run build
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S -g 1001 weather && adduser -S -u 1001 -G weather weather
COPY --from=build --chown=weather:weather /app/.next/standalone ./
COPY --from=build --chown=weather:weather /app/.next/static ./.next/static
COPY --from=build --chown=weather:weather /app/public ./public
USER weather
EXPOSE 3000
CMD ["node", "server.js"]
