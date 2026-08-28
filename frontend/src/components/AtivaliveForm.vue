<template>
  <div class="form-wrapper">

    <!-- CARD DE AÇÃO RÁPIDA — BASE SEMANAL -->
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
      <p v-if="semanalError" class="error-msg" style="margin-top:8px;">{{ semanalError }}</p>
    </div>

    <!-- RESULTADO SEMANAL -->
    <div v-if="showSemanal && semanalData" class="semanal-section">

      <!-- Contadores por tipo -->
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

      <!-- Grupo LEGACY -->
      <div v-if="legacyClientes.length" class="stats-box semanal-group">
        <div class="stats-header legacy-header">
          <span class="dot dot-legacy"></span>
          Legacy
          <span class="stats-badge badge-legacy">{{ legacyClientes.length }}</span>
        </div>
        <div class="stats-list">
          <div v-for="item in legacyClientes" :key="item.cliente" class="stats-item">
            <div class="stats-item-left">
              <span class="stats-email">{{ item.cliente }}</span>
              <span class="stats-meta">{{ item.primeiraConsulta }} → {{ item.ultimaConsulta }}</span>
            </div>
            <span class="stats-count badge-count badge-legacy-count">{{ item.total }}</span>
          </div>
        </div>
      </div>

      <!-- Grupo TRIAL ATIVO -->
      <div v-if="trialAtivoClientes.length" class="stats-box semanal-group">
        <div class="stats-header trial-ativo-header">
          <span class="dot dot-trial-ativo"></span>
          Trial ativo
          <span class="stats-badge badge-trial-ativo">{{ trialAtivoClientes.length }}</span>
        </div>
        <div class="stats-list">
          <div v-for="item in trialAtivoClientes" :key="item.cliente" class="stats-item">
            <div class="stats-item-left">
              <span class="stats-email">{{ item.cliente }}</span>
              <span class="stats-meta">{{ item.primeiraConsulta }} → {{ item.ultimaConsulta }}</span>
              <span class="trial-tag trial-tag-ativo">
                expira em {{ item.diasRestantes }}d ({{ item.expiresAt }})
              </span>
            </div>
            <span class="stats-count badge-count badge-trial-ativo-count">{{ item.total }}</span>
          </div>
        </div>
      </div>

      <!-- Grupo TRIAL EXPIRADO -->
      <div v-if="trialExpiradoClientes.length" class="stats-box semanal-group">
        <div class="stats-header trial-expirado-header">
          <span class="dot dot-trial-expirado"></span>
          Trial expirado
          <span class="stats-badge badge-trial-expirado">{{ trialExpiradoClientes.length }}</span>
        </div>
        <div class="stats-list">
          <div v-for="item in trialExpiradoClientes" :key="item.cliente" class="stats-item">
            <div class="stats-item-left">
              <span class="stats-email">{{ item.cliente }}</span>
              <span class="stats-meta">{{ item.primeiraConsulta }} → {{ item.ultimaConsulta }}</span>
              <span class="trial-tag trial-tag-expirado">
                expirou há {{ Math.abs(item.diasRestantes) }}d ({{ item.expiresAt }})
              </span>
            </div>
            <span class="stats-count badge-count badge-trial-expirado-count">{{ item.total }}</span>
          </div>
        </div>
      </div>

    </div>

    <!-- SEPARADOR -->
    <div class="divider"><span>ou consulta por período</span></div>

    <!-- FORMULÁRIO MANUAL -->
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

    <!-- ESTATÍSTICAS MANUAL -->
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
    // Carrega lista de clientes
    try {
      const res = await api.get('/api/ativalive/clientes');
      this.clientOptions = res.data || [];
    } catch (err) {
      console.error('Erro ao carregar clientes:', err);
      this.errorMessage = 'Não foi possível carregar a lista de clientes.';
    }
    // Pré-carrega label da semana silenciosamente
    try {
      const res = await api.get('/api/ativalive/semanal');
      this.semanaLabel = res.data?.labelShort || res.data?.semana || '';
    } catch (err) {
      console.error('Erro ao pré-carregar semana:', err);
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
    legacyClientes() {
      return (this.semanalData?.clientes || []).filter(c => c.tipo === 'LEGACY');
    },
    trialAtivoClientes() {
      return (this.semanalData?.clientes || []).filter(c => c.tipo === 'TRIAL_ATIVO');
    },
    trialExpiradoClientes() {
      return (this.semanalData?.clientes || []).filter(c => c.tipo === 'TRIAL_EXPIRADO');
    },
  },

  methods: {
    async onVerResumo() {
      this.semanalError = '';
      this.isLoadingSemanal = true;
      try {
        const res = await api.get('/api/ativalive/semanal');
        this.semanalData = res.data;
        this.semanaLabel = res.data?.labelShort || res.data?.semana || '';
        this.showSemanal = true;
      } catch (err) {
        console.error('Erro ao carregar semanal:', err);
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
        const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
        const filename = filenameMatch ? filenameMatch[1] : 'BaseSemanal_Ativalive.csv';

        const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
      } catch (err) {
        console.error('Erro ao baixar CSV semanal:', err);
        this.semanalError = 'Erro ao baixar o CSV semanal. Tente novamente.';
      } finally {
        this.isLoadingSemanal = false;
      }
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

.weekly-card-info { display: flex; flex-direction: column; gap: 2px; }

.weekly-title {
  font-size: 14px;
  font-weight: 700;
  color: #e8eaf0;
}

.weekly-week-label {
  font-size: 12px;
  color: #7a8aaa;
  font-weight: 500;
}

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
.btn-ver-resumo:hover { background: #1d4ed8; transform: translateY(-1px); }
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
.btn-baixar-csv-semanal:hover { background: #15803d; transform: translateY(-1px); }
.btn-baixar-csv-semanal:disabled { opacity: 0.6; cursor: wait; }

/* ─── RESULTADO SEMANAL ─── */
.semanal-section { margin-bottom: 8px; }

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

.legacy-counter    { background: #0d1f0d; border-color: #166534; }
.trial-ativo-counter  { background: #1a1505; border-color: #854d0e; }
.trial-expirado-counter { background: #1f0d0d; border-color: #7f1d1d; }

.counter-label { font-size: 11px; font-weight: 600; color: #aaa; margin-bottom: 4px; }
.counter-num   { font-size: 24px; font-weight: 800; color: #e8eaf0; line-height: 1; }
.counter-sub   { font-size: 10px; color: #666; margin-bottom: 4px; }
.counter-consults { font-size: 11px; color: #777; }

/* ─── GRUPOS SEMANAL ─── */
.semanal-group { margin-bottom: 10px; }

.legacy-header        { color: #86efac; }
.trial-ativo-header   { color: #fcd34d; }
.trial-expirado-header { color: #fca5a5; }

.dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.dot-legacy          { background: #22c55e; }
.dot-trial-ativo     { background: #f59e0b; }
.dot-trial-expirado  { background: #ef4444; }

.badge-legacy         { background: #14532d; color: #86efac; }
.badge-trial-ativo    { background: #451a03; color: #fcd34d; }
.badge-trial-expirado { background: #450a0a; color: #fca5a5; }

.badge-legacy-count         { color: #86efac; background: #14532d; padding: 2px 8px; border-radius: 999px; font-size: 13px; }
.badge-trial-ativo-count    { color: #fcd34d; background: #451a03; padding: 2px 8px; border-radius: 999px; font-size: 13px; }
.badge-trial-expirado-count { color: #fca5a5; background: #450a0a; padding: 2px 8px; border-radius: 999px; font-size: 13px; }

.badge-count { font-weight: 700; white-space: nowrap; }

.trial-tag {
  display: inline-block;
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 999px;
  margin-top: 2px;
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
.divider::before,
.divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: #e0e0e0;
}

/* ─── FORMULÁRIO MANUAL ─── */
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
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--ativa-orange);
  color: #fff;
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
  .type-counters { flex-direction: column; }
}
</style>
