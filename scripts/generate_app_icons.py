"""
Generador de íconos para Glow Heaven Manager con esquinas redondeadas (squircle)
y soporte multi-resolución con canal alfa transparente para Windows (Taskbar, Start Menu, Desktop)
y PWA Web/Móvil.
"""

import os
from PIL import Image, ImageDraw

def create_rounded_icons():
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    logo_path = os.path.join(root_dir, '..', 'logo.jpeg')
    if not os.path.exists(logo_path):
        logo_path = os.path.join(root_dir, 'build', 'icon.png')
    
    print(f"Cargando logo desde: {logo_path}")
    base_img = Image.open(logo_path).convert('RGBA')
    w, h = base_img.size

    # 1. Crear máscara de esquinas redondeadas con supersampling (2x) para antialiasing perfecto
    scale = 2
    sw, sh = w * scale, h * scale
    # Radio estándar squircle Windows 11 Fluent (~18.75% del tamaño)
    radius_hi = int(w * 0.1875 * scale)

    mask_hi = Image.new('L', (sw, sh), 0)
    draw_hi = ImageDraw.Draw(mask_hi)
    draw_hi.rounded_rectangle([(0, 0), (sw - 1, sh - 1)], radius=radius_hi, fill=255)
    mask = mask_hi.resize((w, h), Image.Resampling.LANCZOS)

    # 2. Aplicar máscara alfa al logo
    rounded_img = base_img.copy()
    rounded_img.putalpha(mask)

    # 3. Trazo sutil de borde para definición en fondos claros y oscuros
    border_hi = Image.new('RGBA', (sw, sh), (0, 0, 0, 0))
    bdraw = ImageDraw.Draw(border_hi)
    stroke_width = max(1, int(2 * scale))
    bdraw.rounded_rectangle(
        [(stroke_width // 2, stroke_width // 2), (sw - 1 - stroke_width // 2, sh - 1 - stroke_width // 2)],
        radius=radius_hi,
        outline=(120, 100, 90, 42),
        width=stroke_width
    )
    border = border_hi.resize((w, h), Image.Resampling.LANCZOS)
    master_icon = Image.alpha_composite(rounded_img, border)

    # 4. Exportar a 512x512 maestro
    icon_512 = master_icon.resize((512, 512), Image.Resampling.LANCZOS)

    # Lista de rutas a actualizar
    build_dir = os.path.join(root_dir, 'build')
    public_dir = os.path.join(root_dir, 'src', 'renderer', 'public')
    mobile_icons_dir = os.path.join(root_dir, 'mobile', 'public', 'icons')

    os.makedirs(build_dir, exist_ok=True)
    os.makedirs(public_dir, exist_ok=True)

    # Guardar PNGs principales
    build_png = os.path.join(build_dir, 'icon.png')
    public_png = os.path.join(public_dir, 'icon.png')
    icon_512.save(build_png, format='PNG')
    icon_512.save(public_png, format='PNG')
    print(f"[OK] Guardado: {build_png}")
    print(f"[OK] Guardado: {public_png}")

    # Guardar ICO multi-resolución para Windows
    ico_sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (24, 24), (16, 16)]
    build_ico = os.path.join(build_dir, 'icon.ico')
    public_ico = os.path.join(public_dir, 'icon.ico')
    icon_512.save(build_ico, format='ICO', sizes=ico_sizes)
    icon_512.save(public_ico, format='ICO', sizes=ico_sizes)
    print(f"[OK] Guardado: {build_ico} ({ico_sizes})")
    print(f"[OK] Guardado: {public_ico} ({ico_sizes})")

    # Guardar Favicon
    favicon_sizes = [(64, 64), (32, 32), (24, 24), (16, 16)]
    public_fav = os.path.join(public_dir, 'favicon.ico')
    icon_512.save(public_fav, format='ICO', sizes=favicon_sizes)
    print(f"[OK] Guardado: {public_fav} ({favicon_sizes})")

    # Guardar en mobile si existe el directorio
    if os.path.exists(mobile_icons_dir):
        mobile_512 = os.path.join(mobile_icons_dir, 'icon-512.png')
        mobile_192 = os.path.join(mobile_icons_dir, 'icon-192.png')
        icon_512.save(mobile_512, format='PNG')
        icon_192 = master_icon.resize((192, 192), Image.Resampling.LANCZOS)
        icon_192.save(mobile_192, format='PNG')
        print(f"[OK] Guardado: {mobile_512}")
        print(f"[OK] Guardado: {mobile_192}")

    # Sincronizar con dist/ si ya fue compilado previamente
    dist_dir = os.path.join(root_dir, 'dist')
    if os.path.exists(dist_dir):
        icon_512.save(os.path.join(dist_dir, 'icon.png'), format='PNG')
        icon_512.save(os.path.join(dist_dir, 'icon.ico'), format='ICO', sizes=ico_sizes)
        icon_512.save(os.path.join(dist_dir, 'favicon.ico'), format='ICO', sizes=favicon_sizes)
        print("[OK] Sincronizado con dist/")

    dist_mobile_icons = os.path.join(root_dir, 'dist-mobile', 'icons')
    if os.path.exists(dist_mobile_icons):
        icon_512.save(os.path.join(dist_mobile_icons, 'icon-512.png'), format='PNG')
        icon_192 = master_icon.resize((192, 192), Image.Resampling.LANCZOS)
        icon_192.save(os.path.join(dist_mobile_icons, 'icon-192.png'), format='PNG')
        print("[OK] Sincronizado con dist-mobile/icons/")

    print("\n¡Íconos redondeados generados con éxito!")

if __name__ == '__main__':
    create_rounded_icons()
