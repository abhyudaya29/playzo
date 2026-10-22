"""Decode, bound, and re-encode uploads; never serve original user-supplied bytes."""
import warnings
from io import BytesIO

from fastapi import HTTPException
from PIL import Image, ImageOps, UnidentifiedImageError

MAX_UPLOAD = 5 * 1024 * 1024


def sanitize_avatar(content: bytes) -> bytes:
    if not content or len(content) > MAX_UPLOAD:
        raise HTTPException(413, "Choose an image under 5 MB")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(content)) as image:
                if image.format not in {"JPEG", "PNG", "WEBP"}:
                    raise HTTPException(422, "Choose a JPEG, PNG, or WebP image")
                if image.width * image.height > 20_000_000:
                    raise HTTPException(422, "Image dimensions are too large")
                image.load()
                image = ImageOps.exif_transpose(image).convert("RGB")
                image = ImageOps.fit(image, (512, 512), method=Image.Resampling.LANCZOS)
                output = BytesIO()
                image.save(output, format="WEBP", quality=85, exif=b"")
                return output.getvalue()
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise HTTPException(422, "This image could not be read") from exc
