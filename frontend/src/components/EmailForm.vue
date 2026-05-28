<template>
  <div class="form-wrapper">
    <form @submit.prevent="onSubmit" class="form" aria-label="Formulário de aberturas Snov.io">

      <!-- BUSCA + MULTI-SELECT -->
      <div class="form-row">
        <label for="snovio-search">Buscar email Snov.io</label>
        <input
          id="snovio-search"
          v-model="searchTerm"
          type="text"
          class="search-input"
          placeholder="Digite para filtrar..."
          autocomplete="off"
          :disabled="isLoading || !emailOptions.length"
          aria-controls="snovio-list"
        />

        <label>Emails Snov.io</label>
        <div id="snovio-list" class="multi-select-box" role="listbox" aria-multiselectable="true">
          <label
            v-for="opt in filteredOptions"
            :key="getOptionValue(opt)"
            class="ms-option"
            :class="{ selected: selectedEmails.includes(getOptionValue(opt)) }"
          >
            <input
              type="checkbox"
              :value="getOptionValue(opt)"
              v-model="selectedEmails"
              :disabled="isLoading"
            />
            <span>
              <span class="ms-option-label">{{ getOptionValue(opt) }}</span>
              <span class="ms-option-sub" v-if="opt.totalCampaigns != null">{{ opt.totalCampaigns }} campanhas</span>
            </span>
          </label>
          <div class="ms-empty" v-if="!filteredOptions.length && emailOptions.length">
            Nenhum email encontrado para "{{ searchTerm }}"
          </div>
          <div class="ms-empty" v-if="!emailOptions.length">
            Carregando emails...
          </div>
        </div>

        <!-- TAGS dos selecionados -->
        <div class="selected-tags" v-if="selectedEmails.length" aria-live="polite">
          <span class="tag" v-for="e in selectedEmails" :key="e">
            {{ e }}
            <button type="button" class="tag-remove" @click="removeEmail(e)" :aria-label="`Remover ${e}`">×</button>
          </span>
        </div>
        <span class="helper">{{ selectedEmails.length }} selecionado(s)</span>
      </div>

      <!-- DATAS -->
      <div class="form-row form-row-inline">
        <div class="form-field">
          <label for="start-date">Data de início</label>
          <input id="start-date" v-model="startDate" type="date" required :disabled="isLoading" />
        </div>
        <div class="form-field">
          <label for="end-date">Data de fim</label>
          <input id="end-date" v-model="endDate" type="date" required :disabled="isLoading" />
        </div>
      </div>

      <!-- BOTÕES -->
      <div class="buttons-row">
        <button type="submit" class="btn-primary" :disabled="isLoading || !selectedEmails.length">
          <span v-if="!isLoading">⬇ Gerar CSV</span>
          <span v-else>Gerando...</span>
        </button>
        <button type="button" class="btn-secondary" :disabled="isLoading || !selectedEmails.length" @click="onStatsClick">
          ≡ Ver estatísticas
        </button>
        <button type="button" class="btn-secondary" :disabled="isLoading || !selectedEmails.length" @click="clearSelection">
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

      <!-- SUMMARY CARDS -->
      <div class="result-summary">
        <div class="summary-card">
          <p class="summary-label">Total de aberturas</p>
          <p class="summary-value">{{ totalOpenings }}</p>
          <p class="summary-sub">no período selecionado</p>
        </div>
        <div class="summary-card">
          <p class="summary-label">Campanhas com abertura</p>
          <p class="summary-value">{{ Object.keys(countsByCampaign).length }}</p>
          <p class="summary-sub">campanhas distintas</p>
        </div>
        <div class="summary-card">
          <p class="summary-label">Prospects únicos</p>
          <p class="summary-value">{{ Object.keys(countsByEmail).length }}</p>
          <p class="summary-sub">emails distintos</p>
        </div>
        <div class="summary-card">
          <p class="summary-label">Clientes processados</p>
          <p class="summary-value">{{ selectedEmails.length }}</p>
          <p class="summary-sub">contas Snov.io</p>
        </div>
      </div>

      <!-- GRÁFICO DE CAMPANHAS -->
      <div class="chart-container" v-if="campaignChartData.length">
        <p class="chart-title">Aberturas por campanha</p>
        <div class="bar-chart">
          <div class="bar-row" v-for="item in campaignChartData" :key="item.name">
            <span class="bar-label" :title="item.name">{{ item.name }}</span>
            <div class="bar-track">
              <div class="bar-fill" :style="{ width: item.pct + '%' }"></div>
            </div>
            <span class="bar-val">{{ item.count }}</span>
          </div>
        </div>
      </div>

      <!-- TABELA PROSPECTS -->
      <div class="stats-box">
        <div class="stats-box-header">
          Top prospects por aberturas
        </div>
        <div class="stats-box-body">
          <div class="stats-row" v-for="item in topProspects" :key="item.email">
            <span class="stats-name" :title="item.email">{{ item.email }}</span>
            <span class="stats-badge">{{ item.count }}</span>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<script>
