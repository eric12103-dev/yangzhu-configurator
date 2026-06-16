# 本機去背伺服器 — rembg + Flask + OpenCV 刀模
# 安裝：pip install rembg flask flask-cors opencv-python-headless numpy
# 執行：python rembg_server.py

from flask import Flask, request, jsonify
from flask_cors import CORS
from rembg import remove, new_session
import cv2
import numpy as np
import base64

app = Flask(__name__)
CORS(app)

# 懶載入：第一次請求時才初始化 session（避免阻塞 Flask 啟動）
_REMBG_SESSION = None

# 圖片固定白邊（px）：讓 canvas 圖片大小不隨邊距滑桿改變
FIXED_PAD = 50

def _get_session():
    global _REMBG_SESSION
    if _REMBG_SESSION is None:
        print('正在載入 isnet-general-use 模型（首次需下載 ~170MB，請稍候）...')
        try:
            _REMBG_SESSION = new_session('isnet-general-use')
            print('isnet-general-use 模型載入完成')
        except Exception as e:
            print(f'isnet-general-use 載入失敗，改用 u2net：{e}')
            _REMBG_SESSION = new_session('u2net')
    return _REMBG_SESSION

def _decode_image(data_url):
    b64_str = data_url.split(',')[1]
    return base64.b64decode(b64_str)

