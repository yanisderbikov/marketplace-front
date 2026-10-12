import api from '../apiClient';

// Заказы и аналитика продаж своего магазина.

/**
 * PageDTO<MerchantOrderDTO> { items, total, page, size }.
 * payment: PAID | AWAITING_PAYMENT | FAILED | CANCELED | ALL;
 * fulfillment: NEW | SHIPPED | DONE | CANCELLED | ALL; page с 0, size ≤ 100.
 */
export const listOrders = ({ payment, fulfillment, page, size }) =>
  api
    .get('/api/merchant/orders', { params: { payment, fulfillment, page, size } })
    .then((res) => res.data);

/** Статус исполнения + трек-номер (только для оплаченных) → MerchantOrderDTO. */
export const updateFulfillment = (publicId, { fulfillmentStatus, trackingNumber }) =>
  api
    .put(`/api/merchant/orders/${encodeURIComponent(publicId)}/fulfillment`, {
      fulfillmentStatus,
      trackingNumber,
    })
    .then((res) => res.data);

/** Отчёт о продажах за дни [from..to] по Москве (YYYY-MM-DD) → SalesReportDTO. */
export const getSalesReport = ({ from, to }) =>
  api.get('/api/merchant/analytics/sales', { params: { from, to } }).then((res) => res.data);
