import io
import os
from PIL import Image
import torch
import gc

_pipeline = None

def get_inpainting_pipeline():
    global _pipeline
    if _pipeline is None:
        try:
            # Set HuggingFace mirror for faster/more stable downloads in Asia
            os.environ["HF_ENDPOINT"] = "https://hf-mirror.com"
            
            from diffusers import StableDiffusionInpaintPipeline
            model_id = "runwayml/stable-diffusion-inpainting"
            print(f"Loading Stable Diffusion Inpainting pipeline ({model_id})...")
            # Using torch.float16 for speed and VRAM efficiency on RTX 3060
            _pipeline = StableDiffusionInpaintPipeline.from_pretrained(
                model_id,
                torch_dtype=torch.float16,
                variant="fp16"
            )
            _pipeline = _pipeline.to("cuda")
            
            # Enable memory efficient attention if xformers isn't available
            try:
                _pipeline.enable_xformers_memory_efficient_attention()
            except Exception:
                # Fallback
                _pipeline.enable_attention_slicing()
                
            print("Pipeline loaded successfully.")
        except ImportError as e:
            print(f"Error loading pipeline: {e}")
            raise RuntimeError("Inpainting libraries (diffusers, torch) are not installed.")
    return _pipeline

def inpaint_clasp(image_bytes, mask_bytes, prompt="highly detailed photorealistic macro photography of a gold metal keychain clasp securely hooked through a clear acrylic hole, sharp focus, metallic reflections, 8k resolution"):
    """
    Inpaints the given image using the provided mask.
    Only the white areas in the mask will be modified by the AI.
    """
    init_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    mask_image = Image.open(io.BytesIO(mask_bytes)).convert("RGB")
    
    # Resize to standard SD sizes for best results
    # SD 1.5 works best with 512x512. We should scale, inpaint, then paste back.
    # But for a mockup, let's process the whole image if it fits in VRAM, 
    # or just crop the mask area, inpaint, and paste back.
    # For RTX 3060 12GB, we can easily process 768x768 or even 1024x1024.
    orig_size = init_image.size
    
    pipe = get_inpainting_pipeline()
    
    # We will just run it on the scaled version to ensure dimension compatibility (must be multiple of 8)
    w, h = orig_size
    new_w = (w // 8) * 8
    new_h = (h // 8) * 8
    
    if new_w != w or new_h != h:
        init_image = init_image.resize((new_w, new_h), Image.Resampling.LANCZOS)
        mask_image = mask_image.resize((new_w, new_h), Image.Resampling.LANCZOS)
    
    print("Running inpainting pipeline...")
    # Generate
    generator = torch.Generator(device="cuda").manual_seed(42) # fixed seed for consistency or random
    
    result = pipe(
        prompt=prompt,
        image=init_image,
        mask_image=mask_image,
        num_inference_steps=30, # standard
        guidance_scale=7.5,
        generator=generator,
        strength=0.85 # High strength since we want a complete redraw of the clasp based on text
    ).images[0]
    
    if new_w != w or new_h != h:
        result = result.resize((w, h), Image.Resampling.LANCZOS)
        
    out_io = io.BytesIO()
    result.save(out_io, format="JPEG", quality=95)
    
    # Clean up VRAM
    torch.cuda.empty_cache()
    gc.collect()
    
    return out_io.getvalue()
