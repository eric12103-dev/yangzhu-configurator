import cv2
import numpy as np
from shapely.geometry import Polygon, Point, MultiPolygon
from shapely.ops import unary_union
from PIL import Image, ImageDraw, ImageFilter, ImageOps
import io
import rembg

def remove_background(img_bytes: bytes) -> bytes:
    """Uses rembg to remove the background of an image."""
    try:
        # Load image with PIL to check format
        input_image = Image.open(io.BytesIO(img_bytes))
        
        # rembg automatically uses GPU if onnxruntime-gpu is installed
        output_image = rembg.remove(input_image)
        
        # Save to bytes
        out_io = io.BytesIO()
        output_image.save(out_io, format="PNG")
        return out_io.getvalue()
    except Exception as e:
        raise ValueError(f"Background removal failed: {str(e)}")

def get_acrylic_shape(img_bytes: bytes, max_size_mm: float, margin_mm: float, hole_diameter_mm: float, hole_position: str = "center"):
    """
    Analyzes transparent PNG, calculates scale, and returns the path in pixels and mm.
    """
    img_array = np.frombuffer(img_bytes, np.uint8)
    img = cv2.imdecode(img_array, cv2.IMREAD_UNCHANGED)
    
    if img is None or img.shape[2] != 4:
        raise ValueError("Image must have an alpha channel (transparent PNG).")

    alpha = img[:, :, 3]
    _, mask = cv2.threshold(alpha, 10, 255, cv2.THRESH_BINARY)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    if not contours:
        raise ValueError("No opaque content found in the image.")
        
    largest_contour = max(contours, key=cv2.contourArea)
    contour_points = largest_contour.reshape(-1, 2)
    
    poly = Polygon(contour_points)
    if not poly.is_valid:
        poly = poly.buffer(0)
        
    h, w = img.shape[:2]
    max_px = max(h, w)
    scale = max_size_mm / max_px  # mm per pixel
    
    margin_px = margin_mm / scale
    buffered_poly = poly.buffer(margin_px, join_style=1)
    simplified_poly = buffered_poly.simplify(1.0, preserve_topology=True)
    
    if isinstance(simplified_poly, MultiPolygon):
        simplified_poly = max(simplified_poly.geoms, key=lambda a: a.area)
        
    from shapely.geometry import LineString
    
    # Add Hole (Ear)
    min_x, min_y, max_x, max_y = simplified_poly.bounds
    
    if isinstance(hole_position, (int, float)):
        ratio = max(0.0, min(1.0, float(hole_position)))
        center_x = min_x + (max_x - min_x) * ratio
    else:
        try:
            ratio = max(0.0, min(1.0, float(hole_position)))
            center_x = min_x + (max_x - min_x) * ratio
        except ValueError:
            if hole_position == "left":
                center_x = min_x + (max_x - min_x) * 0.3
            elif hole_position == "right":
                center_x = min_x + (max_x - min_x) * 0.7
            else:
                center_x = (min_x + max_x) / 2
    
    hole_radius_mm = hole_diameter_mm / 2.0
    hole_radius_px = hole_radius_mm / scale
    ear_radius_px = hole_radius_px + (4.0 / scale) # Increased to 4.0mm border
    
    # Find exact top edge at center_x
    vertical_line = LineString([(center_x, min_y - 100), (center_x, max_y + 100)])
    intersection = simplified_poly.intersection(vertical_line)
    
    intersect_y = min_y
    if not intersection.is_empty:
        if intersection.geom_type == 'LineString':
            intersect_y = min([p[1] for p in intersection.coords])
        elif intersection.geom_type == 'MultiLineString':
            intersect_y = min([min([p[1] for p in line.coords]) for line in intersection.geoms])
        elif intersection.geom_type == 'Point':
            intersect_y = intersection.y
    
    # Position ear slightly below the top edge so it smoothly joins
    ear_center_x = center_x
    ear_center_y = intersect_y - (ear_radius_px * 0.7) # Protrude more
    
    if hole_diameter_mm > 0:
        ear_shape = Point(ear_center_x, ear_center_y).buffer(ear_radius_px)
        final_acrylic_shape = unary_union([simplified_poly, ear_shape])
    else:
        final_acrylic_shape = simplified_poly
        
    if isinstance(final_acrylic_shape, MultiPolygon):
        final_acrylic_shape = max(final_acrylic_shape.geoms, key=lambda a: a.area)
        
    final_path_px = list(final_acrylic_shape.exterior.coords)
    
    dxf_path_mm = [(x * scale, y * scale) for x, y in final_path_px]
    hole_center_mm = (ear_center_x * scale, ear_center_y * scale) if hole_diameter_mm > 0 else None
    
    return {
        "final_path_px": final_path_px,
        "dxf_path_mm": dxf_path_mm,
        "hole_center_px": (ear_center_x, ear_center_y) if hole_diameter_mm > 0 else None,
        "hole_radius_px": hole_radius_px,
        "hole_center_mm": hole_center_mm,
        "hole_radius_mm": hole_radius_mm,
        "scale": scale,
        "img_w_px": w,
        "img_h_px": h,
        "bounds_px": final_acrylic_shape.bounds
    }

