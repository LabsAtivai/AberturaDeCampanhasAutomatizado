<template>
  <div class="form-wrapper">

    <!-- ═══ CARD SEMANAL ═══ -->
    <div class="weekly-card">
      <div class="weekly-card-header">
        <span class="weekly-icon">📅</span>
        <div class="weekly-card-info">
          <div class="weekly-title">Base Semanal Automática</div>
          <div class="weekly-week-label">{{ semanaLabel || 'carregando...' }}</div>
        </div>
      </div>
      <div class="weekly-actions">
        <button class="btn-ver-resumo" @click="onVerResumo" :disabled="isLoadingSemanal">
          ≡ Ver resumo
        </button>
        <button class="btn-baixar-csv-semanal" @click="onBaixarCSVSemanal" :disabled="isLoadingSemanal">
          ⬇ Baixar CSV
        </button>
      </div>
      <div v-if="semanalError" class="alert alert-error" style="margin-top:8px;">{{ semanalError }}</div>
    </div>

    <!-- ═══ RESULTADO SEMANAL ═══ -->
    <div v-if="showSemanal && semanalData" class="semanal-section">

      <!-- Contadores -->
      <div class="type-counters">
        <div class="type-counter legacy-counter">
          <div class="counter-label">🟢 Legacy</div>
          <div class="counter-num">{{ semanalData.totais.legacy + semanalData.totais.semCadastro }}</div>
          <div class="counter-sub">clientes</div>
          <div class="counter-consults">{{ semanalData.totalConsultas.legacy + semanalData.totalConsultas.semCadastro }} consultas</div>
        </div>
        <div class="type-counter trial-ativo-counter">
          <div class="counter-label">🟡 Trial ativo</div>
          <div class="counter-num">{{ semanalData.totais.trialAtivo }}</div>
          <div class="counter-sub">clientes</div>
          <div class="counter-consults">{{ semanalData.totalConsultas.trialAtivo }} consultas</div>
        </div>
        <div class="type-counter trial-expirado-counter">
          <div class="counter-label">🔴 Trial expirado</div>
          <div class="counter-num">{{ semanalData.totais.trialExpirado }}</div>
          <div class="counter-sub">clientes</div>
          <div class="counter-consults">{{ semanalData.totalConsultas.trialExpirado }} consultas</div>
        </div>
      </div>

      <!-- Grupo Legacy -->
      <div v-if="legacyClientes.length" class="stats-box semanal-group">
        <div class="stats-box-header legacy-header">
          <span class="dot dot-legacy"></span> Legacy
          <span class="semanal-badge badge-legacy">{{ legacyClientes.length }}</span>
        </div>
        <div class="stats-box-body">
          <div class="stats-row" v-for="item in legacyClientes" :key="item.cliente">
            <div style="flex:1;min-width:0;">
              <div class="stats-name" :title="item.cliente">{{ item.cliente }}</div>
              <div style="font-size:11px;color:#999;margin-top:2px;">{{ item.primeiraConsulta }} → {{ item.ultimaConsulta }}</div>
            </div>
            <span class="semanal-count badge-legacy-count">{{ item.total }}</span>
          </div>
        </div>
      </div>

      <!-- Grupo Trial ativo -->
      <div v-if="trialAtivoClientes.length" class="stats-box semanal-group">
        <div class="stats-box-header trial-ativo-header">
          <span class="dot dot-trial-ativo"></span> Trial ativo
          <span class="semanal-badge badge-trial-ativo">{{ trialAtivoClientes.length }}</span>
        </div>
        <div class="stats-box-body">
          <div class="stats-row" v-for="item in trialAtivoClientes" :key="item.cliente">
            <div style="flex:1;min-width:0;">
              <div class="stats-name" :title="item.cliente">{{ item.cliente }}</div>
              <div style="font-size:11px;color:#999;margin-top:2px;">{{ item.primeiraConsulta }} → {{ item.ultimaConsulta }}</div>
              <span class="trial-tag trial-tag-ativo">expira em {{ item.diasRestantes }}d ({{ item.expiresAt }})</span>
            </div>
            <span class="semanal-count badge-trial-ativo-count">{{ item.total }}</span>
          </div>
        </div>
      </div>

      <!-- Grupo Trial expirado -->
      <div v-if="trialExpiradoClientes.length" class="stats-box semanal-group">
        <div class="stats-box-header trial-expirado-header">
          <span class="dot dot-trial-expirado"></span> Trial expirado
          <span class="semanal-badge badge-trial-expirado">{{ trialExpiradoClientes.length }}</span>
        </div>
        <div class="stats-box-body">
          <div class="stats-row" v-for="item in trialExpiradoClientes" :key="item.cliente">
            <div style="flex:1;min-width:0;">
              <div class="stats-name" :title="item.cliente">{{ item.cliente }}</div>
              <div style="font-size:11px;color:#999;margin-top:2px;">{{ item.primeiraConsulta }} → {{ item.ultimaConsulta }}</div>
              <span class="trial-tag trial-tag-expirado">expirou há {{ Math.abs(item.diasRestantes) }}d ({{ item.expiresAt }})</span>
            </div>
            <span class="semanal-count badge-trial-expirado-count">{{ item.total }}</span>
          </div>
        </div>
      </div>

    </div>

    <!-- ═══ SEPARADOR ═══ -->
    <div class="divider"><span>ou consulta por período</span></div>

    <!-- ═══ FORMULÁRIO MANUAL (inalterado) ═══ -->
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

    <!-- RESULTADOS MANUAL -->
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
      // Semanal
      semanaLabel: '',
      semanalData: null,
      showSemanal: false,
      isLoadingSemanal: false,
      semanalError: '',
      // Manual
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
    // Pré-carrega label da semana silenciosamente
    try {
      const res = await api.get('/api/ativalive/semanal');
      this.semanaLabel = res.data?.labelShort || res.data?.semana || '';
    } catch {
      // silencioso — label fica vazio
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
    legacyClientes() {
      return (this.semanalData?.clientes || []).filter((c) => c.tipo === 'LEGACY');
    },
    trialAtivoClientes() {
      return (this.semanalData?.clientes || []).filter((c) => c.tipo === 'TRIAL_ATIVO');
    },
    trialExpiradoClientes() {
      return (this.semanalData?.clientes || []).filter((c) => c.tipo === 'TRIAL_EXPIRADO');
    },
  },

  methods: {
    removeClient(c) { this.selectedClients = this.selectedClients.filter((x) => x !== c); },
    clearSelection() { this.selectedClients = []; },

    async onVerResumo() {
      this.semanalError = '';
      this.isLoadingSemanal = true;
      try {
        const res = await api.get('/api/ativalive/semanal');
        this.semanalData = res.data;
        this.semanaLabel = res.data?.labelShort || res.data?.semana || '';
        this.showSemanal = true;
      } catch {
        this.semanalError = 'Erro ao carregar a base semanal. Tente novamente.';
      } finally {
        this.isLoadingSemanal = false;
      }
    },

    async onBaixarCSVSemanal() {
      this.semanalError = '';
      this.isLoadingSemanal = true;
      try {
        const res = await api.get('/api/ativalive/semanal/download', { responseType: 'blob' });
        const contentDisposition = res.headers['content-disposition'] || '';
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        const filename = match ? match[1] : 'BaseSemanal_Ativalive.csv';

        const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
      } catch {
        this.semanalError = 'Erro ao baixar o CSV semanal. Tente novamente.';
      } finally {
        this.isLoadingSemanal = false;
      }
    },

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

<style scoped>
/* ─── CARD SEMANAL ─── */
.weekly-card {
  background: linear-gradient(135deg, #1a1f2e 0%, #0f1420 100%);
  border-radius: 14px;
  padding: 16px 18px;
  margin-bottom: 16px;
  border: 1px solid rgba(255,255,255,0.07);
}

.weekly-card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}

.weekly-icon { font-size: 22px; line-height: 1; }

.weekly-card-info { display: flex; flex-direction: column; gap: 3px; }

.weekly-title { font-size: 14px; font-weight: 700; color: #e8eaf0; }

.weekly-week-label { font-size: 12px; color: #7a8aaa; font-weight: 500; }

.weekly-actions { display: flex; gap: 8px; flex-wrap: wrap; }

.btn-ver-resumo {
  padding: 8px 18px;
  border-radius: 999px;
  border: none;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  background: #2563eb;
  color: #fff;
  transition: background 0.12s ease, transform 0.08s ease;
}
.btn-ver-resumo:hover:not(:disabled) { background: #1d4ed8; transform: translateY(-1px); }
.btn-ver-resumo:disabled { opacity: 0.6; cursor: wait; }

.btn-baixar-csv-semanal {
  padding: 8px 18px;
  border-radius: 999px;
  border: none;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  background: #16a34a;
  color: #fff;
  transition: background 0.12s ease, transform 0.08s ease;
}
.btn-baixar-csv-semanal:hover:not(:disabled) { background: #15803d; transform: translateY(-1px); }
.btn-baixar-csv-semanal:disabled { opacity: 0.6; cursor: wait; }

/* ─── RESULTADO SEMANAL ─── */
.semanal-section { margin-bottom: 4px; }

.type-counters {
  display: flex;
  gap: 10px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}

.type-counter {
  flex: 1;
  min-width: 100px;
  border-radius: 12px;
  padding: 12px 14px;
  border: 1px solid;
}

.legacy-counter          { background: #0d1f0d; border-color: #166534; }
.trial-ativo-counter     { background: #1a1505; border-color: #854d0e; }
.trial-expirado-counter  { background: #1f0d0d; border-color: #7f1d1d; }

.counter-label    { font-size: 11px; font-weight: 600; color: #aaa; margin-bottom: 4px; }
.counter-num      { font-size: 26px; font-weight: 800; color: #e8eaf0; line-height: 1; }
.counter-sub      { font-size: 10px; color: #666; margin-bottom: 4px; }
.counter-consults { font-size: 11px; color: #777; }

/* ─── GRUPOS ─── */
.semanal-group { margin-bottom: 10px; }

.legacy-header        { color: #86efac !important; }
.trial-ativo-header   { color: #fcd34d !important; }
.trial-expirado-header { color: #fca5a5 !important; }

.dot {
  display: inline-block;
  width: 8px; height: 8px;
  border-radius: 50%;
  margin-right: 4px;
  flex-shrink: 0;
}
.dot-legacy          { background: #22c55e; }
.dot-trial-ativo     { background: #f59e0b; }
.dot-trial-expirado  { background: #ef4444; }

.semanal-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 1px 8px;
  border-radius: 999px;
  margin-left: auto;
}
.badge-legacy         { background: #14532d; color: #86efac; }
.badge-trial-ativo    { background: #451a03; color: #fcd34d; }
.badge-trial-expirado { background: #450a0a; color: #fca5a5; }

.semanal-count {
  font-weight: 700;
  font-size: 13px;
  padding: 2px 9px;
  border-radius: 999px;
  white-space: nowrap;
  flex-shrink: 0;
}
.badge-legacy-count         { background: #14532d; color: #86efac; }
.badge-trial-ativo-count    { background: #451a03; color: #fcd34d; }
.badge-trial-expirado-count { background: #450a0a; color: #fca5a5; }

.trial-tag {
  display: inline-block;
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 999px;
  margin-top: 3px;
}
.trial-tag-ativo    { background: #451a03; color: #fcd34d; }
.trial-tag-expirado { background: #450a0a; color: #fca5a5; }

/* ─── SEPARADOR ─── */
.divider {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 20px 0;
  color: #bbb;
  font-size: 12px;
}
.divider::before, .divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: #e0e0e0;
}
</style>
