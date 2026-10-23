import api from './api'

const data = (res) => res.data

export const cashService = {
  book: (fund) => api.get('/cash', { params: { fund } }).then(data),
  addExpense: (body) => api.post('/expenses', body).then(data),
  deleteExpense: (id) => api.delete(`/expenses/${id}`).then(data),
  yearReport: (fund, year) => api.get(`/reports/kas/${fund}`, { params: { year } }).then(data),
}