import api from '../api';

export default {
  name: 'EmailForm',
  data() {
    return {
      selectedEmails: [],
      startDate: '',
      endDate: '',
      emailOptions: [],
      searchTerm: '',
      isLoading: false,
      loadingText: 'Processando...',
      warningMessage: '',
      errorMessage: '',
      totalOpenings: 0,
      countsByEmail: {},
      countsByCampaign: {},
      showStats: false,
    };
  },

  async mounted() {
    try {
      const res = await api.get('/api/campaigns/get-emails');
      this.emailOptions = res.data || [];
    } catch {
      this.errorMessage = 'Não foi possível carregar a lista de emails Snov.io.';
    }
  },

  computed: {
    filteredOptions() {
      const term = this.searchTerm.trim().toLowerCase();
      if (!term) return this.emailOptions;
      return this.emailOptions.filter((opt) => {
        const email = typeof opt === 'string' ? opt : (opt.emailSnovio || '');
        return email.toLowerCase().includes(term);
      });
    },

    campaignChartData() {
      const entries = Object.entries(this.countsByCampaign)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
      const max = entries[0]?.count || 1;
      return entries.map((e) => ({ ...e, pct: Math.round((e.count / max) * 100) }));
    },

    topProspects() {
      return Object.entries(this.countsByEmail)
        .map(([email, count]) => ({ email, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 30);
    },
  },

  methods: {
    getOptionValue(opt) {
      return typeof opt === 'string' ? opt : opt.emailSnovio;
    },

    removeEmail(e) {
      this.selectedEmails = this.selectedEmails.filter((x) => x !== e);
    },

    clearSelection() {
      this.selectedEmails = [];
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
      this.countsByEmail = {};
      this.countsByCampaign = {};
      this.showStats = false;
      this.isLoading = true;
      this.loadingText = 'Consultando campanhas...';

      try {
        const start = this.startDate.split('-').reverse().join('/');
        const end = this.endDate.split('-').reverse().join('/');

        const res = await api.post('/api/campaigns', {
          emailsSnovio: this.selectedEmails,
          startDate: start,
          endDate: end,
        });

        const { totalOpenings, countsByEmail, countsByCampaign } = res.data || {};
        this.totalOpenings = totalOpenings || 0;
        this.countsByEmail = countsByEmail || {};
        this.countsByCampaign = countsByCampaign || {};

        if (!this.totalOpenings) {
          this.warningMessage = 'Nenhuma abertura encontrada no período informado.';
          return;
        }

        this.showStats = true;

        if (downloadCsv) {
          this.loadingText = 'Baixando CSV...';
          const file = await api.post('/api/campaigns/download', {
            emailsSnovio: this.selectedEmails,
            startDate: start,
            endDate: end,
          }, { responseType: 'blob' });

          const blob = new Blob([file.data], { type: 'text/csv;charset=utf-8;' });
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
        const msg = err?.response?.data?.error?.message;
        this.errorMessage = Array.isArray(msg) ? msg.join(' | ') : (msg || 'Ocorreu um erro. Tente novamente.');
      } finally {
        this.isLoading = false;
      }
    },
  },
};
</script>
