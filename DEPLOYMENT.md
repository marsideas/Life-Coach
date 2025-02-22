# Life Coach AI助手部署指南

## 1. 环境要求

### 服务器要求
- Linux服务器（推荐Ubuntu 20.04 LTS或更新版本）
- 最小配置：2核CPU，4GB内存
- 至少20GB可用磁盘空间

### 必要软件
- Node.js 18.x或更高版本
- npm 9.x或更高版本
- Nginx（用于反向代理）
- PM2（用于进程管理）

## 2. 前端部署

### 2.1 构建前端代码
```bash
# 在本地开发环境
cd frontend
npm install
npm run build
```

### 2.2 部署到服务器
1. 将构建后的`dist`目录内容上传到服务器
```bash
scp -r dist/* user@your-server:/var/www/life-coach/
```

2. Nginx配置示例
```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /var/www/life-coach;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # API反向代理配置
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## 3. 后端部署

### 3.1 准备后端代码
```bash
# 在服务器上
mkdir -p /var/www/life-coach-backend
cd /var/www/life-coach-backend

# 克隆代码或上传后端代码到服务器
git clone <repository-url> .

# 安装依赖
npm install --production
```

### 3.2 环境变量配置
1. 创建`.env`文件
```bash
DEEPSEEK_API_KEY=your_api_key
PORT=3000
NODE_ENV=production
```

### 3.3 使用PM2启动服务
```bash
# 全局安装PM2
npm install -g pm2

# 启动服务
pm2 start src/server.js --name "life-coach-backend"

# 设置开机自启
pm2 startup
pm2 save
```

## 4. HTTPS配置

### 4.1 安装证书
使用Let's Encrypt获取免费SSL证书：
```bash
sudo apt-get update
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## 5. 监控和维护

### 5.1 日志管理
```bash
# 查看PM2日志
pm2 logs life-coach-backend

# 查看Nginx访问日志
tail -f /var/log/nginx/access.log

# 查看Nginx错误日志
tail -f /var/log/nginx/error.log
```

### 5.2 性能监控
```bash
# 查看PM2状态
pm2 monit

# 查看系统资源使用情况
htop
```

### 5.3 自动化部署脚本示例
```bash
#!/bin/bash

# 更新前端代码
cd /path/to/frontend
git pull
npm install
npm run build

# 更新后端代码
cd /path/to/backend
git pull
npm install --production

# 重启后端服务
pm2 restart life-coach-backend

# 重载Nginx配置
sudo nginx -t && sudo systemctl reload nginx
```

## 6. 安全建议

1. 启用防火墙，只开放必要端口（80, 443, SSH端口）
```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 22/tcp
sudo ufw enable
```

2. 定期更新系统和依赖包
```bash
sudo apt update && sudo apt upgrade
npm audit fix
```

3. 设置文件权限
```bash
chmod -R 755 /var/www/life-coach
chown -R www-data:www-data /var/www/life-coach
```

## 7. 故障排除

1. 检查服务状态
```bash
systemctl status nginx
pm2 status
```

2. 检查端口占用
```bash
netstat -tulpn | grep LISTEN
```

3. 检查日志文件中的错误信息

## 8. 备份策略

1. 数据库备份（如果使用）
2. 配置文件备份
3. 用户上传文件备份

定期执行备份并将备份文件存储在安全的位置。

## 9. 更新流程

1. 在测试环境验证更新
2. 备份当前生产环境
3. 执行更新
4. 验证更新后的功能
5. 如有问题，准备回滚方案

## 10. 性能优化

1. 启用Nginx缓存
2. 配置Gzip压缩
3. 使用CDN加速静态资源
4. 优化Node.js性能参数

## 注意事项

1. 部署前备份所有重要数据
2. 确保所有敏感信息（如API密钥）安全存储
3. 定期检查和更新SSL证书
4. 保持系统和依赖包的更新
5. 监控服务器资源使用情况