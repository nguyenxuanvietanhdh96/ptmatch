#!/usr/bin/env python3
"""Sinh frontend/app/favicon.ico từ cùng hình học với app/icon.svg.

Usage:  python3 scripts/gen-favicon.py

Vì sao cần cả .ico bên cạnh .svg: Next chèn <link rel="icon"> trỏ tới icon.svg,
nhưng trình duyệt, trình đọc RSS và nhiều crawler vẫn dò thẳng /favicon.ico bất
kể thẻ link — thiếu file đó là 404 trên mọi lượt tải trang.

Hình được VẼ LẠI bằng PIL chứ không rasterise SVG, để không phải thêm phụ thuộc
(cairosvg/inkscape). Đổi hình thì phải sửa cả hai nơi — toạ độ dưới đây dùng
đúng hệ 32x32 của app/icon.svg nên đối chiếu rất nhanh.
"""
import os

from PIL import Image, ImageDraw

EMERALD = (5, 150, 105, 255)  # #059669 — emerald-600, màu chủ đạo của site
WHITE = (255, 255, 255, 255)

# Kích thước nhúng trong .ico. 16 là kích thước tab thật; các cỡ lớn dùng cho
# bookmark, thanh tác vụ và màn hình HiDPI.
ICO_SIZES = [16, 32, 48, 64, 128, 256]

# Siêu lấy mẫu rồi thu nhỏ bằng LANCZOS — vẽ thẳng ở 16px cho ra cạnh răng cưa.
SUPERSAMPLE = 8

OUT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "frontend", "app", "favicon.ico",
)


def render(size: int) -> Image.Image:
    """Vẽ icon ở `size` px. Toạ độ theo hệ 32x32 của app/icon.svg."""
    canvas = size * SUPERSAMPLE
    k = canvas / 32.0
    img = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    def rect(x, y, w, h, r, fill):
        draw.rounded_rectangle([x * k, y * k, (x + w) * k, (y + h) * k], radius=r * k, fill=fill)

    rect(0, 0, 32, 32, 7, EMERALD)          # nền bo góc
    rect(11, 15, 10, 2, 1, WHITE)           # đòn tạ
    rect(4.5, 11, 6.5, 10, 2.5, WHITE)      # bánh trái
    rect(21, 11, 6.5, 10, 2.5, WHITE)       # bánh phải

    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    frames = [render(s) for s in ICO_SIZES]
    frames[-1].save(
        OUT,
        format="ICO",
        sizes=[(s, s) for s in ICO_SIZES],
        append_images=frames[:-1],
    )
    print("Đã ghi %s (%d kích thước: %s)" % (OUT, len(ICO_SIZES), ICO_SIZES))


if __name__ == "__main__":
    main()
