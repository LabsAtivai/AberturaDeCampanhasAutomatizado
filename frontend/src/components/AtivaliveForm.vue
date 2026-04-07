<template>
  <div class="form-wrapper">
    <form @submit.prevent="onSubmit" class="form">

      <!-- BUSCA + SELECT DE CLIENTE -->
      <div class="form-row">
        <label>Buscar cliente</label>
        <input
          v-model="searchTerm"
          type="text"
          class="search-input"
          placeholder="Digite para filtrar clientes..."
          :disabled="isLoading || !clientOptions.length"
        />

        <label class="select-label">Cliente (pode selecionar vários)</label>
        <select
          v-model="selectedClients"
          multiple
          class="email-select"
          :disabled="isLoading || !filteredOptions.length"
          size="6"
        >
          <option
            v-for="opt in filteredOptions"
            :key="opt.cliente"
            :value="opt.cliente"
          >
            {{ opt.cliente }} ({{ opt.total }} consultas)
          </option>
        </select>
        <small class="helper">Use CTRL / SHIFT para selecionar mais de um cliente.</small>
      </div>

      <!-- DATAS -->
      <div class="form-row form-row-inline">
        <div class="form-field">
          <label>Data de início</label>
          <input v-model="startDate" type="date" required :disabled="isLoading" />
        </div>
        <div class="form-field">
          <label>Data de fim</label>
          <input v-model="endDate" type="date" required :disabled="isLoading" />
        </div>
      </div>

      <!-- BOTÕES -->
      <div class="buttons-row">
        <button
          type="submit"
          class="btn-primary"
          :disabled="isLoading || !selectedClients.length"
        >
          <span v-if="!isLoading">Gerar CSV</span>
          <span v-else>Gerando...</span>
        </button>

        <button
          type="button"
          class="btn-secondary"
          :disabled="isLoading || !selectedClients.length"
          @click="onStatsClick"
        >
          Ver estatísticas
        </button>
      </div>
    </form>

    <!-- LOADER -->
    <div v-if="isLoading" class="loader-wrapper">
      <div class="loader-text">{{ loadingText }}</div>
      <div class="loader-bar"><div class="loader-bar-inner"></div></div>
    </div>

    <!-- MENSAGENS -->
    <p v-if="warningMessage" class="warning-msg">{{ warningMessage }}</p>
    <p v-if="errorMessage" class="error-msg">{{ errorMessage }}</p>

    <!-- ESTATÍSTICAS -->
    <div v-if="showStats && results.length" class="stats-box">
      <div class="stats-header">
        Consultas no período
        <span class="stats-badge">{{ totalConsultas }} total</span>
      </div>

      <div class="stats-list">
        <div v-for="item in results" :key="item.cliente" class="stats-item">
          <div class="stats-item-left">
            <span class="stats-email">{{ item.cliente }}</span>
            <span class="stats-meta">{{ item.primeiraConsulta }} → {{ item.ultimaConsulta }}</span>
          </div>
          <span class="stats-count">{{ item.total }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import api from '../api';

export default {
  name: 'AtivaliveForm',
  data() {
    return {
      selectedClients: [],
      startDate: '',
      endDate: '',
      clientOptions: [],
      searchTerm: '',
      isLoading: false,
      loadingText: 'Carregando...',
      warningMessage: '',
      errorMessage: '',
      results: [],
      showStats: false,
    };
  },

  async mounted() {
    try {
      const res = await api.get('/api/ativalive/clientes');
      this.clientOptions = res.data || [];
    } catch (err) {
      console.error('Erro ao carregar clientes:', err);
      this.errorMessage = 'Não foi possível carregar a lista de clientes.';
    }
  },

  computed: {
    filteredOptions() {
      const term = this.searchTerm.trim().toLowerCase();
      if (!term) return this.clientOptions;
      return this.clientOptions.filter(opt =>
        opt.cliente.toLowerCase().includes(term)
      );
    },
    totalConsultas() {
      return this.results.reduce((sum, r) => sum + r.total, 0);
    },
  },

  methods: {
    async onSubmit() {
      await this.runReport({ downloadCsv: true });
    },
    async onStatsClick() {
      await this.runReport({ downloadCsv: false });
    },

    async runReport({ downloadCsv }) {
      this.errorMessage = '';
      this.warningMessage = '';
      this.results = [];
      this.showStats = false;
      this.isLoading = true;
      this.loadingText = 'Consultando banco de dados...';

      try {
        if (!this.selectedClients.length) {
          this.warningMessage = 'Selecione pelo menos um cliente.';
          return;
        }

        const res = await api.post('/api/ativalive/consultas', {
          clientes: this.selectedClients,
          startDate: this.startDate,
          endDate: this.endDate,
        });

        const { data } = res.data || {};
        this.results = data || [];

        if (!this.results.length) {
          this.warningMessage = 'Nenhuma consulta encontrada no período informado.';
          return;
        }

        this.showStats = true;

        if (downloadCsv) {
          this.loadingText = 'Baixando CSV...';
          const file = await api.post('/api/ativalive/download', {
            clientes: this.selectedClients,
            startDate: this.startDate,
            endDate: this.endDate,
          }, { responseType: 'blob' });

          const blob = new Blob([file.data], { type: 'text/csv;charset=utf-8;' });
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.setAttribute('download', 'ConsultasAtivalive.csv');
          document.body.appendChild(link);
          link.click();
          link.remove();
          window.URL.revokeObjectURL(url);
        }
      } catch (err) {
        console.error('Erro:', err);
        this.errorMessage = 'Ocorreu um erro ao buscar os dados. Tente novamente.';
      } finally {
        this.isLoading = false;
      }
    },
  },
};
</script>

<style scoped>
.form-wrapper { margin-top: 4px; }

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

.helper { font-size: 11px; color: #777; margin-top: 4px; }

.form { display: flex; flex-direction: column; gap: 18px; }

.form-row { display: flex; flex-direction: column; gap: 8px; }
.form-row-inline { flex-direction: row; align-items: flex-end; gap: 18px; margin-top: 4px; }
.form-field { flex: 1; display: flex; flex-direction: column; gap: 8px; }

label { font-size: 13px; font-weight: 600; color: #333; }

select, input[type="date"] {
  padding: 9px 11px;
  border-radius: 10px;
  border: 1px solid #d0d0d0;
  font-size: 14px;
  outline: none;
  background-color: #fff;
}
select:disabled, input:disabled { background-color: #f0f0f0; cursor: not-allowed; }

.buttons-row { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 6px; }

.btn-primary, .btn-secondary {
  padding: 10px 22px;
  border-radius: 999px;
  border: none;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.08s ease, box-shadow 0.12s ease, background 0.12s ease;
}
.btn-primary { background: var(--ativa-orange); color: var(--ativa-white); }
.btn-primary:hover { background: #ff8f26; box-shadow: 0 10px 26px rgba(255,122,0,0.4); transform: translateY(-1px); }
.btn-secondary { background: #ffffff; color: #222; border: 1px solid #d0d0d0; }
.btn-secondary:hover { background: #f8f8f8; border-color: #bdbdbd; }
.btn-primary:disabled, .btn-secondary:disabled { cursor: wait; opacity: 0.85; box-shadow: none; }

.loader-wrapper { margin-top: 16px; }
.loader-text { font-size: 12px; color: #555; margin-bottom: 6px; }
.loader-bar { position: relative; width: 100%; height: 6px; background-color: #e5e5e5; border-radius: 999px; overflow: hidden; }
.loader-bar-inner { position: absolute; height: 100%; width: 40%; background: linear-gradient(90deg, #ff7a00, #ffb566); border-radius: 999px; animation: loadingBar 1.2s infinite ease-in-out; }
@keyframes loadingBar { 0% { transform: translateX(-100%); } 50% { transform: translateX(40%); } 100% { transform: translateX(120%); } }

.error-msg { margin-top: 10px; font-size: 12px; color: #c0392b; }
.warning-msg { margin-top: 10px; font-size: 12px; color: #ff7a00; }

.stats-box { margin-top: 18px; padding: 14px 16px; border-radius: 12px; background: #ffffff; border: 1px solid rgba(0,0,0,0.06); }

.stats-header {
  font-size: 13px;
  font-weight: 700;
  color: #222;
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.stats-badge {
  background: var(--ativa-orange);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
}

.stats-list { display: flex; flex-direction: column; gap: 4px; max-height: 260px; overflow-y: auto; }

.stats-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  padding: 6px 0;
  border-bottom: 1px dashed rgba(0,0,0,0.06);
}
.stats-item:last-child { border-bottom: none; }

.stats-item-left { display: flex; flex-direction: column; gap: 2px; }
.stats-email { color: #333; font-weight: 500; }
.stats-meta { font-size: 11px; color: #999; }
.stats-count { font-weight: 700; color: var(--ativa-orange); font-size: 14px; }

@media (max-width: 640px) {
  .form-row-inline { flex-direction: column; }
}
</style>