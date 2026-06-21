/**
 * rembg_client.js  —  客戶端 AI 去背 + 刀模輪廓計算
 * ⚠️  此檔案僅供 biz_thick（厚切電子票證）使用，不影響其他商品
 *
 * 依賴：index.html 中的 <script type="module"> 載入 @imgly/background-removal
 *       並將 removeBackground 掛載到 window.__removeBg
 *
 * 公開 API（與 rembg_server.py 回傳格式完全相容）：
 *   removeBgWithContourClient(imageDataURL, marginPx, onProgress) → Promise<{success, imageDataURL, contour, imageSize}>
 *   calcContourOnlyClient(imageDataURL, marginPx)                  → Promise<{success, contour, imageSize}>
 */

'use strict';

// 與 Python rembg_server.py 中的 FIXED_PAD 保持一致
const _RMBG_FIXED_PAD = 50;

// ── DataURL / Blob 轉換 ──────────────────────────────────────────────────────

function _dataURLtoBlob(dataURL) {
  const [head, data] = dataURL.split(',');
  const mime = head.match(/:(.*?);/)[1];
  const bin  = atob(data);
  const arr  = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

function _blobToDataURL(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}

// ── 等待函式庫就緒（最多 timeoutMs 毫秒）────────────────────────────────────

function _waitForLib(timeoutMs) {
  timeoutMs = timeoutMs || 20000;
  return new Promise((res, rej) => {
    if (window.__removeBgReady) { res(); return; }
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (window.__removeBgReady) { clearInterval(iv); res(); }
      else if (Date.now() - t0 > timeoutMs) {
        clearInterval(iv);
        rej(new Error('AI 去背函式庫載入逾時，請重新整理頁面再試'));
      }
    }, 150);
  });
}

// ── 積分影像 Box Blur（O(n)，模擬 OpenCV GaussianBlur 三次疊加 ≈ Gaussian）──

function _integralBoxBlurH(data, w, h, r) {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const prefix = new Float32Array(w + 1);
    for (let x = 0; x < w; x++) prefix[x + 1] = prefix[x] + data[y * w + x];
    for (let x = 0; x < w; x++) {
      const lo = Math.max(0, x - r);
      const hi = Math.min(w - 1, x + r);
      out[y * w + x] = (prefix[hi + 1] - prefix[lo]) / (hi - lo + 1);
    }
  }
  return out;
}

function _integralBoxBlurV(data, w, h, r) {
  const out = new Float32Array(w * h);
  for (let x = 0; x < w; x++) {
    const prefix = new Float32Array(h + 1);
    for (let y = 0; y < h; y++) prefix[y + 1] = prefix[y] + data[y * w + x];
    for (let y = 0; y < h; y++) {
      const lo = Math.max(0, y - r);
      const hi = Math.min(h - 1, y + r);
      out[y * w + x] = (prefix[hi + 1] - prefix[lo]) / (hi - lo + 1);
    }
  }
  return out;
}

function _tripleBoxBlur(data, w, h, r) {
  // 三次 Box Blur 疊加 ≈ Gaussian，與 OpenCV GaussianBlur 效果相近
  let buf = new Float32Array(data);
  for (let pass = 0; pass < 3; pass++) {
    buf = _integralBoxBlurH(buf, w, h, r);
    buf = _integralBoxBlurV(buf, w, h, r);
  }
  return buf;
}

// ── Box Dilation（O(n)，模擬 OpenCV dilate + np.ones square kernel）──────────

function _dilateBox(binary, w, h, r) {
  if (r <= 0) return new Uint8Array(binary);

  // 水平方向滑窗
  const hPass = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const prefix = new Int32Array(w + 1);
    for (let x = 0; x < w; x++) prefix[x + 1] = prefix[x] + (binary[y * w + x] ? 1 : 0);
    for (let x = 0; x < w; x++) {
      const lo = Math.max(0, x - r);
      const hi = Math.min(w - 1, x + r);
      if (prefix[hi + 1] - prefix[lo] > 0) hPass[y * w + x] = 255;
    }
  }

  // 垂直方向滑窗
  const result = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) {
    const prefix = new Int32Array(h + 1);
    for (let y = 0; y < h; y++) prefix[y + 1] = prefix[y] + (hPass[y * w + x] ? 1 : 0);
    for (let y = 0; y < h; y++) {
      const lo = Math.max(0, y - r);
      const hi = Math.min(h - 1, y + r);
      if (prefix[hi + 1] - prefix[lo] > 0) result[y * w + x] = 255;
    }
  }
  return result;
}

