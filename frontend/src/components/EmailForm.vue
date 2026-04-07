<template>
  <div class="form-wrapper">
    <form @submit.prevent="onSubmit" class="form">
      <!-- BUSCA + SELECT -->
      <div class="form-row">
        <label>Buscar email Snov.io</label>
        <input
          v-model="searchTerm"
          type="text"
          class="search-input"
          placeholder="Digite para filtrar emails..."
          :disabled="isLoading || !emailOptions.length"
        />

        <label class="select-label">
          Email Snov.io (pode selecionar vários)
        </label>
        <select
          v-model="selectedEmails"
          multiple
          class="email-select"
          :disabled="isLoading || !filteredOptions.length"
          size="6"
        >
          <option
            v-for="opt in filteredOptions"
            :key="getOptionValue(opt)"
            :value="getOptionValue(opt)"
          >
            {{ getOptionLabel(opt) }}
          </option>
        </select>
        <small class="helper">
          Use CTRL / SHIFT para selecionar mais de um email.
        </small>
      </div>

      <!-- DATAS -->
      <div class="form-row form-row-inline">
        <div class="form-field">
          <label>Data de início</label>
          <input
            v-model="startDate"
            type="date"
            required
            :disabled="isLoading"
          />
        </div>

        <div class="form-field">
          <label>Data de fim</label>
          <input
            v-model="endDate"
            type="date"
            required
            :disabled="isLoading"
          />
        </div>
      </div>

      <!-- BOTÕES -->
      <div class="buttons-row">
        <button
          type="submit"
          class="btn-primary"
          :disabled="isLoading || !selectedEmails.length"
        >
          <span v-if="!isLoading">Gerar CSV</span>
          <span v-else>Gerando CSV...</span>
        </button>

        <button
          type="button"
          class="btn-secondary"
          :disabled="isLoading || !selectedEmails.length"
          @click="onStatsClick"
        >
          Estatísticas de abertura
        </button>
      </div>
    </form>

    <!-- LOADER -->
    <div v-if="isLoading" class="loader-wrapper">
      <div class="loader-text">{{ loadingText }}</div>
      <div class="loader-bar">
        <div class="loader-bar-inner"></div>
      </div>
    </div>

    <!-- MENSAGENS -->
    <p v-if="warningMessage" class="warning-msg">
      {{ warningMessage }}
    </p>

    <p v-if="errorMessage" class="error-msg">
      {{ errorMessage }}
    </p>

    <!-- ESTATÍSTICAS -->
    <div v-if="showStats && totalOpenings > 0" class="stats-box">
      <div class="stats-header">Estatísticas de aberturas</div>

      <p class="stats-total">
        Total de aberturas no período:
        <strong>{{ totalOpenings }}</strong>
      </p>

      <div class="stats-list">
        <div
          v-for="item in emailCounts"
          :key="item.email"
          class="stats-item"
        >
          <span class="stats-email">{{ item.email }}</span>
          <span class="stats-count">{{ item.count }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import api from '../api';

export default {
  data() {
    return {
      selectedEmails: [],
      startDate: '',
      endDate: '',
      emailOptions: [],         // pode vir string[] ou [{ emailSnovio, totalCampaigns }]
      searchTerm: '',
      isLoading: false,
      loadingText: 'Processando...',
      warningMessage: '',
      errorMessage: '',
      totalOpenings: 0,
      emailCounts: [],
      showStats: false,
    };
  },

  async mounted() {
    try {
      const res = await api.get('/api/campaigns/get-emails');
      // Aceita tanto array de strings quanto array de objetos
      this.emailOptions = res.data || [];
    } catch (err) {
      console.error('Erro ao carregar emails:', err);
      this.errorMessage =
        'Não foi possível carregar a lista de emails Snov.io. Tente novamente mais tarde.';
    }
  },

  computed: {
    filteredOptions() {
      const term = this.searchTerm.trim().toLowerCase();
      if (!term) return this.emailOptions;

      return this.emailOptions.filter((opt) => {
        const email =
          typeof opt === 'string' ? opt : (opt.emailSnovio || '');
        return email.toLowerCase().includes(term);
      });
    },
  },

  methods: {
    getOptionValue(opt) {
      return typeof opt === 'string' ? opt : opt.emailSnovio;
    },
    getOptionLabel(opt) {
      if (typeof opt === 'string') {
        return opt;
      }
      if (opt.totalCampaigns != null) {
        return `${opt.emailSnovio} (${opt.totalCampaigns} campanhas)`;
      }
      return opt.emailSnovio;
    },

    async onSubmit() {
      await this.runReport({ downloadCsv: true });
    },

    async onStatsClick() {
      await this.runReport({ downloadCsv: false });
    },

    async runReport({ downloadCsv }) {
      this.errorMessage = '';
      this.warningMessage = '';
      this.totalOpenings = 0;
      this.emailCounts = [];
      this.showStats = false;
      this.isLoading = true;
      this.loadingText = 'Consultando campanhas...';

      try {
        if (!this.selectedEmails.length) {
          this.warningMessage = 'Selecione pelo menos um email Snov.io.';
          return;
        }

        // datas dd/mm/yyyy para o backend
        const start = this.startDate.split('-').reverse().join('/'); // dd/mm/yyyy
        const end = this.endDate.split('-').reverse().join('/');

        const res = await api.post('/api/campaigns', {
          emailsSnovio: this.selectedEmails,
          startDate: start,
          endDate: end,
        });

        // CORREÇÃO: Removi a variável 'message' que não estava sendo usada
        const { totalOpenings, countsByEmail } = res.data || {};
        this.totalOpenings = totalOpenings || 0;

        const entries = Object.entries(countsByEmail || {});
        this.emailCounts = entries
          .map(([email, count]) => ({ email, count }))
          .sort((a, b) => b.count - a.count);

        if (!this.totalOpenings) {
          this.warningMessage =
            'Nenhum dado encontrado para os emails selecionados no período informado.';
          return; // não baixa CSV sem dados
        }

        this.showStats = true;

        if (downloadCsv) {
          this.loadingText = 'Baixando CSV...';

          const file = await api.get('/api/campaigns/download', {
            responseType: 'blob',
          });

          const blob = new Blob([file.data], {
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
        }
      } catch (err) {
        console.error('Erro ao gerar relatório:', err);
        this.errorMessage =
          'Ocorreu um erro ao gerar o relatório. Tente novamente.';
      } finally {
        this.isLoading = false;
      }
    },
  },
};
</script>

<style scoped>
.form-wrapper {
  margin-top: 4px;
}

/* BUSCA */

.search-input {
  padding: 9px 11px;
  border-radius: 10px;
  border: 1px solid #d0d0d0;
  font-size: 14px;
  outline: none;
  margin-bottom: 8px;
}

.search-input:focus {
  border-color: var(--ativa-orange);
  box-shadow: 0 0 0 2px rgba(255, 122, 0, 0.2);
}

.email-select {
  padding: 6px 8px;
  border-radius: 10px;
  border: 1px solid #d0d0d0;
  font-size: 13px;
  outline: none;
  min-height: 140px;
}

.email-select:focus {
  border-color: var(--ativa-orange);
  box-shadow: 0 0 0 2px rgba(255, 122, 0, 0.2);
}

.helper {
  font-size: 11px;
  color: #777;
  margin-top: 4px;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.form-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-row-inline {
  flex-direction: row;
  align-items: flex-end;
  gap: 18px;
  margin-top: 4px;
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
input[type="date"] {
  padding: 9px 11px;
  border-radius: 10px;
  border: 1px solid #d0d0d0;
  font-size: 14px;
  outline: none;
  background-color: #fff;
}

select:disabled,
input:disabled {
  background-color: #f0f0f0;
  cursor: not-allowed;
}

/* BOTÕES */

.buttons-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 6px;
}

.btn-primary,
.btn-secondary {
  padding: 10px 22px;
  border-radius: 999px;
  border: none;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.08s ease, box-shadow 0.12s ease, background 0.12s ease,
    color 0.12s ease, border-color 0.12s ease;
}

.btn-primary {
  background: var(--ativa-orange);
  color: var(--ativa-white);
}

.btn-primary:hover {
  background: #ff8f26;
  box-shadow: 0 10px 26px rgba(255, 122, 0, 0.4);
  transform: translateY(-1px);
}

.btn-secondary {
  background: #ffffff;
  color: #222;
  border: 1px solid #d0d0d0;
}

.btn-secondary:hover {
  background: #f8f8f8;
  border-color: #bdbdbd;
}

.btn-primary:disabled,
.btn-secondary:disabled {
  cursor: wait;
  opacity: 0.85;
  box-shadow: none;
}

/* Loader */

.loader-wrapper {
  margin-top: 16px;
}

.loader-text {
  font-size: 12px;
  color: #555;
  margin-bottom: 6px;
}

.loader-bar {
  position: relative;
  width: 100%;
  height: 6px;
  background-color: #e5e5e5;
  border-radius: 999px;
  overflow: hidden;
}

.loader-bar-inner {
  position: absolute;
  height: 100%;
  width: 40%;
  background: linear-gradient(90deg, #ff7a00, #ffb566);
  border-radius: 999px;
  animation: loadingBar 1.2s infinite ease-in-out;
}

@keyframes loadingBar {
  0% {
    transform: translateX(-100%);
  }
  50% {
    transform: translateX(40%);
  }
  100% {
    transform: translateX(120%);
  }
}

/* Mensagens */

.error-msg {
  margin-top: 10px;
  font-size: 12px;
  color: #c0392b;
}

.warning-msg {
  margin-top: 10px;
  font-size: 12px;
  color: #ff7a00;
}

/* Estatísticas */

.stats-box {
  margin-top: 18px;
  padding: 14px 16px;
  border-radius: 12px;
  background: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.06);
}

.stats-header {
  font-size: 13px;
  font-weight: 700;
  color: #222;
  margin-bottom: 6px;
}

.stats-total {
  font-size: 13px;
  margin: 0 0 10px;
  color: #444;
}

.stats-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 220px;
  overflow-y: auto;
}

.stats-item {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  padding: 4px 0;
  border-bottom: 1px dashed rgba(0, 0, 0, 0.06);
}

.stats-item:last-child {
  border-bottom: none;
}

.stats-email {
  color: #333;
}

.stats-count {
  font-weight: 600;
  color: #ff7a00;
}

/* Responsivo */

@media (max-width: 640px) {
  .form-row-inline {
    flex-direction: column;
  }
}
</style>
