# 帥V 私人車庫 · BIRDY 3 單車鑑賞室（3D 預覽）

C 版「3D 立體車庫」首頁的**可互動預覽**，與 ChatGPT 託管的正式站完全分開。

- 預覽站：https://vincentlai123.github.io/shuai-v-bike-atelier/
- 正式站（未受影響、未重新部署）：https://shuai-v-bike-system.vinlai125.chatgpt.site

## 這是什麼
- **真實 Three.js 展廳**（three@0.186.1），程序化建模，不是截圖：拖曳旋轉、滾輪／雙指縮放、
  光線（棚拍／夜幕／冷光）、特寫視角（全車／五刀碳輪／傳動細節／車架線條）、
  概念塗裝（翠綠／珍珠白／石墨）、光影巡禮、騎乘演示、分解展示、重設、正側面、暫停／播放。
- 3D 模組直接移植自正式站 `app/dashboard/`，邏輯未改：
  `bike-model.ts`、`birdy-carbon-wheel.ts`、`birdy-detail-parts.ts`、`birdy-frame-geometry.ts`、
  `showroom-scene.ts`、`showroom-studio.ts`（見 `site/src/showroom/`）。
- React 的 `BikeShowroom` 改寫為原生 TypeScript 控制器 `site/src/main.ts`，同樣的狀態流程與場景 API 呼叫。
- 樣式沿用正式站 `race-design.css`（`site/src/race-design.css`，以 `body[data-design="race"][data-view="home"]` 套用），
  外框（預覽列、導覽、現役車隊、工作台）在 `site/src/atelier.css`。
- 無登入、無後端、不存資料；工作台與「開啟我的車庫」為 `#` 佔位連結。
- WebGL 無法啟用時，會顯示正式站同款的備援參考圖與「重新載入展示」。
- 現役車隊同步於 2026-11-05，共 11 台（Rohloff / HELIX 已售出，不列入）。

## 建置
```bash
cd site
npm install
npm run build          # vite base = /shuai-v-bike-atelier/
cp -r dist/. ..        # GitHub Pages 由 repo 根目錄提供（index.html + assets/ + images/）
```
