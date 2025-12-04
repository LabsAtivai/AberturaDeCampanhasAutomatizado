<template>
  <div class="form-wrapper">
    <form @submit.prevent="onSubmit" class="form">
      <div class="form-row">
        <label for="email">Email Snov.io</label>
        <select v-model="selectedEmail" id="email" required>
          <option value="" disabled>Selecione um email</option>
          <option v-for="email in emailOptions" :key="email" :value="email">
            {{ email }}
          </option>
        </select>
      </div>

      <div class="form-row form-row-inline">
        <div class="form-field">
          <label for="startDate">Data de início</label>
          <input v-model="startDate" id="startDate" type="date" required />
        </div>

        <div class="form-field">
          <label for="endDate">Data de fim</label>
          <input v-model="endDate" id="endDate" type="date" required />
        </div>
      </div>

      <button type="submit" class="btn-primary">
        Gerar relatório CSV
      </button>
    </form>
  </div>
</template>

<script>
import api from '../api'; // conforme combinamos antes

export default {
  data() {
    return {
      selectedEmail: '',
      startDate: '',
      endDate: '',
      emailOptions: [],
    };
  },
  async mounted() {
    try {
      const res = await api.get('/api/campaigns/get-emails');
      this.emailOptions = res.data;
    } catch (e) {
      console.error('Erro ao carregar emails:', e);
    }
  },
  methods: {
    async onSubmit() {
      try {
        await api.post('/api/campaigns', {
          emailSnovio: this.selectedEmail,
          startDate: this.startDate,
          endDate: this.endDate,
        });

        const response = await api.get('/api/campaigns/download', {
          responseType: 'blob',
        });

        const blob = new Blob([response.data], {
          type: 'text/csv;charset=utf-8;',
        });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');

        link.href = url;
        link.setAttribute('download', 'AberturasDeCampanhas.csv');
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
      } catch (err) {
        console.error('Erro ao gerar ou baixar o CSV:', err);
      }
    },
  },
};
</script>

<style scoped>
.form-wrapper {
  margin-top: 4px;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-row-inline {
  flex-direction: row;
  align-items: flex-end;
  gap: 16px;
}

.form-field {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

label {
  font-size: 13px;
  font-weight: 600;
  color: #333;
}

select,
input {
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid #d0d0d0;
  font-size: 14px;
  outline: none;
}

select:focus,
input:focus {
  border-color: var(--ativa-orange);
  box-shadow: 0 0 0 2px rgba(255, 122, 0, 0.2);
}

.btn-primary {
  align-self: flex-start;
  margin-top: 8px;
  padding: 10px 18px;
  border-radius: 999px;
  border: none;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  background: var(--ativa-orange);
  color: var(--ativa-white);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.08s ease, box-shadow 0.12s ease, background 0.12s ease;
}

.btn-primary:hover {
  background: #ff8f26;
  box-shadow: 0 8px 20px rgba(255, 122, 0, 0.35);
  transform: translateY(-1px);
}

.btn-primary:active {
  transform: translateY(0);
  box-shadow: none;
}

@media (max-width: 640px) {
  .form-row-inline {
    flex-direction: column;
  }
}
</style>
