# 土豆片 · 网页版（浏览器直传）

在浏览器里完成整条链路，不需要安装任何东西、也不需要服务器：

**渲染 → 六色 Floyd–Steinberg 抖动 → 4bit 打包 → T3 面板标定 → QuickLZ L3 压缩 → Web Bluetooth 直传**

## 用法

1. 用 **Chrome / Edge**（桌面或安卓）打开页面
2. 「选择照片」或写一句文字
3. 点「连接并发送到卡片」，选中设备
4. 等日志出现「显影确认已收到」

## 限制

- 只支持 Chrome / Edge（Safari、Firefox 没有 Web Bluetooth）
- 必须 HTTPS（GitHub Pages 满足）
- 页面关闭即停止，没有定时推送（定时需要桌面版）

## 与桌面版的关系

| | 网页版 | 桌面版 |
|---|---|---|
| 安装 | 无 | 双击启动脚本 |
| 定时推送 | ❌ | ✅ |
| 模板数量 | 2（照片 / 文字） | 13 |
| 数据源 | 浏览器内 | Open-Meteo、Hitokoto、Bing… |

桌面版：https://github.com/shidaifufen/todoocard-eink

## 实现说明

`js/payload.js` 是 `payload.py` + `quicklz_payload.py` 的 JS 翻译，算法逐字节对齐；`js/ble.js` 对应 `sender.py` 的握手流程（0x01 block size → 0x02 长度 → 0x03 开始 → 分块写 → 0x05/0x08 结束）。

MIT License。
