FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
# Guarda aquí la sesión de WhatsApp y los mensajes programados (monta un volumen)
ENV DATA_DIR=/data/store AUTH_DIR=/data/auth
VOLUME /data
CMD ["node", "src/index.js"]
