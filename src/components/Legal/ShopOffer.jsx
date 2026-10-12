import React, { useEffect, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import LegalDocument from './LegalDocument';
import { buildShopOffer, hasSellerRequisites } from './legalTexts';
import styles from './Legal.module.css';

// Публичная оферта витрины: продавец — мерчант (реквизиты из PublicShopDTO),
// платформа — только технический посредник. Шапку и подвал рисует StorefrontLayout.
const ShopOffer = () => {
  const { shop, slug } = useOutletContext();
  const doc = useMemo(() => (shop ? buildShopOffer({ ...shop, slug }) : null), [shop, slug]);
  // Заголовок вкладки поверх названия магазина, которое ставит StorefrontLayout.
  const shopName = shop?.name;
  useEffect(() => {
    if (shopName) document.title = `Публичная оферта — ${shopName}`;
  }, [shopName]);

  if (!doc) return null;

  return (
    <div className={styles.shopPage} id="top">
      <div className={styles.shopCard}>
        <LegalDocument
          doc={doc}
          notice={
            hasSellerRequisites(shop)
              ? null
              : 'Продавец ещё не указал свои реквизиты, поэтому магазин пока не принимает заказы.'
          }
          backTo={`/shop/${slug}`}
          backLabel="← В магазин"
        />
      </div>
    </div>
  );
};

export default ShopOffer;