def draw_preview_die(shape_info, img_bytes):
    """Draws the uploaded image with the red die line and hole overlay, dynamically padding canvas to prevent clipping."""
    pil_img = Image.open(io.BytesIO(img_bytes)).convert("RGBA")
    
    # Calculate padding needed to fit the die line
    min_x, min_y, max_x, max_y = shape_info["bounds_px"]
    pad_left = int(max(0, -min_x + 20))
    pad_top = int(max(0, -min_y + 20))
    pad_right = int(max(0, max_x - pil_img.width + 20))
    pad_bottom = int(max(0, max_y - pil_img.height + 20))
    
    new_w = pil_img.width + pad_left + pad_right
    new_h = pil_img.height + pad_top + pad_bottom
    
    preview = Image.new('RGBA', (new_w, new_h), (0, 0, 0, 0))
    
    # Draw original image with 80% opacity
    faded_img = pil_img.copy()
    faded_img.putalpha(faded_img.getchannel('A').point(lambda i: i * 0.8))
    preview.paste(faded_img, (pad_left, pad_top))
    
    draw = ImageDraw.Draw(preview)
    
    # Draw outline with offset
    shifted_path = [(x + pad_left, y + pad_top) for x, y in shape_info["final_path_px"]]
    draw.polygon(shifted_path, outline="red", width=1, fill=None)
    
    # Draw hole prominently with offset
    hc = shape_info["hole_center_px"]
    hr = shape_info["hole_radius_px"]
    if hc and hr:
        cx, cy = hc[0] + pad_left, hc[1] + pad_top
        draw.ellipse([cx-hr, cy-hr, cx+hr, cy+hr], fill="white", outline="blue", width=2)
        
    out_io = io.BytesIO()
    preview.save(out_io, format="PNG")
    return out_io.getvalue()

