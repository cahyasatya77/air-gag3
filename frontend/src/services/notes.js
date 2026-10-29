import api from './api'

const data = (res) => res.data

export const notesService = {
  list: () => api.get('/notes').then(data),
  get: (id) => api.get(`/notes/${id}`).then(data),
  create: (body) => api.post('/notes', body).then(data),
  update: (id, body) => api.put(`/notes/${id}`, body).then(data),
  remove: (id) => api.delete(`/notes/${id}`).then(data),
}