// ── 極座標輪廓取樣（從重心出發，沿 nPts 個角度找最遠邊界點）──────────────────
// 產生有序的 ~180 個歸一化座標點，與 OpenCV findContours + 取樣效果相近

function _polarContour(binary, w, h, nPts) {
  nPts = nPts || 180;

  // 計算重心
  let sumX = 0, sumY = 0, cnt = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (binary[y * w + x]) { sumX += x; sumY += y; cnt++; }
  }
  if (cnt === 0) return [];
  const cx = sumX / cnt;
  const cy = sumY / cnt;

  const diag = Math.sqrt(w * w + h * h);
  const pts  = [];

  for (let i = 0; i < nPts; i++) {
    const angle = (i / nPts) * 2 * Math.PI;
    const cos   = Math.cos(angle);
    const sin   = Math.sin(angle);

    // 二分搜尋：找最遠的前景像素半徑
    let lo = 0, hi = diag;
    for (let step = 0; step < 20; step++) {
      const mid = (lo + hi) * 0.5;
      const px  = Math.round(cx + cos * mid);
      const py  = Math.round(cy + sin * mid);
      const ok  = px >= 0 && px < w && py >= 0 && py < h && binary[py * w + px];
      if (ok) lo = mid; else hi = mid;
    }
    pts.push([cx + cos * lo, cy + sin * lo]);
  }

  return pts;
}

// ── 核心：從 RGBA 像素資料計算刀模輪廓 ──────────────────────────────────────

function _calcContourFromRGBA(rgbaData, imgW, imgH, marginPx) {
  const margin = Math.max(marginPx || 15, 1);
  const pad    = _RMBG_FIXED_PAD;

  // 1. Alpha 二值化（threshold = 10/255）
  const alpha = new Uint8Array(imgW * imgH);
  for (let i = 0; i < imgW * imgH; i++) {
    alpha[i] = rgbaData[i * 4 + 3] > 10 ? 255 : 0;
  }

  // 2. 找邊界框（bounding box）
  let rMin = imgH, rMax = -1, cMin = imgW, cMax = -1;
  for (let r = 0; r < imgH; r++) for (let c = 0; c < imgW; c++) {
    if (!alpha[r * imgW + c]) continue;
    if (r < rMin) rMin = r; if (r > rMax) rMax = r;
    if (c < cMin) cMin = c; if (c > cMax) cMax = c;
  }
  if (rMax < 0) return null;  // 全透明，找不到主體

  // 3. 裁切主體，加 FIXED_PAD 白邊
  const cW = (cMax - cMin + 1) + pad * 2;
  const cH = (rMax - rMin + 1) + pad * 2;
  const cropped = new Uint8Array(cW * cH);
  for (let r = rMin; r <= rMax; r++) {
    for (let c = cMin; c <= cMax; c++) {
      cropped[(r - rMin + pad) * cW + (c - cMin + pad)] = alpha[r * imgW + c];
    }
  }

  // 4. 膨脹（邊距 margin_px）
  const dilated = _dilateBox(cropped, cW, cH, margin);

  // 5. 三次 Box Blur 近似高斯平滑
  const blurR   = Math.max(4, (Math.floor(margin / 2.5) | 1));
  const blurred = _tripleBoxBlur(dilated, cW, cH, blurR);

  // 6. 二值化（threshold = 127）
  const smooth = new Uint8Array(cW * cH);
  for (let i = 0; i < cW * cH; i++) smooth[i] = blurred[i] >= 127 ? 255 : 0;

  // 7. 極座標輪廓取樣 → 180 點歸一化座標
  const rawPts = _polarContour(smooth, cW, cH, 180);
  if (rawPts.length < 3) return null;

  const contour = rawPts.map(([px, py]) => [px / cW, py / cH]);

  return { contour, imgW: cW, imgH: cH, rMin, rMax, cMin, cMax };
}

// ── 建立裁切+白邊後的 PNG DataURL（用來取代原始上傳圖，保持尺寸穩定）────────

function _buildPaddedDataURL(img, rMin, rMax, cMin, cMax, newW, newH) {
  const pad = _RMBG_FIXED_PAD;
  const tmp = document.createElement('canvas');
  tmp.width  = newW;
  tmp.height = newH;
  const ctx  = tmp.getContext('2d');
  ctx.clearRect(0, 0, newW, newH);
  ctx.drawImage(
    img,
    cMin, rMin, cMax - cMin + 1, rMax - rMin + 1,  // 來源裁切區
    pad, pad, cMax - cMin + 1, rMax - rMin + 1       // 目標位置（加白邊）
  );
  return tmp.toDataURL('image/png');
}

