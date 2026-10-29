import api from './api'

const data = (res) => res.data

export const masterService = {
  houses: () => api.get('/houses').then(data),
  createHouse: (body) => api.post('/houses', body).then(data),
  updateHouse: (id, body) => api.put(`/houses/${id}`, body).then(data),
  housesReportUrl: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return `/api/houses/report.pdf${qs ? `?${qs}` : ''}`
  },

  users: () => api.get('/users').then(data),
  createUser: (body) => api.post('/users', body).then(data),
  updateUser: (id, body) => api.put(`/users/${id}`, body).then(data),

  tariffs: () => api.get('/tariffs').then(data),
  createTariff: (body) => api.post('/tariffs', body).then(data),

  bankAccounts: () => api.get('/bank-accounts').then(data),
  createBankAccount: (body) => api.post('/bank-accounts', body).then(data),

  audit: (limit = 200) => api.get('/audit', { params: { limit } }).then(data),
}
