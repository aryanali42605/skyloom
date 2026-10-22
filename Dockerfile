# Serves the Skyloom web app on Back4App Web Deployment (free container) or any Docker host.
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html styles.css config.js defaults.js sw.js manifest.webmanifest icon.svg /usr/share/nginx/html/
COPY js /usr/share/nginx/html/js
EXPOSE 80