// ════════════════════════════════════════════════════════════════════════════
// 公開 API
// ════════════════════════════════════════════════════════════════════════════

/**
 * 去背 + 刀模輪廓（首次流程）
 * 回傳格式與 rembg_server.py POST /remove-bg-with-contour 完全相容
 *
 * @param {string}   imageDataURL  原始圖片 DataURL（含背景）
 * @param {number}   marginPx      刀模邊距像素（同 Python margin_px，預設 15）
 * @param {Function} onProgress    進度回呼 (msg: string) => void
 * @returns {Promise<{success, imageDataURL, contour, imageSize}>}
 */
async function removeBgWithContourClient(imageDataURL, marginPx, onProgress) {
  try {
    // 等待 @imgly/background-removal 函式庫載入完成
    if (onProgress) onProgress('等待 AI 去背模型就緒…');
    await _waitForLib(25000);

    // 呼叫去背 API
    if (onProgress) onProgress('AI 去背中，請稍候…');
    const inputBlob  = _dataURLtoBlob(imageDataURL);
    const resultBlob = await window.__removeBg(inputBlob, function(key, cur, total) {
      if (onProgress && total > 0) {
        const pct = Math.round((cur / total) * 100);
        onProgress('AI 去背 ' + pct + '%…');
      }
    });
    const removedDataURL = await _blobToDataURL(resultBlob);

    // 從去背結果計算輪廓
    if (onProgress) onProgress('計算刀模輪廓…');

    return new Promise(function(resolve, reject) {
      const img = new Image();
      img.onload = function() {
        const cvs = document.createElement('canvas');
        cvs.width  = img.width;
        cvs.height = img.height;
        const ctx  = cvs.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, img.width, img.height);

        const result = _calcContourFromRGBA(imgData.data, img.width, img.height, marginPx);

        if (!result) {
          // 找不到主體，仍回傳去背圖，但沒有輪廓
          resolve({
            success: true,
            imageDataURL: removedDataURL,
            contour: null,
            imageSize: { w: img.width, h: img.height }
          });
          return;
        }

        const paddedURL = _buildPaddedDataURL(
          img, result.rMin, result.rMax, result.cMin, result.cMax,
          result.imgW, result.imgH
        );

        resolve({
          success: true,
          imageDataURL: paddedURL,
          contour:      result.contour,
          imageSize:    { w: result.imgW, h: result.imgH }
        });
      };
      img.onerror = function() { reject(new Error('去背後圖片載入失敗')); };
      img.src = removedDataURL;
    });

  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
}

/**
 * 只重算刀模輪廓（不重跑去背，供邊距滑桿調整用）
 * 回傳格式與 rembg_server.py POST /contour-only 完全相容
 *
 * @param {string} imageDataURL  已去背且含 FIXED_PAD 白邊的 PNG DataURL
 * @param {number} marginPx      新的刀模邊距像素
 * @returns {Promise<{success, contour, imageSize}>}
 */
async function calcContourOnlyClient(imageDataURL, marginPx) {
  return new Promise(function(resolve) {
    const img = new Image();
    img.onload = function() {
      const cvs = document.createElement('canvas');
      cvs.width  = img.width;
      cvs.height = img.height;
      const ctx  = cvs.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, img.width, img.height);

      // 此圖已含 FIXED_PAD，直接對整張圖做膨脹+模糊+輪廓
      const alpha = new Uint8Array(img.width * img.height);
      const d = imgData.data;
      for (let i = 0; i < img.width * img.height; i++) {
        alpha[i] = d[i * 4 + 3] > 10 ? 255 : 0;
      }

      const margin  = Math.max(marginPx || 15, 1);
      const dilated = _dilateBox(alpha, img.width, img.height, margin);
      const blurR   = Math.max(4, (Math.floor(margin / 2.5) | 1));
      const blurred = _tripleBoxBlur(dilated, img.width, img.height, blurR);
      const smooth  = new Uint8Array(img.width * img.height);
      for (let i = 0; i < smooth.length; i++) {
        smooth[i] = blurred[i] >= 127 ? 255 : 0;
      }

      const rawPts = _polarContour(smooth, img.width, img.height, 180);
      if (rawPts.length < 3) {
        resolve({ success: false, error: '找不到輪廓' });
        return;
      }

      const contour = rawPts.map(function(pt) {
        return [pt[0] / img.width, pt[1] / img.height];
      });

      resolve({
        success:   true,
        contour:   contour,
        imageSize: { w: img.width, h: img.height }
      });
    };
    img.onerror = function() { resolve({ success: false, error: '圖片載入失敗' }); };
    img.src = imageDataURL;
  });
}
