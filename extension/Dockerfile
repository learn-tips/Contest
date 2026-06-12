FROM node:18-bullseye-slim AS build

WORKDIR /app

ARG VITE_APP_URL
ARG VITE_SERVER_URL
ENV VITE_APP_URL=$VITE_APP_URL
ENV VITE_SERVER_URL=$VITE_SERVER_URL

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
