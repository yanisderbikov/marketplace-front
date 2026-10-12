import React from 'react';
import { Link } from 'react-router-dom';
import styles from './Legal.module.css';

/* Тело юр-документа — перенос разметки anyforms LegalPage (eyebrow, заголовок,
   редакция, вступление, нумерованные разделы, ссылка назад). Обёртку задаёт
   страница: документы витрины рендерятся карточкой внутри StorefrontLayout,
   политика платформы — на своей белой странице с шапкой. */
const LegalDocument = ({ doc, notice, backTo, backLabel }) => (
  <>
    <span className={styles.eyebrow}>Документы</span>
    <h1 className={styles.title}>{doc.title}</h1>
    {doc.updated && <p className={styles.updated}>Редакция от {doc.updated}</p>}
    {notice && <p className={styles.notice}>{notice}</p>}
    <div className={styles.body}>
      <p>{doc.intro}</p>
      {doc.sections.map((section, i) => (
        <section key={section.heading}>
          <h2 className={styles.h2}>
            {i + 1}. {section.heading}
          </h2>
          {section.paragraphs.map((p, j) => (
            <p key={j}>{p}</p>
          ))}
        </section>
      ))}
    </div>
    <p className={styles.backWrap}>
      <Link className={styles.back} to={backTo}>
        {backLabel}
      </Link>
    </p>
  </>
);

export default LegalDocument;
