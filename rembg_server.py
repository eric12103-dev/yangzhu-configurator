# 本機去背伺服器 — rembg + Flask
# 安裝：pip install rembg flask flask-cors
# 執行：python rembg_server.py
# 首次執行會自動下載模型（約 170MB）

from flask import Flask, request, jsonify
from flask_cors import CORS
from rembg import remove
import base64

app = Flask(__name__)
CORS(app, origins=['http://localhost:3000', 'http://127.0.0.1:3000'])

@app.route('/remove-bg', methods=['POST'])
def remove_bg():
    try:
        data = request.get_json()
        if not data or 'imageDataURL' not in data:
            return jsonify({'success': False, 'error': '請提供 imageDataURL'}), 400

        # base64 解碼
        data_url = data['imageDataURL']
        if ',' not in data_url:
            return jsonify({'success': False, 'error': '無效的 dataURL'}), 400
        b64_str = data_url.split(',')[1]
        input_bytes = base64.b64decode(b64_str)

        # 去背
        result_bytes = remove(input_bytes)

        # 回傳 PNG base64
        result_b64 = base64.b64encode(result_bytes).decode('utf-8')
        return jsonify({
            'success': True,
            'imageDataURL': f'data:image/png;base64,{result_b64}'
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

if __name__ == '__main__':
    print('rembg 去背伺服器啟動中...')
    print('首次執行會自動下載模型（約 170MB），請稍候')
    print('伺服器就緒：http://127.0.0.1:5001')
    app.run(host='127.0.0.1', port=5001, debug=False)