def render_3d_mockup(img_bytes, shape_info, clasp_type="none", bg_bytes=None):
    """Renders the 3D-like acrylic mockup with dual view (Front and Side)."""
    from PIL import ImageFont
    
    pil_img = Image.open(io.BytesIO(img_bytes)).convert("RGBA")
    f_min_x, f_min_y, f_max_x, f_max_y = shape_info["bounds_px"]
    
    # Calculate sizes
    front_w = int(f_max_x - f_min_x)
    front_h = int(f_max_y - f_min_y)
    
    # Expand canvas to fit shadow, dimensions, and side view
    pad_top = 180
    pad_bottom = 150
    pad_left = 350 # Increased padding to prevent dimension cutoff
    gap = 200 # gap between front and side view
    side_w = 40 # width of the 4mm acrylic side view
    pad_right = 150
    
    canvas_w = pad_left + front_w + gap + side_w + pad_right
    canvas_h = pad_top + front_h + pad_bottom
    
    
    # Base background
    final_mockup = Image.new('RGBA', (canvas_w, canvas_h), (30, 30, 30, 255))
    
    # Mask for inpainting (black background, white where we want AI to redraw)
    ai_mask = Image.new('L', (canvas_w, canvas_h), 0)
    mask_draw = ImageDraw.Draw(ai_mask)
    
    if bg_bytes:
        try:
            bg_img = Image.open(io.BytesIO(bg_bytes)).convert("RGBA")
            # cover scale
            scale = max(canvas_w / bg_img.width, canvas_h / bg_img.height)
            new_w, new_h = int(bg_img.width * scale), int(bg_img.height * scale)
            bg_img = bg_img.resize((new_w, new_h), Image.Resampling.LANCZOS)
            cx, cy = (new_w - canvas_w) // 2, (new_h - canvas_h) // 2
            bg_img = bg_img.crop((cx, cy, cx + canvas_w, cy + canvas_h))
            final_mockup.paste(bg_img, (0, 0))
        except Exception:
            pass
            
    # Front View offsets
    offset_x = pad_left - int(f_min_x)
    offset_y = pad_top - int(f_min_y)
    
    acrylic_coords = [(x + offset_x, y + offset_y) for x, y in shape_info["final_path_px"]]
    
    # --- 1. FRONT VIEW: Shadow ---
    shadow = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_coords = [(x + 20, y + 20) for x, y in acrylic_coords]
    shadow_draw.polygon(shadow_coords, fill=(0, 0, 0, 150))
    shadow = shadow.filter(ImageFilter.GaussianBlur(15))
    final_mockup = Image.alpha_composite(final_mockup, shadow)
    
    # --- 2. FRONT VIEW: 3D Extrusion (Thickness) ---
    extrusion_depth = 12
    for i in range(extrusion_depth, 0, -1):
        layer = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))
        draw = ImageDraw.Draw(layer)
        # shift right and down
        offset_coords = [(x + i, y + i) for x, y in acrylic_coords]
        if i == extrusion_depth:
            draw.polygon(offset_coords, fill=(80, 90, 100, 200)) # bottom rim (dark glass)
        else:
            draw.polygon(offset_coords, fill=(150, 160, 170, 150)) # glass body
        final_mockup = Image.alpha_composite(final_mockup, layer)

    # --- 3. FRONT VIEW: Top Surface ---
    shape_layer = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))
    shape_draw = ImageDraw.Draw(shape_layer)
    # very transparent white for clear acrylic
    shape_draw.polygon(acrylic_coords, fill=(255, 255, 255, 20), outline=(220, 220, 220, 180))
    
    # Hole cut
    hc = shape_info["hole_center_px"]
    hr = shape_info["hole_radius_px"]
    hx, hy = 0, 0
    if hc and hr:
        hx, hy = hc[0] + offset_x, hc[1] + offset_y
        shape_draw.ellipse([hx-hr, hy-hr, hx+hr, hy+hr], fill=(0,0,0,0), outline=(150, 160, 170, 200))
        # Draw hole extrusion inside
        for i in range(extrusion_depth):
            shape_draw.arc([hx-hr+i, hy-hr+i, hx+hr+i, hy+hr+i], 0, 360, fill=(100, 110, 120, 80))

    final_mockup = Image.alpha_composite(final_mockup, shape_layer)
    
    # --- 3.5. FRONT VIEW: Jump Ring (Bottom Half) ---
    # Draw the part of the jump ring that goes THROUGH/UNDER the hole
    jump_ring_layer_bottom = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))
    if clasp_type != "none" and hc and hr:
        jr_color = (212, 175, 55, 255) if 'gold' in clasp_type else (200, 200, 200, 255)
        jr_radius = hr * 1.5
        jr_draw = ImageDraw.Draw(jump_ring_layer_bottom)
        # bottom half of ring, make it an oval reaching up to clasp
        jr_draw.arc([hx-jr_radius, hy-hr*2.5, hx+jr_radius, hy+hr*0.8], 0, 180, fill=jr_color, width=6)
        final_mockup = Image.alpha_composite(final_mockup, jump_ring_layer_bottom)
        # Add to mask
        mask_draw.arc([hx-jr_radius, hy-hr*2.5, hx+jr_radius, hy+hr*0.8], 0, 180, fill=255, width=12) # Slightly thicker mask
    
    # --- 4. Paste Image (Front) ---
    final_mockup.paste(pil_img, (offset_x, offset_y), pil_img)
    
    # Add glossy reflection curve
    gloss = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))
    gloss_draw = ImageDraw.Draw(gloss)
    gloss_coords = [(x, y - 2) for x, y in acrylic_coords]
    gloss_draw.polygon(gloss_coords, outline=(255, 255, 255, 150), width=2)
    final_mockup = Image.alpha_composite(final_mockup, gloss)

    # --- 4.1. Add Clasps BEFORE Top Jump Ring ---
    if clasp_type != "none" and hc and hr:
        import os
        clasp_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "frontend", "assets", f"{clasp_type}.png")
        if os.path.exists(clasp_path):
            clasp_img = Image.open(clasp_path).convert("RGBA")
            
            # Auto-crop transparent borders so the bottom exactly matches the metal
            bbox = clasp_img.getbbox()
            if bbox:
                clasp_img = clasp_img.crop(bbox)
            
            # Scale clasp realistically (approx 15mm width)
            target_clasp_w_px = int(15.0 / shape_info["scale"])
            ratio = target_clasp_w_px / clasp_img.width
            cw = target_clasp_w_px
            ch = int(clasp_img.height * ratio)
            clasp_img = clasp_img.resize((cw, ch), Image.Resampling.LANCZOS)
            
            # Paste on Front View (lifted slightly so jump ring can pass through)
            paste_x = int(hx - cw / 2)
            paste_y = int(hy - ch - hr * 1.8)
            final_mockup.paste(clasp_img, (paste_x, paste_y), clasp_img)
            
            # Paste on Side View
            side_x = pad_left + front_w + gap
            hole_y = pad_top + (shape_info["hole_center_px"][1] - int(f_min_y))
            paste_x_side = int(side_x + side_w/2 - cw/2)
            paste_y_side = int(hole_y - ch - hr * 1.8)
            final_mockup.paste(clasp_img, (paste_x_side, paste_y_side), clasp_img)
            
            # Add clasps to mask
            clasp_mask = clasp_img.getchannel('A')
            ai_mask.paste(clasp_mask, (paste_x, paste_y), clasp_mask)
            ai_mask.paste(clasp_mask, (paste_x_side, paste_y_side), clasp_mask)

    # --- 4.5. FRONT VIEW: Jump Ring (Top Half) ---
    jump_ring_layer_top = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))
    if clasp_type != "none" and hc and hr:
        jr_color = (255, 215, 0, 255) if 'gold' in clasp_type else (220, 220, 220, 255) # Brighter top
        jr_radius = hr * 1.5
        jr_draw = ImageDraw.Draw(jump_ring_layer_top)
        # top half of ring
        jr_draw.arc([hx-jr_radius, hy-hr*2.5, hx+jr_radius, hy+hr*0.8], 180, 360, fill=jr_color, width=6)
        # Drop shadow for top ring over acrylic
        jr_shadow = jump_ring_layer_top.copy().filter(ImageFilter.GaussianBlur(2))
        final_mockup = Image.alpha_composite(final_mockup, jr_shadow)
        final_mockup = Image.alpha_composite(final_mockup, jump_ring_layer_top)
        
        # Add to mask
        mask_draw.arc([hx-jr_radius, hy-hr*2.5, hx+jr_radius, hy+hr*0.8], 180, 360, fill=255, width=12)

    # --- 5. SIDE VIEW ---
    side_x = pad_left + front_w + gap
    side_y_start = pad_top
    side_y_end = pad_top + front_h
    
    side_layer = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))
    side_draw = ImageDraw.Draw(side_layer)
    
    # Side shadow
    side_draw.rounded_rectangle([side_x + 10, side_y_start + 10, side_x + side_w + 10, side_y_end + 10], radius=10, fill=(0,0,0,150))
    side_layer = side_layer.filter(ImageFilter.GaussianBlur(10))
    final_mockup = Image.alpha_composite(final_mockup, side_layer)
    
    # Side body
    side_body = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))
    sb_draw = ImageDraw.Draw(side_body)
    # Glassy effect
    sb_draw.rounded_rectangle([side_x, side_y_start, side_x + side_w, side_y_end], radius=10, fill=(200, 210, 220, 120), outline=(150, 160, 170, 200), width=2)
    # Highlights on edges
    sb_draw.line([(side_x+5, side_y_start+10), (side_x+5, side_y_end-10)], fill=(255,255,255,150), width=3)
    sb_draw.line([(side_x+side_w-5, side_y_start+10), (side_x+side_w-5, side_y_end-10)], fill=(120,130,140,150), width=3)
    # Draw hole vertically in side view
    if hc and hr:
        # The hole is near the top
        hole_y = pad_top + (shape_info["hole_center_px"][1] - int(f_min_y))
        sb_draw.rectangle([side_x, hole_y - hr, side_x + side_w, hole_y + hr], fill=(0,0,0,0), outline=(100,110,120,150))
    final_mockup = Image.alpha_composite(final_mockup, side_body)
    
    # Side Jump Ring
    if clasp_type != "none" and hc and hr:
        side_jr = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))
        jr_draw = ImageDraw.Draw(side_jr)
        jr_color = (255, 215, 0, 255) if 'gold' in clasp_type else (220, 220, 220, 255)
        jr_draw.ellipse([side_x+side_w/2-8, hole_y - hr*2.5, side_x+side_w/2+8, hole_y + hr*0.5], outline=jr_color, width=6)
        final_mockup = Image.alpha_composite(final_mockup, side_jr)
        # Add to mask
        mask_draw.ellipse([side_x+side_w/2-8, hole_y - hr*2.5, side_x+side_w/2+8, hole_y + hr*0.5], outline=255, width=12)

    # --- 7. Dimensions Drawing ---
    draw_dim = ImageDraw.Draw(final_mockup)
    
    # Load Font
    font = None
    try:
        font = ImageFont.truetype("C:\\Windows\\Fonts\\msjh.ttc", 36)
    except:
        try:
            font = ImageFont.truetype("arial.ttf", 36)
        except:
            font = ImageFont.load_default()
            
    lc = (212, 175, 55, 255) # Gold color
    
    mm_w = shape_info["img_w_px"] * shape_info["scale"]
    mm_h = shape_info["img_h_px"] * shape_info["scale"]
    
    # Calculate exact bounds of the drawn acrylic shape
    actual_min_x = f_min_x + offset_x
    actual_max_x = f_max_x + offset_x
    actual_min_y = f_min_y + offset_y
    actual_max_y = f_max_y + offset_y
    
    # Front Width (Bottom)
    bx_start = actual_min_x
    bx_end = actual_max_x
    by = pad_top + front_h + 80
    draw_dim.line([(bx_start, by), (bx_end, by)], fill=lc, width=3)
    draw_dim.line([(bx_start, by-15), (bx_start, by+15)], fill=lc, width=3)
    draw_dim.line([(bx_end, by-15), (bx_end, by+15)], fill=lc, width=3)
    text_w = f"約 {int(mm_w)} mm"
    # To center text, we approximate width or use bounding box if available
    tw = draw_dim.textlength(text_w, font=font) if hasattr(draw_dim, 'textlength') else 100
    draw_dim.text((bx_start + (bx_end-bx_start)//2 - tw/2, by + 20), text_w, font=font, fill=lc, stroke_width=3, stroke_fill=(0,0,0,200))

    # Front Height (Left)
    hy_start = actual_min_y
    hy_end = actual_max_y
    hx_line = actual_min_x - 80
    draw_dim.line([(hx_line, hy_start), (hx_line, hy_end)], fill=lc, width=3)
    draw_dim.line([(hx_line-15, hy_start), (hx_line+15, hy_start)], fill=lc, width=3)
    draw_dim.line([(hx_line-15, hy_end), (hx_line+15, hy_end)], fill=lc, width=3)
    text_h = f"約 {int(mm_h)} mm"
    tw_h = draw_dim.textlength(text_h, font=font) if hasattr(draw_dim, 'textlength') else 100
    # draw text rotated or just normally beside it
    draw_dim.text((hx_line - tw_h - 30, hy_start + (hy_end-hy_start)//2 - 20), text_h, font=font, fill=lc, stroke_width=3, stroke_fill=(0,0,0,200))

    # Side Width (Bottom)
    sx_start = side_x
    sx_end = side_x + side_w
    sy = pad_top + front_h + 80
    draw_dim.line([(sx_start, sy), (sx_end, sy)], fill=lc, width=3)
    draw_dim.line([(sx_start, sy-15), (sx_start, sy+15)], fill=lc, width=3)
    draw_dim.line([(sx_end, sy-15), (sx_end, sy+15)], fill=lc, width=3)
    text_s = "約 4 mm"
    tw_s = draw_dim.textlength(text_s, font=font) if hasattr(draw_dim, 'textlength') else 100
    draw_dim.text((sx_start + (sx_end-sx_start)//2 - tw_s/2, sy + 20), text_s, font=font, fill=lc, stroke_width=3, stroke_fill=(0,0,0,200))

    out_io = io.BytesIO()
    # Save as PNG with solid dark background
    solid_bg = Image.new("RGB", final_mockup.size, (30, 30, 30))
    solid_bg.paste(final_mockup, mask=final_mockup.split()[3])
    solid_bg.save(out_io, format="PNG")
    
    mask_io = io.BytesIO()
    # Dilate mask slightly to ensure AI has context around the metal
    ai_mask = ai_mask.filter(ImageFilter.MaxFilter(5)) 
    ai_mask.save(mask_io, format="PNG")
    
    return out_io.getvalue(), mask_io.getvalue()