def _get_contour(img_bytes, margin_px=15):
    """
    去背後完整刀模流程：
    - 圖片固定加 FIXED_PAD=50px 白邊（canvas 圖片大小不隨邊距變動）
    - 刀模輪廓用 margin_px 膨脹（邊距滑桿只移動刀模線，不改圖片）
    回傳 (正規化輪廓, 處理後圖片, 寬, 高)
    """
    nparr = np.frombuffer(img_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_UNCHANGED)
    if img is None or img.shape[2] < 4:
        return None, None, 0, 0

    h, w = img.shape[:2]
    alpha = img[:, :, 3]
    _, binary = cv2.threshold(alpha, 10, 255, cv2.THRESH_BINARY)

    # 裁切到主體邊界框
    rows_any = np.any(binary, axis=1)
    cols_any = np.any(binary, axis=0)
    if not rows_any.any():
        return None, None, w, h
    rmin, rmax = np.where(rows_any)[0][[0, -1]]
    cmin, cmax = np.where(cols_any)[0][[0, -1]]

    img_crop = img[rmin:rmax+1, cmin:cmax+1]
    bin_crop  = binary[rmin:rmax+1, cmin:cmax+1]

    # 圖片固定用 FIXED_PAD 白邊（canvas 圖片大小穩定）
    img_padded = cv2.copyMakeBorder(img_crop, FIXED_PAD, FIXED_PAD, FIXED_PAD, FIXED_PAD,
                                     cv2.BORDER_CONSTANT, value=[0, 0, 0, 0])
    bin_padded = cv2.copyMakeBorder(bin_crop, FIXED_PAD, FIXED_PAD, FIXED_PAD, FIXED_PAD,
                                     cv2.BORDER_CONSTANT, value=0)
    ph, pw = img_padded.shape[:2]

    # 膨脹 margin_px：讓刀模線偏離圖案邊緣（邊距調整只改此值）
    dil = max(margin_px, 1)
    k = dil * 2 + 1
    kernel = np.ones((k, k), np.uint8)
    bin_dilated = cv2.dilate(bin_padded, kernel)

    # 高斯模糊讓尖角自然圓滑（borderType=CONSTANT 讓邊緣梯度正確）
    blur_k = max(9, dil | 1)
    sigma  = dil / 2.5
    bin_f  = cv2.GaussianBlur(bin_dilated.astype(np.float32),
                               (blur_k, blur_k), sigma,
                               borderType=cv2.BORDER_CONSTANT)
    _, bin_smooth = cv2.threshold(bin_f, 127, 255, cv2.THRESH_BINARY)
    bin_smooth = bin_smooth.astype(np.uint8)

    # 找輪廓（CHAIN_APPROX_NONE 取所有點）
    contours, _ = cv2.findContours(bin_smooth, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    if not contours:
        return None, img_padded, pw, ph

    contour  = max(contours, key=cv2.contourArea)
    all_pts  = contour.reshape(-1, 2)

    # 均勻取樣 ~180 點，適合 Catmull-Rom 曲線渲染
    n_target = min(180, len(all_pts))
    indices  = np.round(np.linspace(0, len(all_pts) - 1, n_target)).astype(int)
    points   = all_pts[indices]

    norm = [[float(p[0]) / pw, float(p[1]) / ph] for p in points]
    return norm, img_padded, pw, ph


def _get_contour_from_image(img_bytes, margin_px=15):
    """
    從已去背（含 FIXED_PAD 白邊）的圖片重算刀模輪廓，不重跑 rembg。
    用於邊距滑桿調整：只移動刀模線，canvas 圖片不變。
    """
    nparr = np.frombuffer(img_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_UNCHANGED)
    if img is None or img.shape[2] < 4:
        return None, 0, 0
    ph, pw = img.shape[:2]
    alpha = img[:, :, 3]
    _, binary = cv2.threshold(alpha, 10, 255, cv2.THRESH_BINARY)

    dil = max(margin_px, 1)
    k = dil * 2 + 1
    kernel = np.ones((k, k), np.uint8)
    bin_dilated = cv2.dilate(binary, kernel)

    blur_k = max(9, dil | 1)
    sigma  = dil / 2.5
    bin_f  = cv2.GaussianBlur(bin_dilated.astype(np.float32),
                               (blur_k, blur_k), sigma,
                               borderType=cv2.BORDER_CONSTANT)
    _, bin_smooth = cv2.threshold(bin_f, 127, 255, cv2.THRESH_BINARY)
    bin_smooth = bin_smooth.astype(np.uint8)

    contours, _ = cv2.findContours(bin_smooth, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    if not contours:
        return None, pw, ph

    contour  = max(contours, key=cv2.contourArea)
    all_pts  = contour.reshape(-1, 2)
    n_target = min(180, len(all_pts))
    indices  = np.round(np.linspace(0, len(all_pts) - 1, n_target)).astype(int)
    points   = all_pts[indices]

    norm = [[float(p[0]) / pw, float(p[1]) / ph] for p in points]
    return norm, pw, ph


@app.route('/remove-bg', methods=['POST'])
def remove_bg():
    try:
        data = request.get_json()
        if not data or 'imageDataURL' not in data:
            return jsonify({'success': False, 'error': '請提供 imageDataURL'}), 400
        img_bytes    = _decode_image(data['imageDataURL'])
        result_bytes = remove(img_bytes, session=_get_session())
        result_b64   = base64.b64encode(result_bytes).decode('utf-8')
        return jsonify({'success': True, 'imageDataURL': f'data:image/png;base64,{result_b64}'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/remove-bg-with-contour', methods=['POST'])
def remove_bg_with_contour():
    """去背 + 刀模輪廓（首次使用，會跑 rembg + 計算輪廓）"""
    try:
        data = request.get_json()
        if not data or 'imageDataURL' not in data:
            return jsonify({'success': False, 'error': '請提供 imageDataURL'}), 400

        margin_px = int(data.get('marginPx', 15))
        img_bytes = _decode_image(data['imageDataURL'])

        result_bytes = remove(img_bytes, session=_get_session())
        contour, img_padded, img_w, img_h = _get_contour(result_bytes, margin_px)

        if img_padded is not None:
            _, encoded = cv2.imencode('.png', img_padded)
            result_b64 = base64.b64encode(encoded.tobytes()).decode('utf-8')
        else:
            result_b64 = base64.b64encode(result_bytes).decode('utf-8')

        return jsonify({
            'success': True,
            'imageDataURL': f'data:image/png;base64,{result_b64}',
            'contour': contour,
            'imageSize': {'w': img_w, 'h': img_h}
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/contour-only', methods=['POST'])
def contour_only():
    """只重算刀模輪廓，不重跑 rembg（用於邊距滑桿調整，canvas 圖片不變）"""
    try:
        data = request.get_json()
        if not data or 'imageDataURL' not in data:
            return jsonify({'success': False, 'error': '請提供 imageDataURL'}), 400
        margin_px = int(data.get('marginPx', 15))
        img_bytes = _decode_image(data['imageDataURL'])
        contour, img_w, img_h = _get_contour_from_image(img_bytes, margin_px)
        return jsonify({'success': True, 'contour': contour, 'imageSize': {'w': img_w, 'h': img_h}})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


if __name__ == '__main__':
    print('rembg 去背+刀模伺服器啟動中...')
    print('伺服器就緒：http://127.0.0.1:5001')
    app.run(host='127.0.0.1', port=5001, debug=False)
