import api from './api'

const data = (res) => res.data

export const billingService = {
  periodBills: (period) => api.get(`/periods/${period}/bills`).then(data),
  saveReading: (id, meter_akhir) => api.put(`/bills/${id}/reading`, { meter_akhir }).then(data),
  saveMeterAwal: (id, meter_awal) => api.put(`/bills/${id}/meter-awal`, { meter_awal }).then(data),
  adjust: (id, body) => api.post(`/bills/${id}/adjustments`, body).then(data),
  pay: (id, body) => api.post(`/bills/${id}/payments`, body).then(data),
  get: (id) => api.get(`/bills/${id}`).then(data),
  cancelPayment: (id, reason) => api.post(`/payments/${id}/cancel`, { reason }).then(data),
  share: (id) => api.post(`/bills/${id}/share`).then(data),
  addArrears: (body) => api.post('/bills/arrears', body).then(data),
  receivables: () => api.get('/receivables').then(data),
  myBills: () => api.get('/my/bills').then(data),
  invoiceUrl: (id) => `/api/bills/${id}/invoice.pdf`,
  periodReportUrl: (period) => `/api/periods/${period}/report.pdf`,
}
