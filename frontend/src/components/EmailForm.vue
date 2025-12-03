<template>
  <div>
    <form @submit.prevent="onSubmit">
      <label for="email">Email Snovio:</label>
      <select v-model="selectedEmail" required>
        <option v-for="email in emailOptions" :key="email" :value="email">{{ email }}</option>
      </select>

      <label for="startDate">Data de Início:</label>
      <input v-model="startDate" type="date" required />

      <label for="endDate">Data de Fim:</label>
      <input v-model="endDate" type="date" required />

      <button type="submit">Gerar Relatório</button>
    </form>
  </div>
</template>

<script>
import axios from 'axios';

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
    const res = await axios.get('http://localhost:3000/api/campaigns/get-emails');
    this.emailOptions = res.data;
  },
  methods: {
    async onSubmit() {
      try {
        // 1) Gera o CSV no backend
        await axios.post('http://localhost:3000/api/campaigns', {
          emailSnovio: this.selectedEmail,
          startDate: this.startDate,
          endDate: this.endDate,
        });

        // 2) Faz o download
        const response = await axios.get(
          'http://localhost:3000/api/campaigns/download',
          { responseType: 'blob' },
        );

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
/* Estilos do formulário */
form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

label {
  font-weight: bold;
}

select,
input {
  padding: 8px;
  margin-top: 5px;
  border-radius: 4px;
}

button {
  margin-top: 20px;
  padding: 10px;
  background-color: #42b983;
  color: white;
  border: none;
  cursor: pointer;
}

button:hover {
  background-color: #388e73;
}
</style>
