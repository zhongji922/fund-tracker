# 种基宝 - 跨域解决方案

## 方法一：浏览器扩展（推荐本地使用）

### 1. 安装 CORS Unblock 扩展
- **Chrome**: 访问商店搜索 "CORS Unblock" 或 "Allow CORS"
- **Edge**: 同上
- **Firefox**: 搜索 "CORS Everywhere"

### 2. 推荐扩展
**CORS Unblock (Chrome)**
```
https://chrome.google.com/webstore/detail/cors-unblock/lfhmikememgdcahcdlaciloancbhjino
```

**Allow CORS (Chrome/Edge)**
```
https://chrome.google.com/webstore/detail/allow-cors-access-control/lhobafahddgcelffkeicbaginigeejlf
```

### 3. 使用方法
1. 安装扩展后，点击浏览器工具栏的扩展图标
2. 开启 "Enable CORS" 或 "Toggle ON"
3. 刷新种基宝页面即可正常获取数据

---

## 方法二：部署到 Vercel（推荐长期使用）

Vercel 提供免费的 Serverless Functions，可以完美解决跨域问题。

### 1. 创建代理 API

创建 `api/proxy.js` 文件：

```javascript
export default async function handler(req, res) {
  const { code } = req.query;

  if (!code) {
    return res.status(400).json({ error: 'Missing fund code' });
  }

  try {
    const response = await fetch(`https://fundgz.1234567.com.cn/js/${code}.js`);
    const text = await response.text();

    // 解析 JSONP
    const match = text.match(/jsonpgz\(({.+})\)/);
    if (match) {
      const data = JSON.parse(match[1]);
      res.status(200).json(data);
    } else {
      res.status(500).json({ error: 'Invalid response' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
```

### 2. 修改 app.js 使用代理

将请求地址从：
```javascript
const url = `https://fundgz.1234567.com.cn/js/${fundCode}.js?_=${Date.now()}`;
```

改为：
```javascript
const url = `/api/proxy?code=${fundCode}`;
```

### 3. 部署步骤

```bash
# 安装 Vercel CLI
npm i -g vercel

# 登录
vercel login

# 部署
vercel --prod
```

---

## 方法三：部署到 GitHub Pages + Cloudflare Workers

### 1. 创建 Cloudflare Worker 代理

在 Cloudflare Dashboard 创建 Worker：

```javascript
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')

  if (!code) {
    return new Response('Missing code', { status: 400 })
  }

  const fundUrl = `https://fundgz.1234567.com.cn/js/${code}.js`

  const response = await fetch(fundUrl, {
    headers: {
      'Referer': 'https://fund.eastmoney.com/'
    }
  })

  const text = await response.text()

  return new Response(text, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/javascript',
    },
  })
}
```

### 2. 修改 app.js

```javascript
const url = `https://your-worker.your-subdomain.workers.dev?code=${fundCode}`;
```

---

## 方法四：本地 Node.js 代理（开发环境）

创建 `server.js`：

```javascript
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const server = http.createServer(async (req, res) => {
  // 设置 CORS 头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  // 代理请求
  if (req.url.startsWith('/api/fund/')) {
    const code = req.url.split('/').pop();
    const fundUrl = `https://fundgz.1234567.com.cn/js/${code}.js`;

    https.get(fundUrl, (proxyRes) => {
      let data = '';
      proxyRes.on('data', chunk => data += chunk);
      proxyRes.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        // 解析 JSONP 并返回纯 JSON
        const match = data.match(/jsonpgz\(({.+})\)/);
        if (match) {
          res.end(match[1]);
        } else {
          res.end('{}');
        }
      });
    }).on('error', (e) => {
      res.writeHead(500);
      res.end(JSON.stringify({ error: e.message }));
    });
    return;
  }

  // 静态文件服务
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(__dirname, filePath);

  const ext = path.extname(filePath);
  const contentType = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
  }[ext] || 'text/plain';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

server.listen(3000, () => {
  console.log('Server running at http://localhost:3000');
});
```

运行：
```bash
node server.js
```

然后访问 `http://localhost:3000`

---

## 部署建议

| 方案 | 难度 | 成本 | 适用场景 |
|------|------|------|----------|
| 浏览器扩展 | ⭐ 简单 | 免费 | 本地个人使用 |
| Vercel | ⭐⭐ 中等 | 免费 | 长期在线使用 |
| Cloudflare | ⭐⭐ 中等 | 免费 | 需要自定义域名 |
| Node.js 代理 | ⭐⭐ 中等 | 免费 | 本地开发 |

**推荐**：如果只是自己用，用**浏览器扩展**最快；如果要分享给朋友，部署到 **Vercel** 最方便。
