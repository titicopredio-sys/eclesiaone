FROM node:22-slim

# Eclesia One - imagem de execucao (Node 22 nativo, sem dependencias de runtime)
WORKDIR /app
COPY . .

ENV PORT=4173
ENV HOST=0.0.0.0
ENV DB_FILE=/app/data/eclesia.db
ENV JWT_SECRET=altere-este-segredo-em-producao

VOLUME ["/app/data"]
EXPOSE 4173

# Healthcheck usa a propria rota de saude da API
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]
