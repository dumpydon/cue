FROM node:22-alpine AS build
WORKDIR /app
COPY site ./site
RUN node site/build.mjs --source-check

FROM nginx:stable-alpine
COPY --from=build /app/dist/site /usr/share/nginx/html
COPY site/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
