# 🎵 Live Music Sync & Progress Tracker

> **轻量级、跨平台的实时歌曲播放进度同步与状态监测系统**。支持任意音乐 App 播放进度的秒级同步监测、歌词同步滚动、专辑封面提取，并在播放暂停时自动展示艺术家人像轮播。
> 
> *💡 注：本项目基于标准 HTTP API 设计，虽然默认提供 Cloudflare Workers 部署方案，但其前后端架构完全不依赖特定云厂商，你可以非常轻松地将其移植部署到 Node.js、Python、Go、PHP 等**任何服务器或本地环境**中。*

**Live Demo**: [https://tcrrry.com](https://tcrrry.com)

---

## ✨ 功能特性

- ⚡ **毫秒级进度同步监测**：通过标准的 HTTP POST API，实时接收并秒级同步当前播放器的进度、歌曲状态（播放/暂停）、音质格式（Hi-Res FLAC / Dolby Atmos 等）
- 📜 **智能歌词滚动**：从 QQ 音乐等源自动获取并根据当前进度逐行高亮滚动歌词，支持 UTF-8 + GBK 双重编码容错
- 🖼️ **空闲人像轮播**：音乐暂停时，自动切换展示艺术家的高清人像照片（自动筛选竖版大图）
- 📱 **极致响应式设计**：移动端 Apple Music 风格横屏横向布局，桌面端宽屏专辑封面放大模式
- 🔄 **自动人像更新**：轻量级后台爬虫（支持部署于 OpenWrt 路由器等设备）监控微博/B站/抖音，发现新人像照片时自动下载并更新至云端图库


---

## 🏗️ 系统架构

```
Android (SLS 音乐记录器)
        │  每隔1秒推送播放状态
        ▼
loc.tcrrry.com (Cloudflare Worker — worker.js)
        │  写入 KV 数据库
        ▼
Cloudflare KV (slideshow_images / lyric_cache / status)
        │  读取展示
        ▼
tcrrry.com (Cloudflare Worker — tcrrry-home.js)
        ▲
OpenWrt 路由器 (router_scraper.py)
  每10分钟爬取微博/B站/抖音
  发现新人像 → 推送到 KV 更新轮播图
```

---

## 📋 前置条件

系统各模块非常灵活，你可以根据自己需要的功能来选择性准备环境（并非所有都是必须的）：

### 1. 核心展示与同步（只要这个就能显示音乐进度）
* **网页服务器**：默认使用 [Cloudflare 账号](https://dash.cloudflare.com/sign-up)（免费，且需要一个托管在 CF 的域名）。*但由于是标准 API，你也可以直接用你自己的 Node.js 或 Python 服务器，完全不需要 Cloudflare。*
* **安卓设备 + SLS 音乐记录器**：用于获取你手机上的实时播放状态并上报给服务器。

### 2. 自动更新轮播图（从微博自动抓取新图）
* **Python 3.8+**：运行本地/服务器爬虫脚本。
* **OpenWrt 路由器（可选）**：用于 7×24 小时在后台自动执行 Python 爬虫，没有的话也可以在任意电脑、NAS、或云服务器上挂载运行。


---

## 🚀 快速部署

### 第一步：配置凭证

```bash
cp .env.example .env
# 编辑 .env，填入你的 Cloudflare API Token 和 Account ID
```

获取 Cloudflare 凭证：
1. 前往 [API Tokens](https://dash.cloudflare.com/profile/api-tokens) → 创建 Token
2. 权限选择：`Workers Scripts: Edit` + `Workers KV Storage: Edit`
3. Account ID 在 Cloudflare 首页右侧可以找到

---

### 第二步：创建 KV 数据库

在 Cloudflare Dashboard → Workers & Pages → KV，创建一个名为 `tcrrry_music_kv` 的命名空间，记录其 **Namespace ID**。

然后更新两个部署脚本里的 `namespace_id`：
```python
# deploy_home.py 第29行
namespace_id = "你的 KV Namespace ID"

# deploy_with_kv.py 第50行
namespace_id = "你的 KV Namespace ID"
```

---

### 第三步：设置推送 Token

这是路由器爬虫向云端推送数据时的验证密钥，**自定义一个随机字符串即可**（如用 `uuid` 生成）。

在以下文件中将 `YOUR_PUSH_TOKEN` 替换为你自己的 Token：
- `worker.js`（所有出现处）
- `router_scraper.py`（`push_slideshow_images_to_cf` 函数中）

---

### 第四步：部署后端 API Worker

```bash
pip install requests
python deploy_with_kv.py
```

部署成功后，在 Cloudflare Dashboard 给 Worker 配置一个路由，例如 `loc.yourdomain.com/*`。

---

### 第五步：部署前端主页 Worker

```bash
python deploy_home.py
```

部署成功后，将你的主域名路由 `yourdomain.com/*` 指向这个 Worker。

---

### 第六步：配置路由器爬虫（可选）

如果你有 OpenWrt 路由器并已安装 Python3，在 `router_scraper.py` 顶部填写你的配置：

```python
# 替换成你想监控的微博账号 UID
WEIBO_ACCOUNTS = [
    {"uid": "你的微博UID", "name": "艺术家名字"},
]

# 云端 API 地址
# push_slideshow_images_to_cf 函数中的 url 改为你自己的域名
url = "https://loc.yourdomain.com/api/slideshow-images"
```

手动运行测试：
```bash
python router_scraper.py
```

通过 SSH 部署到路由器（会自动配置 cron 定时任务，每10分钟运行一次）：
```bash
python ssh_deploy.py
```

---

### 第七步：配置播放状态上报

使用安卓设备上的 **SLS 音乐记录器**（Scrobbler for Last.fm）或任何能发送 HTTP POST 的工具，将当前播放的歌曲信息定期推送到：

```
POST https://loc.yourdomain.com/api/status
Content-Type: application/json

{
  "token": "YOUR_PUSH_TOKEN",
  "audio_track": "歌曲名",
  "audio_artist": "艺术家",
  "audio_state": "playing",
  ...
}
```

---

## 🎨 自定义

### 更换艺术家人像

修改 `update_slideshow_rolling.py` 中的账号 UID，然后运行：
```bash
python update_slideshow_rolling.py
```
脚本会自动抓取最新的 100 张竖版人像并上传到云端。

### 调整滚动图片数量

修改 `router_scraper.py` 中的上限值（当前为 100）：
```python
updated_slideshow = combined[:100]  # 改成你想要的数量
```

---

## 📁 核心文件说明

| 文件 | 说明 |
|------|------|
| `tcrrry-home.js` | 前端主页 Cloudflare Worker，负责渲染整个播放界面 |
| `worker.js` | 后端 API Cloudflare Worker，接收播放状态推送、管理 KV 数据 |
| `router_scraper.py` | 路由器后台爬虫，监控微博/B站/抖音动态并更新轮播图 |
| `update_slideshow_rolling.py` | 手动刷新：从微博抓取最新 100 张人像并上传到 KV |
| `deploy_home.py` | 一键部署前端 Worker 脚本 |
| `deploy_with_kv.py` | 一键部署后端 API Worker 脚本 |
| `ssh_deploy.py` | 通过 SSH 将爬虫部署到 OpenWrt 路由器（需自行填写路由器 IP/密码） |

---

## ⚙️ 技术栈

- **Cloudflare Workers** — 全球边缘计算，零冷启动，免费额度日均 10 万次请求
- **Cloudflare KV** — 键值存储，缓存歌词/播放状态/轮播图列表
- **Python 3** — 部署脚本 + 路由器爬虫
- **原生 HTML/CSS/JS** — 前端无任何框架依赖，加载极快
- **WordPress Jetpack Photon (i3.wp.com)** — 微博图片 CDN 代理，绕过防盗链

---

## ❓ 常见问题

**Q: 歌词显示乱码？**  
A: `tcrrry-home.js` 已内置 UTF-8 优先 + GBK 回退的双重解码机制，理论上不会出现乱码。如果仍有问题，可以在歌词请求 URL 末尾加 `?bypass_cache=1` 强制绕过所有缓存层重新获取。

**Q: 路由器上没有 Python3？**  
A: 通过 SSH 登录路由器后执行 `opkg update && opkg install python3-light`。

**Q: 轮播图总是重复？**  
A: 运行 `python update_slideshow_rolling.py` 手动刷新，或减小图片池数量。

---

## 📄 License

MIT License — 自由使用、修改、分发，保留署名即可。
