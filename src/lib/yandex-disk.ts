import { createHash } from "node:crypto";
import { UploadError } from "./validation";

const API = "https://cloud-api.yandex.net/v1/disk";
type Resource = { md5?: string; size?: number; type?: string };

export class YandexDisk {
  constructor(private token: string, private transport: typeof fetch = fetch) {}

  private async request(endpoint: string, params: Record<string, string>, method = "GET") {
    return this.transport(`${API}${endpoint}?${new URLSearchParams(params)}`, {
      method, headers: { Authorization: `OAuth ${this.token}` }, signal: AbortSignal.timeout(15_000), cache: "no-store",
    });
  }

  private fail(status: number): never {
    if (status === 401 || status === 403) throw new UploadError("STORAGE_AUTH", "Отправка временно недоступна. Сообщи организатору.", 503);
    if (status === 507) throw new UploadError("STORAGE_FULL", "В архиве закончилось место. Сообщи организатору.", 503);
    throw new UploadError("STORAGE_UNAVAILABLE", "Не получилось связаться с архивом. Попробуй отправить ещё раз.", 503);
  }

  async ensureFolders(path: string) {
    const match = /^(disk:|app:)\/(.*)$/.exec(path);
    if (!match || !match[2] || match[2].split("/").some((part) => !part || part === "." || part === "..")) {
      throw new UploadError("STORAGE_CONFIG", "Отправка временно недоступна. Сообщи организатору.", 503);
    }
    let current = match[1];
    for (const part of match[2].split("/")) {
      current += `/${part}`;
      const response = await this.request("/resources", { path: current }, "PUT");
      if (response.status === 409) {
        const resource = await this.metadata(current);
        if (resource?.type !== "dir") this.fail(409);
      } else if (!response.ok) this.fail(response.status);
    }
  }

  private async metadata(path: string): Promise<Resource | null> {
    const response = await this.request("/resources", { path, fields: "md5,size,type" });
    if (response.status === 404) return null;
    if (!response.ok) this.fail(response.status);
    return response.json();
  }

  private async confirmed(path: string, md5: string, size: number) {
    const saved = await this.metadata(path);
    if (!saved) return false;
    if (saved.md5 !== md5 || saved.size !== size) {
      throw new UploadError("UPLOAD_CONFLICT", "Эта отправка уже содержит другое фото. Выбери фотографию заново.", 409);
    }
    return true;
  }

  async upload(path: string, bytes: Uint8Array, contentType: string) {
    const md5 = createHash("md5").update(bytes).digest("hex");
    if (await this.confirmed(path, md5, bytes.byteLength)) return;
    const response = await this.request("/resources/upload", { path, overwrite: "false" });
    if (response.status === 409) {
      if (await this.confirmed(path, md5, bytes.byteLength)) return;
      this.fail(409);
    }
    if (!response.ok) this.fail(response.status);
    const { href, method } = await response.json();
    const url = typeof href === "string" ? new URL(href) : null;
    if (!url || url.protocol !== "https:" || !/(^|\.)disk\.yandex\.(net|ru)$/.test(url.hostname) || method !== "PUT") this.fail(502);
    // OAuth-токен не отправляется на URL загрузчика.
    const uploaded = await this.transport(url!, {
      method: "PUT", body: new Uint8Array(bytes), headers: { "Content-Type": contentType }, signal: AbortSignal.timeout(30_000),
    });
    if (!uploaded.ok && uploaded.status !== 409) this.fail(uploaded.status);
    for (let attempt = 0; attempt < 3; attempt++) {
      if (await this.confirmed(path, md5, bytes.byteLength)) return;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new UploadError("UNCONFIRMED", "Архив ещё не подтвердил сохранение. Попробуй отправить ещё раз.", 503);
  }
}
