FROM node:20.19-alpine3.20

WORKDIR /app

# 只复制运行所需文件；.env、data/、logs/ 等敏感内容不进入镜像
COPY --chown=node:node index.html styles.css script.js server.js ai.js security.js storage.js ./
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node privacy.html terms.html package.json package-lock.json README.md ./

ENV NODE_ENV=production
ENV PORT=8787
EXPOSE 8787

# 安装锁定版本的生产依赖，以非 root 用户运行
RUN npm ci --omit=dev && mkdir -p /app/data /app/logs && chown -R node:node /app
USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
