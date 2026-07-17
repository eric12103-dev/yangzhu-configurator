from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import base64
import os
import datetime

from core.image_processor import remove_background, get_acrylic_shape, draw_preview_die, render_3d_mockup
from core.svg_generator import generate_svg_bytes
from core.inpainting import inpaint_clasp

app = FastAPI(title="頌禮-客製化預覽 後端 API (biz_thick 厚切電子票證去背與刀模服務)")

# 允許前端 localhost 呼叫此 API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"status": "OK", "service": "頌禮-客製化預覽後端API", "version": "1.0"}

@app.post("/api/remove_bg")
async def api_remove_bg(image: UploadFile = File(...)):
    try:
        img_bytes = await image.read()
        bg_removed_bytes = remove_background(img_bytes)
        b64 = base64.b64encode(bg_removed_bytes).decode("utf-8")
        return JSONResponse({"success": True, "image_b64": f"data:image/png;base64,{b64}"})
    except Exception as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=500)

@app.post("/api/preview_die")
async def api_preview_die(
    image: UploadFile = File(...),
    max_size_mm: float = Form(50.0),
    margin_mm: float = Form(2.0),
    hole_diameter_mm: float = Form(3.0),
    hole_position: str = Form("top"),
    product_id: str = Form("biz_thick"),
    ticket_type: str = Form("easycard")
):
    try:
        img_bytes = await image.read()
        shape_info = get_acrylic_shape(img_bytes, max_size_mm, margin_mm, hole_diameter_mm, hole_position, product_id)
        preview_bytes = draw_preview_die(shape_info, img_bytes, ticket_type=ticket_type)

        b64 = base64.b64encode(preview_bytes).decode("utf-8")
        return JSONResponse({"success": True, "die_overlay_b64": f"data:image/png;base64,{b64}"})
    except Exception as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=500)

def get_target_dir():
    target = r"\\Db\業務部\Kiven\小龍蝦\客製化編輯及時預覽-圖檔下載"
    try:
        os.makedirs(target, exist_ok=True)
        return target
    except Exception:
        base_dir = os.path.dirname(os.path.dirname(__file__))
        local_target = os.path.abspath(os.path.join(base_dir, "..", "打樣檔案下載"))
        os.makedirs(local_target, exist_ok=True)
        return local_target

@app.post("/api/submit")
async def api_submit(
    image: UploadFile = File(...),
    customer_name: str = Form(""),
    max_size_mm: float = Form(50.0),
    margin_mm: float = Form(2.0),
    hole_diameter_mm: float = Form(3.0),
    hole_position: str = Form("top"),
    clasp_type: str = Form("gold_clasp"),
    bg_image: UploadFile = File(None),
    use_ai_render: bool = Form(False),
    product_id: str = Form("biz_thick"),
    ticket_type: str = Form("easycard")
):
    try:
        img_bytes = await image.read()
        shape_info = get_acrylic_shape(img_bytes, max_size_mm, margin_mm, hole_diameter_mm, hole_position, product_id)

        bg_bytes = None
        if bg_image is not None and bg_image.filename:
            bg_bytes = await bg_image.read()

        # 【嚴守商品隔離：只針對 biz_thick 厚切商品，移除 3D 合成渲染與 PNG 儲存程序，純粹輸出 SVG 打印刀模圖】
        if product_id == "biz_thick":
            svg_bytes = generate_svg_bytes(
                shape_info["dxf_path_mm"],
                shape_info["hole_center_mm"],
                shape_info["hole_radius_mm"],
                img_bytes,
                shape_info["img_w_px"] * shape_info["scale"],
                shape_info["img_h_px"] * shape_info["scale"],
                0, 0,
                is_biz_thick=True,
                shape_info=shape_info,
                ticket_type=ticket_type
            )
            safe_name = customer_name.strip() if customer_name.strip() else f"厚切電子票證-{datetime.datetime.now().strftime('%Y%m%d')}-001"
            base_filename = safe_name
            target_dir = get_target_dir()
            
            svg_path = os.path.join(target_dir, f"{base_filename}.SVG")
            with open(svg_path, "wb") as f:
                f.write(svg_bytes)
                
            return JSONResponse({
                "success": True,
                "message": f"SVG 刀模檔成功儲存至：\n{svg_path}",
                "mockup_b64": ""
            })

        # 1. 渲染 3D 模擬圖 (其他非厚切商品保留原有邏輯)
        mockup_bytes, mask_bytes = render_3d_mockup(img_bytes, shape_info, clasp_type, bg_bytes)

        # 1.5. AI 重繪五金扣（選用）
        if use_ai_render and clasp_type != "none":
            try:
                mockup_bytes = inpaint_clasp(mockup_bytes, mask_bytes)
            except Exception as e:
                print(f"Inpainting failed: {e}. 使用標準模擬圖。")
                pass

        # 2. 產生 SVG 刀模檔
        svg_bytes = generate_svg_bytes(
            shape_info["dxf_path_mm"],
            shape_info["hole_center_mm"],
            shape_info["hole_radius_mm"],
            img_bytes,
            shape_info["img_w_px"] * shape_info["scale"],
            shape_info["img_h_px"] * shape_info["scale"],
            0, 0,
            is_biz_thick=(product_id == "biz_thick"),
            shape_info=shape_info,
            ticket_type=ticket_type
        )

        # 3. 儲存檔案
        safe_name = customer_name.strip() if customer_name.strip() else f"厚切電子票證-{datetime.datetime.now().strftime('%Y%m%d')}-001"
        base_filename = safe_name

        target_dir = get_target_dir()

        mockup_path = os.path.join(target_dir, f"{base_filename}.PNG")
        svg_path    = os.path.join(target_dir, f"{base_filename}.SVG")

        with open(mockup_path, "wb") as f:
            f.write(mockup_bytes)
        with open(svg_path, "wb") as f:
            f.write(svg_bytes)

        mockup_b64 = base64.b64encode(mockup_bytes).decode("utf-8")

        return JSONResponse({
            "success": True,
            "message": f"Files saved successfully to:\n{mockup_path}\n{svg_path}",
            "mockup_b64": f"data:image/png;base64,{mockup_b64}"
        })
    except Exception as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=500)

@app.post("/api/save_design_file")
async def api_save_design_file(
    filename: str = Form(...),
    svg_content: str = Form(""),
    png_b64: str = Form("")
):
    try:
        target_dir = get_target_dir()
        saved_files = []
        
        if svg_content:
            svg_path = os.path.join(target_dir, f"{filename}.svg")
            with open(svg_path, "w", encoding="utf-8") as f:
                f.write(svg_content)
            saved_files.append(svg_path)
            
        if png_b64 and png_b64.startswith("data:image/"):
            header, encoded = png_b64.split(",", 1)
            png_bytes = base64.b64decode(encoded)
            png_path = os.path.join(target_dir, f"{filename}.png")
            with open(png_path, "wb") as f:
                f.write(png_bytes)
            saved_files.append(png_path)
            
        return JSONResponse({
            "success": True,
            "message": f"設計圖檔已同步儲存至圖檔下載資料夾：\n" + "\n".join(saved_files),
            "target_dir": target_dir
        })
    except Exception as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=500)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
