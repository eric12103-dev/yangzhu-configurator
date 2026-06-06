# 本機去背伺服器 — rembg + Flask + OpenCV 刀模
# 安裝：pip install rembg flask flask-cors opencv-python-headless numpy
# 執行：python rembg_server.py

from flask import Flask, request, jsonify
from flask_cors import CORS
from rembg import remove
import cv2
import numpy as np
import base64

app = Flask(__name__)
CORS(app)  # 允許所有來源（本機私人使用）

def _decode_image(data_url):
    b64_str = data_url.split(',')[1]
    img_bytes = base64.b64decode(b64_str)
    return img_bytes

def _get_contour(img_bytes, margin_px=15):
    """去背後，用 OpenCV 追蹤最大輪廓，回傳正規化座標 [[x,y]...] 和圖片尺寸"""
    nparr = np.frombuffer(img_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_UNCHANGED)
    if img is None or img.shape[2] < 4:
        return None, 0, 0

    h, w = img.shape[:2]
    alpha = img[:, :, 3]

    # 二值化 alpha
    _, binary = cv2.threshold(alpha, 10, 255, cv2.THRESH_BINARY)

    # 膨脹（加刀模邊距）
    if margin_px > 0:
        k = margin_px * 2 + 1
        kernel = np.ones((k, k), np.uint8)
        binary = cv2.dilate(binary, kernel)

    # 找輪廓
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None, w, h

    # 取最大輪廓並簡化
    contour = max(contours, key=cv2.contourArea)
    epsilon = 0.003 * cv2.arcLength(contour, True)
    approx = cv2.approxPolyDP(contour, epsilon, True)
    points = approx.reshape(-1, 2)

    # 正規化為 0~1
    norm = [[float(p[0]) / w, float(p[1]) / h] for p in points]
    return norm, w, h

@app.route('/remove-bg', methods=['POST'])
def remove_bg():
    try:
        data = request.get_json()
        if not data or 'imageDataURL' not in data:
            return jsonify({'success': False, 'error': '請提供 imageDataURL'}), 400

        img_bytes = _decode_image(data['imageDataURL'])
        result_bytes = remove(img_bytes)
        result_b64 = base64.b64encode(result_bytes).decode('utf-8')
        return jsonify({'success': True, 'imageDataURL': f'data:image/png;base64,{result_b64}'})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/remove-bg-with-contour', methods=['POST'])
def remove_bg_with_contour():
    """去背 + 刀模輪廓追蹤"""
    try:
        data = request.get_json()
        if not data or 'imageDataURL' not in data:
            return jsonify({'success': False, 'error': '請提供 imageDataURL'}), 400

        margin_px = int(data.get('marginPx', 15))
        img_bytes = _decode_image(data['imageDataURL'])

        # 去背
        result_bytes = remove(img_bytes)

        # 輪廓追蹤
        contour, img_w, img_h = _get_contour(result_bytes, margin_px)

        result_b64 = base64.b64encode(result_bytes).decode('utf-8')
        return jsonify({
            'success': True,
            'imageDataURL': f'data:image/png;base64,{result_b64}',
            'contour': contour,        # [[nx, ny], ...] 正規化 0~1
            'imageSize': {'w': img_w, 'h': img_h}
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

if __name__ == '__main__':
    print('rembg 去背+刀模伺服器啟動中...')
    print('伺服器就緒：http://127.0.0.1:5001')
    app.run(host='127.0.0.1', port=5001, debug=False)
