import api from './api'

const data = (res) => res.data

export const cashService = {
  book: (fund) => api.get('/cash', { params: { fund } }).then(data),
  addExpense: (body) => api.post('/expenses', body).then(data),
  addIncome: (body) => api.post('/incomes', body).then(data),
  deleteEntry: (id) => api.delete(`/cash-entries/${id}`).then(data),
  yearReport: (fund, year) => api.get(`/reports/kas/${fund}`, { params: { year } }).then(data),
}
