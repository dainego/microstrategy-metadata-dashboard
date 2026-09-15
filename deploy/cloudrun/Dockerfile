FROM nginx:alpine

# Esta configuración es exclusiva de Cloud Run: el agente se ejecuta como
# sidecar en el mismo servicio y Nginx lo alcanza mediante localhost.
COPY deploy/cloudrun/nginx.conf /etc/nginx/conf.d/default.conf

RUN rm -rf /usr/share/nginx/html/*
COPY dist/ /usr/share/nginx/html/

EXPOSE 8080
