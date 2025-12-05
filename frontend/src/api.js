// frontend/src/api.js
import axios from 'axios';

const api = axios.create({
  baseURL:
    process.env.NODE_ENV === 'production'
      ? 'https://api-aberturas.labsativa.com.br'
      : 'http://localhost:3000',
});

export default api;
