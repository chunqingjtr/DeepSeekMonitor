# DeepSeek Monitor (Windows)

[JayHome137/DeepSeekMonitor](https://github.com/JayHome137/DeepSeekMonitor) 的 Windows 复刻版。
原项目是 macOS 菜单栏 App（Swift/SwiftUI），本项目用 **Electron** 重写为 **Windows 系统托盘 App**，
界面、配色、布局与原版保持一致。

## 功能
- 托盘弹出主面板：账户余额、在线状态、今日/本月消耗、V4 Flash / V4 Pro 用量、7 天消耗趋势
- 模型详情页：API 请求次数、Tokens 总量、按日 Token 消耗柱状图（点击模型行进入）
- 设置：API Key 验证保存、桌面小组件开关、开机自启、自动刷新间隔（30 秒 / 60 秒 / 2 分钟 / 5 分钟）
- 用量数据回退：支持导入 DeepSeek 导出的 CSV / JSON
- 本地缓存：重启后立即显示上次数据，避免白屏

## 数据来源
- `GET https://api.deepseek.com/user/balance` —— 账户余额（官方稳定接口，需 API Key）
- `GET https://api.deepseek.com/v1/usage` —— Token 用量明细
  - ⚠️ DeepSeek 目前**未公开**该接口，多数账户会返回 404。此时面板仅显示余额，
    用量/趋势图为空；可在「设置 → 用量数据导入」导入官方 CSV 作为回退（与原版逻辑一致）。

## 运行
```powershell
cd D:\DeepSeekMonitor
npm install      # 首次
npm start
```
启动后图标常驻系统托盘（右下角）：
- **左键**托盘图标：弹出/收起主面板
- **右键**托盘图标：刷新 / 设置 / 退出

首次使用：点击主面板右上角齿轮 → 填入 DeepSeek API Key → 「验证并保存」。

### 关于 API Key

- API Key 在 [platform.deepseek.com](https://platform.deepseek.com/) 的 **API keys** 页面获取。
- **余额和用量是按「账户」统计的，不是按 Key 统计的。** 同一个账户下不管有几个 Key、填哪一个，
  看到的都是同一份总余额和总用量。
- DeepSeek 的 Key **只在创建那一刻显示完整内容**，之后永久打码、无法再复制。
  所以如果你手上没有保存过完整的 Key，**直接点「创建 API key」新建一个**，
  复制完整的 `sk-...` 填进来即可看到余额 —— 新建 Key 不花钱、也不影响已有的 Key。
- 查的是 **API 平台**的充值余额与 API 调用量，与网页版 / App 的会员订阅是两套独立的账。

## 打包为 exe（可选）
```powershell
npm i -D electron-builder
npx electron-builder --win
```

## 目录结构
```
main.js            Electron 主进程：托盘、窗口、定时刷新、IPC、CSV 解析
preload.js         contextBridge 暴露安全 API
deepseek.js        DeepSeek API 调用 + 用量聚合
store.js           本地配置 / 缓存（userData/*.json）
renderer/
  index.html       主面板 + 模型详情
  settings.html    设置窗口
  style.css        主题（品牌色 #4D6BFE，玻璃拟态）
  app.js           主面板渲染逻辑
  settings.js      设置逻辑
  chart.js         纯 SVG 柱状图
assets/whale.png   DeepSeek 鲸鱼图标
```
