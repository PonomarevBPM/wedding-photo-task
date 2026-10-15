"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { event, MAX_NAME_LENGTH, randomTask, tasks, type Task } from "@/lib/event";
import { createUploadId, preparePhoto } from "@/lib/photo";

type Stage = "name" | "task" | "preview" | "success";
type Prepared = { file: File; url: string; uploadId: string; task: Task; guestName: string };
const STORAGE_KEY = "wedding-guest-name";

function CameraIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 6l1.5-2h5L16 6h4a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V7a1 1 0 011-1h4Z" stroke="currentColor" strokeWidth="1.5" /><circle cx="12" cy="13" r="4" stroke="currentColor" strokeWidth="1.5" /></svg>;
}

export default function PhotoQuest() {
  const [stage, setStage] = useState<Stage>("name");
  const [guestName, setGuestName] = useState("");
  const [task, setTask] = useState<Task>(tasks[0]);
  const [photo, setPhoto] = useState<Prepared | null>(null);
  const [busy, setBusy] = useState<"preparing" | "uploading" | null>(null);
  const [error, setError] = useState("");
  const [sentCount, setSentCount] = useState(0);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const processing = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    setTask(randomTask());
    try {
      const saved = localStorage.getItem(STORAGE_KEY)?.trim();
      if (saved && saved.length <= MAX_NAME_LENGTH) { setGuestName(saved); setStage("task"); }
    } catch { /* Имя можно вводить даже при отключённом localStorage. */ }
  }, []);

  useEffect(() => { heading.current?.focus(); }, [stage]);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url); }, [photo]);

  function saveName(e: FormEvent) {
    e.preventDefault();
    const name = guestName.trim();
    if (!name || name.length > MAX_NAME_LENGTH || /[\p{Cc}]/u.test(name)) { setError("Укажи своё имя — от 1 до 80 символов."); return; }
    setGuestName(name);
    try { localStorage.setItem(STORAGE_KEY, name); } catch { /* Не блокировать гостя. */ }
    setError("");
    setStage("task");
  }

  async function choosePhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || processing.current) return;
    processing.current = true;
    setBusy("preparing");
    setError("");
    try {
      const prepared = await preparePhoto(file);
      setPhoto({ file: prepared, url: URL.createObjectURL(prepared), uploadId: createUploadId(), task, guestName: guestName.trim() });
      setStage("preview");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Не получилось подготовить фото."); }
    finally { processing.current = false; setBusy(null); }
  }

  async function sendPhoto() {
    if (!photo || processing.current) return;
    processing.current = true;
    setBusy("uploading");
    setError("");
    const data = new FormData();
    data.set("photo", photo.file);
    data.set("guestName", photo.guestName);
    data.set("taskId", photo.task.id);
    data.set("uploadId", photo.uploadId);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);
    try {
      const response = await fetch("/api/photos", { method: "POST", body: data, signal: controller.signal });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.message || "Не получилось отправить фото. Попробуй ещё раз.");
      if (result?.uploadId !== photo.uploadId) throw new Error("Сохранение ещё не подтверждено. Повтори отправку.");
      setSentCount((count) => count + 1);
      setStage("success");
      setPhoto(null);
    } catch (failure) {
      setError(controller.signal.aborted ? "Отправка заняла слишком много времени. Фото осталось здесь — попробуй ещё раз." : failure instanceof Error ? failure.message : "Проверь интернет и повтори отправку.");
    } finally { clearTimeout(timeout); processing.current = false; setBusy(null); }
  }

  function nextTask(change = true) {
    if (change) setTask(randomTask(task.id));
    setPhoto(null);
    setError("");
    setStage("task");
  }

  return (
    <main className="page-shell">
      <header className="site-header">
        <a className="wordmark" href="/" aria-label="Любовь в кадре, главная"><span className="brand-icon" aria-hidden="true">♡</span><span>{event.title}</span></a>
        <span className="header-note">Свадебная фотоистория</span>
      </header>

      <div className="intro"><span className="eyebrow">СОХРАНИМ ЭТОТ ДЕНЬ ВМЕСТЕ</span><p>У каждого момента<br /><span>есть свой фотограф.</span></p></div>

      <section className="quest-card" aria-busy={!!busy}>
        <div className="card-top"><span className="little-label">{stage === "name" ? "РАДЫ ТЕБЯ ВИДЕТЬ" : stage === "preview" ? "ТВОЙ МОМЕНТ" : stage === "success" ? "В ОБЩУЮ КОПИЛКУ" : "ТВОЁ ФОТОЗАДАНИЕ"}</span><span className="small-flower" aria-hidden="true">✳</span></div>

        {stage === "name" && <>
          <div className="card-symbol" aria-hidden="true">♡</div>
          <h1 ref={heading} tabIndex={-1}>Давай знакомиться</h1>
          <p className="card-description">Лови улыбки, объятия и всё самое тёплое.<br />А мы передадим твои фото молодожёнам.</p>
          <form onSubmit={saveName} className="name-form">
            <label htmlFor="guest-name">Как тебя зовут?</label>
            <input id="guest-name" name="name" autoComplete="name" placeholder="Например, Саша Иванова" value={guestName} onChange={(e) => setGuestName(e.target.value)} maxLength={MAX_NAME_LENGTH} required aria-describedby={error ? "quest-error" : undefined} />
            <button className="button primary" type="submit">Получить задание <span aria-hidden="true">↗</span></button>
          </form>
          <p className="fine-print">Имя нужно, чтобы молодожёны знали, кому сказать спасибо.</p>
        </>}

        {stage === "task" && <>
          <div className="card-symbol" aria-hidden="true">{task.symbol}</div>
          <h1 ref={heading} tabIndex={-1}>{task.title}</h1>
          <p className="card-description task-description">{task.description}</p>
          <div className="hint"><span aria-hidden="true">✧</span><p>{task.hint}</p></div>
          <div className="actions">
            <button className="button primary" disabled={!!busy} onClick={() => camera.current?.click()}><CameraIcon />{busy === "preparing" ? "Готовим фотографию…" : "Сделать фото"}</button>
            <button className="button secondary" disabled={!!busy} onClick={() => gallery.current?.click()}>Выбрать из галереи</button>
            <button className="text-button switch-task" disabled={!!busy} onClick={() => { setTask(randomTask(task.id)); setError(""); }}><span aria-hidden="true">⤨</span> Другое задание</button>
          </div>
        </>}

        {stage === "preview" && photo && <>
          <h1 ref={heading} tabIndex={-1} className="preview-title">Красивый момент?</h1>
          <p className="preview-description">{photo.task.description}</p>
          <div className="photo-frame"><img src={photo.url} alt={`Фотография для задания «${photo.task.title}»`} /></div>
          <div className="photo-details"><span>Фото от {photo.guestName}</span><span>{(photo.file.size / 1024 / 1024).toFixed(1)} МБ</span></div>
          <div className="actions">
            <button className="button primary" disabled={!!busy} onClick={sendPhoto}>{busy === "uploading" ? <><span className="spinner" /> Отправляем…</> : <>Отправить фото <span aria-hidden="true">↗</span></>}</button>
            <button className="button secondary" disabled={!!busy} onClick={() => camera.current?.click()}>{busy === "preparing" ? "Готовим фотографию…" : "Переснять"}</button>
            <button className="text-button" disabled={!!busy} onClick={() => gallery.current?.click()}>Выбрать другое фото</button>
            <button className="text-button muted" disabled={!!busy} onClick={() => nextTask(false)}>Вернуться к заданию</button>
          </div>
          <p className="fine-print">Фотографию увидит организатор свадьбы.</p>
        </>}

        {stage === "success" && <>
          <div className="card-symbol success-symbol" aria-hidden="true">✓</div>
          <h1 ref={heading} tabIndex={-1}>Момент сохранён!</h1>
          <p className="card-description">Спасибо, {guestName}.<br />Ещё одно воспоминание для молодожёнов.</p>
          <div className="success-note"><span aria-hidden="true">♡</span> {sentCount === 1 ? "Первое фото в этой сессии. Отличное начало." : `Уже ${sentCount} фото в этой сессии. Спасибо!`}</div>
          <div className="actions"><button className="button primary" onClick={() => nextTask()}>Следующее задание <span aria-hidden="true">↗</span></button><button className="button secondary" onClick={() => nextTask(false)}>Ещё фото по этому заданию</button></div>
        </>}

        {error && <div id="quest-error" className="error-message" role="alert">{error}</div>}
        <div className="status-message" role="status" aria-live="polite">{busy === "preparing" ? "Подготавливаем фото для отправки." : busy === "uploading" ? "Сохраняем фото. Не закрывай страницу." : ""}</div>
        <input ref={camera} type="file" accept="image/*" capture="environment" onChange={choosePhoto} hidden aria-label="Снять фотографию" />
        <input ref={gallery} type="file" accept="image/*" onChange={choosePhoto} hidden aria-label="Выбрать фотографию" />
      </section>

      {stage !== "name" && <div className="guest-line"><span>Ты — <strong>{guestName}</strong></span><button className="text-button" disabled={!!busy} onClick={() => { setPhoto(null); setError(""); setStage("name"); }}>Изменить имя</button></div>}

      <section className="how-it-works" aria-label="Как это работает"><div><span className="step-number">01</span><span>Лови момент</span></div><span className="step-line" /><div><span className="step-number">02</span><span>Делай фото</span></div><span className="step-line" /><div><span className="step-number">03</span><span>Делись теплом</span></div></section>
      <footer><span aria-hidden="true">♡</span><p>Не идеальные кадры.<br />Настоящие воспоминания.</p></footer>
    </main>
  );
}
