import { MAX_NAME_LENGTH, MAX_PHOTO_BYTES, tasks } from "./event";

export class UploadError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}

export function validateFields(form: FormData) {
  const rawName = form.get("guestName");
  const guestName = typeof rawName === "string" ? rawName.trim().normalize("NFC") : "";
  if (!guestName || guestName.length > MAX_NAME_LENGTH || /[\p{Cc}]/u.test(guestName)) {
    throw new UploadError("INVALID_NAME", "Укажи имя от 1 до 80 символов.");
  }
  const taskId = form.get("taskId");
  const task = tasks.find((item) => item.id === taskId);
  if (!task) throw new UploadError("INVALID_TASK", "Задание не найдено. Обнови страницу.");
  const uploadId = form.get("uploadId");
  if (typeof uploadId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uploadId)) {
    throw new UploadError("INVALID_ID", "Не получилось определить отправку. Выбери фото заново.");
  }
  const photo = form.get("photo");
  if (!(photo instanceof File) || photo.type !== "image/jpeg" || !photo.size || photo.size > MAX_PHOTO_BYTES) {
    throw new UploadError("INVALID_PHOTO", "Нужна фотография JPEG размером до 3 МБ.");
  }
  return { guestName, task, uploadId: uploadId.toLowerCase(), photo };
}

export function safeGuestName(name: string) {
  return name.normalize("NFC").replace(/[^\p{L}\p{N} _-]/gu, "").trim().replace(/\s+/g, "_").slice(0, 80) || "guest";
}
