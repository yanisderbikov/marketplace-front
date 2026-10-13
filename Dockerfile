FROM node:20-alpine AS build

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Копируем только исходники: без .dockerignore `COPY . .` затёр бы node_modules
# контейнера локальными (бинарь esbuild под другую ОС) и унёс бы .env-файлы в образ.
COPY index.html vite.config.js ./
COPY public ./public
COPY src ./src

# VITE_* вшиваются в бандл на этапе сборки — передаются build-аргументами.
ARG VITE_API_URL
ARG VITE_PLATFORM_OPERATOR_NAME
ARG VITE_PLATFORM_OPERATOR_INN
ARG VITE_PLATFORM_OPERATOR_OGRN
ARG VITE_PLATFORM_CONTACT_EMAIL
ARG VITE_PLATFORM_HOSTS
ARG VITE_CUSTOM_DOMAIN_TARGET
ENV VITE_API_URL=$VITE_API_URL \
    VITE_PLATFORM_HOSTS=$VITE_PLATFORM_HOSTS \
    VITE_CUSTOM_DOMAIN_TARGET=$VITE_CUSTOM_DOMAIN_TARGET \
    VITE_PLATFORM_OPERATOR_NAME=$VITE_PLATFORM_OPERATOR_NAME \
    VITE_PLATFORM_OPERATOR_INN=$VITE_PLATFORM_OPERATOR_INN \
    VITE_PLATFORM_OPERATOR_OGRN=$VITE_PLATFORM_OPERATOR_OGRN \
    VITE_PLATFORM_CONTACT_EMAIL=$VITE_PLATFORM_CONTACT_EMAIL
RUN pnpm run build

FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
