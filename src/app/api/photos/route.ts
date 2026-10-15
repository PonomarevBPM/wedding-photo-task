import sharp from "sharp";
import { event, MAX_PHOTO_BYTES } from "@/lib/event";
import { safeGuestName, UploadError, validateFields } from "@/lib/validation";
import { YandexDisk } from "@/lib/yandex-disk";

export const runtime = "nodejs";
export const maxDuration = 60;

async function readForm(request: Request) {
  const maxRequest = MAX_PHOTO_BYTES + 64 * 1024;
  if (Number(request.headers.get("content-length")) > maxRequest) throw new UploadError("TOO_LARGE", "Фото слишком большое.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new UploadError("EMPTY_REQUEST", "Фотография не получена.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > maxRequest) { await reader.cancel(); throw new UploadError("TOO_LARGE", "Фото слишком большое.", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try {
    return await new Response(Buffer.concat(chunks), { headers: { "Content-Type": request.headers.get("content-type") ?? "" } }).formData();
  } catch { throw new UploadError("INVALID_REQUEST", "Не получилось прочитать отправку."); }
}

export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    // Next.js может собирать request.url с адресом прослушивания (0.0.0.0).
    // Host содержит адрес, по которому браузер действительно открыл сайт.
    const host = request.headers.get("host") ?? new URL(request.url).host;
    let validOrigin = true;
    if (origin) {
      try {
        const source = new URL(origin);
        validOrigin = ["http:", "https:"].includes(source.protocol)
          && source.origin === origin
          && source.host.toLowerCase() === host.toLowerCase();
      } catch { validOrigin = false; }
    }
    if (!validOrigin || request.headers.get("sec-fetch-site") === "cross-site") {
      throw new UploadError("INVALID_ORIGIN", "Открой приложение по основной ссылке.", 403);
    }
    if (process.env.PHOTO_UPLOADS_ENABLED === "false") throw new UploadError("CLOSED", "Приём фотографий завершён. Спасибо за участие!", 403);
    const fields = validateFields(await readForm(request));
    const bytes = Buffer.from(await fields.photo.arrayBuffer());
    try {
      const decoder = sharp(bytes, { limitInputPixels: 40_000_000, failOn: "warning" });
      const meta = await decoder.metadata();
      if (meta.format !== "jpeg" || !meta.width || !meta.height || meta.width > 4096 || meta.height > 4096) throw new Error("Invalid JPEG");
      await decoder.stats();
    } catch { throw new UploadError("INVALID_PHOTO", "Не получилось прочитать JPEG. Выбери фотографию заново."); }
    const token = process.env.YANDEX_DISK_TOKEN?.trim();
    if (!token) throw new UploadError("NOT_CONFIGURED", "Организатор ещё не подключил архив. Попробуй отправить позже.", 503);
    const root = (process.env.YANDEX_DISK_ROOT?.trim() || "disk:/wedding").replace(/\/+$/, "");
    const disk = new YandexDisk(token);
    const folder = `${root}/${event.id}/${fields.task.id}`;
    await disk.ensureFolders(folder);
    await disk.upload(`${folder}/${safeGuestName(fields.guestName)}__${fields.uploadId}.jpg`, bytes, "image/jpeg");
    return Response.json({ uploadId: fields.uploadId }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const expected = error instanceof UploadError;
    console.error("photo_upload_failed", expected ? error.code : "NETWORK_OR_INTERNAL");
    return Response.json({ code: expected ? error.code : "TEMPORARY_ERROR", message: expected ? error.message : "Отправка прервалась. Проверь интернет и попробуй ещё раз." }, { status: expected ? error.status : 503, headers: { "Cache-Control": "no-store" } });
  }
}
