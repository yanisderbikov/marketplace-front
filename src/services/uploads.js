/**
 * Прямая загрузка файлов в S3 по presigned URL: бэкенд только подписывает URL
 * (ручка …/presign), а потом привязывает загруженный ключ; сам файл через бэк не проходит.
 * Нарочно мимо apiClient (S3, а не наш API): Bearer-заголовок в запросе к S3 не нужен,
 * а Content-Type входит в подпись — заголовок должен совпадать с presign-запросом.
 * Content-Length тоже в подписи (presign получает size = file.size): браузер сам
 * ставит его по телу PUT, а файл другого размера S3 по этой ссылке не примет.
 */
/**
 * Загружает файлы по очереди: presign(file) → { uploadUrl, key } → PUT в S3.
 * Прогресс общий по всем файлам и считается по байтам, а не по числу файлов:
 * onProgress(percent, { index, count, filename }). Возвращает [{ key, filename }].
 */
export const uploadAllToS3 = async (files, presign, onProgress) => {
  const list = Array.from(files);
  const totalBytes = list.reduce((sum, f) => sum + (f.size || 0), 0);
  let doneBytes = 0;
  const refs = [];
  for (let i = 0; i < list.length; i += 1) {
    const file = list[i];
    const meta = { index: i, count: list.length, filename: file.name };
    onProgress?.(totalBytes ? (doneBytes / totalBytes) * 100 : 0, meta);
    const { uploadUrl, key } = await presign(file);
    await uploadToS3(uploadUrl, file, (filePercent) => {
      const loaded = doneBytes + ((file.size || 0) * filePercent) / 100;
      onProgress?.(totalBytes ? (loaded / totalBytes) * 100 : filePercent, meta);
    });
    doneBytes += file.size || 0;
    refs.push({ key, filename: file.name });
  }
  if (list.length) {
    onProgress?.(100, { index: list.length - 1, count: list.length, filename: list[list.length - 1].name });
  }
  return refs;
};

export const uploadToS3 = (uploadUrl, file, onProgress) =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    if (file.type) xhr.setRequestHeader('Content-Type', file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`S3 ответил ${xhr.status}`));
    xhr.onerror = () => reject(new Error('Не удалось загрузить в S3 (проверьте CORS на бакете)'));
    xhr.send(file);
  });
