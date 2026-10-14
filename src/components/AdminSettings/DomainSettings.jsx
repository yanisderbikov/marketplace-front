import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { getDomain, saveDomain, unbindDomain } from '../../services/merchantShop';
import { errorMessage } from '../../shared/errors';
import styles from './AdminSettings.module.css';
import own from './DomainSettings.module.css';

// ShopDomainDTO.status → подпись и цвет плашки.
const STATUS = {
  PENDING: { label: 'ждём DNS', className: own.badgeWait },
  ACTIVE: { label: 'работает', className: styles.badgeOk },
  ERROR: { label: 'ошибка', className: styles.badgeOff },
};

const PURPOSE = {
  ROUTING: 'направляет домен на витрину',
  VERIFICATION: 'подтверждает, что домен ваш',
};

const copy = async (value) => {
  try {
    await navigator.clipboard.writeText(value);
    toast.success('Скопировано');
  } catch {
    toast.error('Не удалось скопировать — выделите текст вручную');
  }
};

const CopyCell = ({ value }) => (
  <button type="button" className={own.copy} onClick={() => copy(value)} title="Скопировать">
    <code>{value}</code>
  </button>
);

/** DNS-записи для регистратора: тип, имя, значение (по клику копируется) и видна ли уже запись. */
const DnsRecords = ({ records }) => (
  <div className={own.tableWrap}>
    <table className={own.table}>
      <thead>
        <tr>
          <th>Тип</th>
          <th>Имя</th>
          <th>Значение</th>
          <th aria-label="Статус" />
        </tr>
      </thead>
      <tbody>
        {records.map((r) => (
          <tr key={`${r.type}-${r.fqdn}`}>
            <td><b>{r.type}</b></td>
            <td><CopyCell value={r.host} /></td>
            <td>
              <CopyCell value={r.value} />
              <span className={own.purpose}>{PURPOSE[r.purpose] ?? ''}</span>
            </td>
            <td className={own.state}>
              {r.ok === true && <span className={own.ok}>✓ видна</span>}
              {r.ok === false && <span className={own.wait}>нет в DNS</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

/**
 * Свой домен витрины: магазин открывается на нём с корня (shop.example.ru/product/…),
 * адрес /shop/{slug} на платформе тоже продолжает работать. После сохранения бэк подключает
 * домен к гейтвею платформы и сразу отдаёт DNS-записи, которые мерчант добавляет у регистратора.
 */
const DomainSettings = ({ shop, setShop }) => {
  const saved = shop.customDomain ?? '';
  const [domain, setDomain] = useState(saved);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  // ShopDomainDTO: { domain, status, message, records }
  const [dns, setDns] = useState(null);
  const [checking, setChecking] = useState(false);
  const [unbinding, setUnbinding] = useState(false);

  useEffect(() => {
    setDomain(saved);
    setError(null);
  }, [saved]);

  const check = useCallback(async ({ quiet = false } = {}) => {
    setChecking(true);
    try {
      setDns(await getDomain());
    } catch (err) {
      if (!quiet) toast.error(errorMessage(err, 'Не удалось проверить домен'));
    } finally {
      setChecking(false);
    }
  }, []);

  // Домен уже привязан — сразу показываем записи и их статус.
  useEffect(() => {
    if (saved) check({ quiet: true });
    else setDns(null);
  }, [saved, check]);

  const dirty = domain.trim() !== saved;
  const cleared = !domain.trim() && Boolean(saved);
  const busy = saving || unbinding;

  const handleUnbind = async () => {
    if (busy || !saved) return;
    if (!window.confirm(`Отвязать домен ${saved}? Витрина останется доступна по адресу на платформе.`)) return;
    setUnbinding(true);
    setError(null);
    try {
      await unbindDomain();
      setDns(null);
      setShop((prev) => ({ ...prev, customDomain: null }));
      toast.success('Домен отвязан');
    } catch (err) {
      toast.error(errorMessage(err, 'Не удалось отвязать домен'));
    } finally {
      setUnbinding(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (busy || !dirty) return;
    if (cleared) {
      handleUnbind();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await saveDomain(domain.trim());
      setDns(result.domain ? result : null);
      setShop((prev) => ({ ...prev, customDomain: result.domain }));
      toast.success('Домен подключён — добавьте DNS-записи');
    } catch (err) {
      const message = errorMessage(err, 'Не удалось сохранить домен');
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const status = dns && STATUS[dns.status];

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
        {!saved && !error && (
          <span className={styles.fieldHint}>
            Поддомен (shop.example.ru или www.example.ru) подключить проще всего: у корневого домена
            CNAME-запись поддерживают не все регистраторы.
          </span>
        )}
      </label>

      <div className={styles.cardActions}>
        {dirty && <span className={styles.dirtyNote}>Есть несохранённые изменения</span>}
        <button type="submit" className={styles.saveBtn} disabled={busy || !dirty}>
          {saving ? 'Подключаем…' : cleared ? 'Отвязать домен' : 'Сохранить домен'}
        </button>
      </div>

      {saved && dns && (
        <div className={own.dns}>
          <div className={own.dnsHead}>
            <span className={own.dnsTitle}>
              <a href={`https://${saved}`} target="_blank" rel="noreferrer">{saved}</a>
            </span>
            {status && <span className={`${styles.badge} ${status.className}`}>{status.label}</span>}
            <button type="button" className={styles.linkBtn} onClick={() => check()} disabled={checking}>
              {checking ? 'Проверяем…' : 'Проверить'}
            </button>
            <button
              type="button"
              className={`${styles.linkBtn} ${own.unbind}`}
              onClick={handleUnbind}
              disabled={busy}
            >
              {unbinding ? 'Отвязываем…' : 'Отвязать'}
            </button>
          </div>
          {dns.records.length > 0 && (
            <>
              <p className={styles.fieldHint}>
                Добавьте у регистратора домена (в разделе DNS-записей) {dns.records.length > 1 ? 'эти записи' : 'эту запись'}:
              </p>
              <DnsRecords records={dns.records} />
            </>
          )}
          {dns.message && <p className={styles.fieldHint}>{dns.message}</p>}
        </div>
      )}
    </form>
  );
};

export default DomainSettings;
