import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import config from '../../config';
import { saveDomain } from '../../services/merchantShop';
import { errorMessage } from '../../shared/errors';
import styles from './AdminSettings.module.css';

/**
 * Свой домен витрины: магазин открывается на нём с корня (shop.example.ru/product/…),
 * адрес /shop/{slug} на платформе тоже продолжает работать. Домен заработает, когда
 * его DNS будет смотреть на гейтвей платформы — подсказка берётся из VITE_CUSTOM_DOMAIN_TARGET.
 */
const DomainSettings = ({ shop, setShop }) => {
  const saved = shop.customDomain ?? '';
  const [domain, setDomain] = useState(saved);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDomain(saved);
    setError(null);
  }, [saved]);

  const dirty = domain.trim() !== saved;
  const unbinding = !domain.trim() && Boolean(saved);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (saving || !dirty) return;
    if (unbinding && !window.confirm(`Отвязать домен ${saved}? Витрина останется доступна по адресу на платформе.`)) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await saveDomain(domain.trim());
      setShop(updated);
      toast.success(unbinding ? 'Домен отвязан' : 'Домен сохранён');
    } catch (err) {
      const message = errorMessage(err, 'Не удалось сохранить домен');
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <label className={styles.label}>
        Домен
        <input
          type="text"
          name="customDomain"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          className={`${styles.input} ${error ? styles.inputError : ''}`}
          placeholder="shop.example.ru"
          maxLength={253}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={Boolean(error)}
        />
        {error && <span className={styles.fieldError}>{error}</span>}
        {saved && !error && (
          <span className={styles.fieldHint}>
            Витрина: <a href={`https://${saved}`} target="_blank" rel="noreferrer">https://{saved}</a>
          </span>
        )}
      </label>

      {config.customDomainTarget ? (
        <p className={styles.fieldHint}>
          В DNS вашего домена создайте запись <b>CNAME</b> на <b className={styles.keepCase}>{config.customDomainTarget}</b>{' '}
          (для корневого домена без поддомена — запись <b>A</b> на IP этого адреса). Сертификат HTTPS выпустится сам
          при первом заходе, обычно в течение нескольких минут после обновления DNS.
        </p>
      ) : (
        <p className={styles.fieldHint}>
          После сохранения напишите в поддержку платформы — пришлём DNS-запись, которую нужно добавить у регистратора.
        </p>
      )}

      <div className={styles.cardActions}>
        {dirty && <span className={styles.dirtyNote}>Есть несохранённые изменения</span>}
        <button type="submit" className={styles.saveBtn} disabled={saving || !dirty}>
          {saving ? 'Сохраняем…' : unbinding ? 'Отвязать домен' : 'Сохранить домен'}
        </button>
      </div>
    </form>
  );
};

export default DomainSettings;
