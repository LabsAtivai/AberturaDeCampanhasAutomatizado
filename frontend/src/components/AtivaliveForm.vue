<template>
  <div class="form-wrapper">
    <form @submit.prevent="onSubmit" class="form" aria-label="Formulário ativa.live">

      <!-- BUSCA + MULTI-SELECT -->
      <div class="form-row">
        <label for="ativalive-search">Buscar cliente</label>
        <input
          id="ativalive-search"
          v-model="searchTerm"
          type="text"
          class="search-input"
          placeholder="Digite para filtrar..."
          autocomplete="off"
          :disabled="isLoading || !clientOptions.length"
        />

        <label>Clientes</label>
        <div class="multi-select-box">
          <label
            v-for="opt in filteredOptions"
            :key="opt.cliente"
            class="ms-option"
            :class="{ selected: selectedClients.includes(opt.cliente) }"
          >
            <input type="checkbox" :value="opt.cliente" v-model="selectedClients" :disabled="isLoading" />
            <span>
              <span class="ms-option-label">{{ opt.cliente }}</span>
              <span class="ms-option-sub">{{ opt.total }} consultas</span>
            </span>
          </label>
          <div class="ms-empty" v-if="!filteredOptions.length && clientOptions.length">
            Nenhum cliente encontrado para "{{ searchTerm }}"
          </div>
          <div class="ms-empty" v-if="!clientOptions.length">Carregando clientes...</div>
        </div>

        <div class="selected-tags" v-if="selectedClients.length" aria-live="polite">
          <span class="tag" v-for="c in selectedClients" :key="c">
            {{ c }}
            <button type="button" class="tag-remove" @click="removeClient(c)" :aria-label="`Remover ${c}`">×</button>
          </span>
        </div>
        <span class="helper">{{ selectedClients.length }} selecionado(s)</span>
      </div>

      <!-- DATAS -->
      <div class="form-row form-row-inline">
        <div class="form-field">
          <label for="al-start">Data de início</label>
          <input id="al-start" v-model="startDate" type="date" required :disabled="isLoading" />
        </div>
        <div class="form-field">
          <label for="al-end">Data de fim</label>
          <input id="al-end" v-model="endDate" type="date" required :disabled="isLoading" />
        </div>
      </div>

      <!-- BOTÕES -->
      <div class="buttons-row">
        <button type="submit" class="btn-primary" :disabled="isLoading || !selectedClients.length">
          <span v-if="!isLoading">⬇ Gerar CSV</span>
          <span v-else>Gerando...</span>
        </button>
        <button type="button" class="btn-secondary" :disabled="isLoading || !selectedClients.length" @click="onStatsClick">
          ≡ Ver estatísticas
        </button>
        <button type="button" class="btn-secondary" :disabled="isLoading || !selectedClients.length" @click="clearSelection">
          ✕ Limpar seleção
        </button>
      </div>
    </form>

    <!-- LOADER -->
    <div v-if="isLoading" class="loader-wrapper" aria-live="polite">
      <div class="loader-text">{{ loadingText }}</div>
      <div class="loader-bar" role="progressbar" aria-label="Carregando"><div class="loader-bar-inner"></div></div>
    </div>

    <!-- ALERTAS -->
    <div v-if="warningMessage" class="alert alert-warning" role="alert">{{ warningMessage }}</div>
    <div v-if="errorMessage" class="alert alert-error" role="alert">{{ errorMessage }}</div>

    <!-- RESULTADOS -->
    <div v-if="showStats" class="results-section">

      <div class="result-summary">
        <div class="summary-card">
          <p class="summary-label">Total de consultas</p>
          <p class="summary-value">{{ totalConsultas }}</p>
          <p class="summary-sub">no período selecionado</p>
        </div>
        <div class="summary-card">
          <p class="summary-label">Clientes</p>
          <p class="summary-value">{{ results.length }}</p>
          <p class="summary-sub">com dados no período</p>
        </div>
      </div>

      <!-- GRÁFICO DE CLIENTES -->
      <div class="chart-container" v-if="clientChartData.length">
        <p class="chart-title">Consultas por cliente</p>
        <div class="bar-chart">
          <div class="bar-row" v-for="item in clientChartData" :key="item.name">
            <span class="bar-label" :title="item.name">{{ item.name }}</span>
            <div class="bar-track"><div class="bar-fill" :style="{ width: item.pct + '%' }"></div></div>
            <span class="bar-val">{{ item.count }}</span>
          </div>
        </div>
      </div>

      <!-- TABELA DETALHADA -->
      <div class="stats-box">
        <div class="stats-box-header">Detalhe por cliente</div>
        <div class="stats-box-body">
          <div class="stats-row" v-for="item in results" :key="item.cliente">
            <div style="flex:1; min-width:0;">
              <div class="stats-name" :title="item.cliente">{{ item.cliente }}</div>
              <div style="font-size:11px;color:#999;margin-top:2px;">{{ item.primeiraConsulta }} → {{ item.ultimaConsulta }}</div>
            </div>
            <span class="stats-badge">{{ item.total }}</span>
          </div>
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
    } catch {
      this.errorMessage = 'Não foi possível carregar a lista de clientes.';
    }
  },

  computed: {
    filteredOptions() {
      const term = this.searchTerm.trim().toLowerCase();
      if (!term) return this.clientOptions;
      return this.clientOptions.filter((opt) => opt.cliente.toLowerCase().includes(term));
    },
    totalConsultas() {
      return this.results.reduce((sum, r) => sum + r.total, 0);
    },
    clientChartData() {
      const sorted = [...this.results].sort((a, b) => b.total - a.total).slice(0, 10);
      const max = sorted[0]?.total || 1;
      return sorted.map((r) => ({ name: r.cliente, count: r.total, pct: Math.round((r.total / max) * 100) }));
    },
  },

  methods: {
    removeClient(c) { this.selectedClients = this.selectedClients.filter((x) => x !== c); },
    clearSelection() { this.selectedClients = []; },

    async onSubmit() { await this.runReport({ downloadCsv: true }); },
    async onStatsClick() { await this.runReport({ downloadCsv: false }); },

    async runReport({ downloadCsv }) {
      this.errorMessage = '';
      this.warningMessage = '';
      this.results = [];
      this.showStats = false;
      this.isLoading = true;
      this.loadingText = 'Consultando banco de dados...';

      try {
        const res = await api.post('/api/ativalive/consultas', {
          clientes: this.selectedClients,
          startDate: this.startDate,
          endDate: this.endDate,
        });

        this.results = res.data?.data || [];

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
        const msg = err?.response?.data?.error?.message;
        this.errorMessage = Array.isArray(msg) ? msg.join(' | ') : (msg || 'Ocorreu um erro. Tente novamente.');
      } finally {
        this.isLoading = false;
      }
    },
  },
};
</script>
