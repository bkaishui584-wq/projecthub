FROM node:20-alpine

WORKDIR /app

# 本项目零第三方依赖，只需要源码本身
COPY index.html styles.css script.js server.js ai.js ./
COPY package.json README.md ./

ENV NODE_ENV=production
ENV PORT=8787
EXPOSE 8787

# 运行数据（账号、话题、聊天、上传文件）挂载到宿主机
VOLUME ["/app/data"]

CMD ["node", "server.js"]
