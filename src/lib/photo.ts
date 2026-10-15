import { MAX_PHOTO_BYTES } from "./event";

export function createUploadId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // getRandomValues доступен и при локальном просмотре по HTTP с телефона.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } catch {
    throw new Error("Не получилось открыть фотографию. Попробуй снять новое фото или выбрать JPEG из галереи.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function preparePhoto(file: File): Promise<File> {
  if (file.size > 40 * 1024 * 1024) throw new Error("Фото слишком большое. Выбери файл меньше 40 МБ.");
  const image = await loadImage(file);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Не получилось обработать фото в этом браузере.");
  let longest = Math.min(2560, Math.max(image.naturalWidth, image.naturalHeight));
  for (let resize = 0; resize < 4; resize++) {
    const ratio = longest / Math.max(image.naturalWidth, image.naturalHeight);
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.85, 0.75, 0.65]) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= MAX_PHOTO_BYTES) {
        return new File([blob], "photo.jpg", { type: "image/jpeg" });
      }
    }
    longest = Math.round(longest * 0.75);
  }
  throw new Error("Не получилось уменьшить фотографию. Попробуй другой снимок.");
}
