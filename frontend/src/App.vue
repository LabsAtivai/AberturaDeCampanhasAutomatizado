<template>
  <div id="app" class="app">
    <header class="app-header">
      <div class="app-header-left">
        <img class="app-logo" src="./assets/logo.png" alt="Ativa.ai" />
        <div class="app-header-text">
          <span class="app-title">Relatório de Aberturas</span>
          <span class="app-subtitle">Monitoramento automático de campanhas</span>
        </div>
      </div>
    </header>

    <main class="app-main">
      <div class="page-wrapper">
        <div class="tabs" role="tablist" aria-label="Módulos">
          <button
            class="tab-btn"
            :class="{ active: activeTab === 'snovio' }"
            role="tab"
            :aria-selected="activeTab === 'snovio'"
            @click="activeTab = 'snovio'"
          >
            <span class="tab-icon">✉</span> Snov.io
          </button>
          <button
            class="tab-btn"
            :class="{ active: activeTab === 'ativalive' }"
            role="tab"
            :aria-selected="activeTab === 'ativalive'"
            @click="activeTab = 'ativalive'"
          >
            <span class="tab-icon">◉</span> ativa.live
          </button>
        </div>

        <section v-if="activeTab === 'snovio'" class="card" role="tabpanel" aria-label="Snov.io">
          <h1 class="card-title">Aberturas de campanhas</h1>
          <p class="card-text">
            Selecione o <strong>email Snov.io</strong> do cliente e o período desejado.
            O sistema consulta as campanhas, consolida as aberturas e gera um <strong>CSV</strong> pronto para análise.
          </p>
          <EmailForm />
        </section>

        <section v-if="activeTab === 'ativalive'" class="card" role="tabpanel" aria-label="ativa.live">
          <h1 class="card-title">Consultas ativa.live</h1>
          <p class="card-text">
            Selecione o <strong>cliente</strong> e o período desejado para visualizar
            o histórico de consultas realizadas no <strong>ativa.live</strong>.
          </p>
          <AtivaliveForm />
        </section>
      </div>
    </main>

    <footer class="app-footer">
      <small>Ativa.ai · Aberturas de Campanhas Automatizado</small>
    </footer>
  </div>
</template>

<script>
import EmailForm from './components/EmailForm.vue';
import AtivaliveForm from './components/AtivaliveForm.vue';

export default {
  name: 'App',
  components: { EmailForm, AtivaliveForm },
  data() {
    return { activeTab: 'snovio' };
  },
};
</script>

<style>
:root {
  --ativa-orange: #ff7a00;
  --ativa-orange-hover: #e86e00;
  --ativa-black: #111111;
  --ativa-white: #ffffff;
  --ativa-gray: #f5f5f5;
  --ativa-border: rgba(0, 0, 0, 0.09);
  --ativa-muted: #666;
}

*, *::before, *::after { box-sizing: border-box; }

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
  background: radial-gradient(circle at top left, #262626 0, #050505 55%);
  color: var(--ativa-white);
  -webkit-font-smoothing: antialiased;
}

.app { min-height: 100vh; display: flex; flex-direction: column; }

/* HEADER */
.app-header {
  height: 64px;
  display: flex;
  align-items: center;
  padding: 0 32px;
  background: rgba(30, 30, 30, 0.97);
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  backdrop-filter: blur(10px);
  position: sticky;
  top: 0;
  z-index: 100;
}
.app-header-left { display: flex; align-items: center; gap: 14px; }
.app-logo { height: 38px; width: auto; }
.app-header-text { display: flex; flex-direction: column; }
.app-title { font-size: 16px; font-weight: 600; color: var(--ativa-white); }
.app-subtitle { font-size: 11px; color: rgba(255, 255, 255, 0.5); }

/* MAIN */
.app-main {
  flex: 1;
  padding: 32px 16px 24px;
  display: flex;
  justify-content: center;
  align-items: flex-start;
}
.page-wrapper { width: 100%; max-width: 860px; }

/* TABS */
.tabs { display: flex; gap: 6px; margin-bottom: 0; }
.tab-btn {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 10px 22px;
  border-radius: 12px 12px 0 0;
  border: none;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.07);
  color: rgba(255, 255, 255, 0.5);
  transition: background 0.15s, color 0.15s;
}
.tab-btn:hover { background: rgba(255, 255, 255, 0.13); color: rgba(255, 255, 255, 0.9); }
.tab-btn.active { background: var(--ativa-gray); color: var(--ativa-black); }
.tab-icon { font-size: 14px; }

/* CARD */
.card {
  background: var(--ativa-gray);
  color: #111;
  border-radius: 0 16px 16px 16px;
  padding: 28px 32px 36px;
  box-shadow: 0 32px 80px rgba(0, 0, 0, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.03);
  position: relative;
  overflow: hidden;
}
.card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 3px;
  background: linear-gradient(90deg, var(--ativa-orange), transparent 70%);
}
.card-title { margin: 0 0 6px; font-size: 22px; font-weight: 700; color: var(--ativa-black); }
.card-text { margin: 0 0 24px; font-size: 13px; color: #555; line-height: 1.6; }

/* FOOTER */
.app-footer {
  padding: 10px 16px;
  text-align: center;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.35);
  background: #000;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

/* SHARED FORM STYLES — usadas por EmailForm e AtivaliveForm */
.form-wrapper { margin-top: 4px; }
.form { display: flex; flex-direction: column; gap: 20px; }
.form-row { display: flex; flex-direction: column; gap: 8px; }
.form-row-inline { flex-direction: row; align-items: flex-end; gap: 18px; margin-top: 4px; }
.form-field { flex: 1; display: flex; flex-direction: column; gap: 6px; }

label { font-size: 12px; font-weight: 600; color: #444; text-transform: uppercase; letter-spacing: 0.04em; }

input[type="text"],
input[type="date"],
.search-input {
  padding: 10px 13px;
  border-radius: 10px;
  border: 1px solid #d8d8d8;
  font-size: 14px;
  outline: none;
  background: #fff;
  color: #111;
  transition: border-color 0.15s, box-shadow 0.15s;
  width: 100%;
}
input[type="text"]:focus,
input[type="date"]:focus,
.search-input:focus {
  border-color: var(--ativa-orange);
  box-shadow: 0 0 0 3px rgba(255, 122, 0, 0.12);
}
input:disabled { background: #f0f0f0; cursor: not-allowed; color: #999; }

/* MULTI-SELECT CHECKBOXES */
.multi-select-box {
  border: 1px solid #d8d8d8;
  border-radius: 10px;
  background: #fff;
  max-height: 200px;
  overflow-y: auto;
  padding: 4px 0;
}
.multi-select-box:focus-within {
  border-color: var(--ativa-orange);
  box-shadow: 0 0 0 3px rgba(255, 122, 0, 0.12);
}
.ms-option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  cursor: pointer;
  transition: background 0.1s;
  user-select: none;
}
.ms-option:hover { background: #fff5ee; }
.ms-option.selected { background: #fff5ee; }
.ms-option input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: var(--ativa-orange);
  cursor: pointer;
  flex-shrink: 0;
  padding: 0;
  border-radius: 4px;
}
.ms-option-label { font-size: 13px; color: #222; line-height: 1.3; }
.ms-option-sub { font-size: 11px; color: #888; }
.ms-empty { padding: 12px; font-size: 13px; color: #999; text-align: center; }

.selected-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
  min-height: 0;
}
.tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: #fff0e5;
  color: #c05500;
  font-size: 12px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid rgba(255, 122, 0, 0.25);
}
.tag-remove {
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  color: #c05500;
  background: none;
  border: none;
  padding: 0;
}
.tag-remove:hover { color: #a03000; }
.helper { font-size: 11px; color: #999; margin-top: 2px; }

/* BUTTONS */
.buttons-row { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 4px; }
.btn-primary, .btn-secondary {
  padding: 10px 24px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  justify-content: center;
  border: none;
  transition: transform 0.08s, box-shadow 0.12s, background 0.12s, opacity 0.12s;
}
.btn-primary { background: var(--ativa-orange); color: #fff; }
.btn-primary:hover:not(:disabled) {
  background: var(--ativa-orange-hover);
  box-shadow: 0 8px 24px rgba(255, 122, 0, 0.35);
  transform: translateY(-1px);
}
.btn-secondary { background: #fff; color: #222; border: 1px solid #d0d0d0; }
.btn-secondary:hover:not(:disabled) { background: #f5f5f5; border-color: #aaa; }
.btn-primary:disabled, .btn-secondary:disabled { opacity: 0.55; cursor: not-allowed; box-shadow: none; }

/* LOADER */
.loader-wrapper { margin-top: 18px; }
.loader-text { font-size: 12px; color: #666; margin-bottom: 8px; }
.loader-bar { position: relative; width: 100%; height: 5px; background: #e0e0e0; border-radius: 999px; overflow: hidden; }
.loader-bar-inner { position: absolute; height: 100%; width: 40%; background: linear-gradient(90deg, var(--ativa-orange), #ffb04a); border-radius: 999px; animation: loaderAnim 1.3s infinite ease-in-out; }
@keyframes loaderAnim { 0% { transform: translateX(-120%); } 100% { transform: translateX(320%); } }

/* ALERTS */
.alert { margin-top: 14px; padding: 10px 14px; border-radius: 10px; font-size: 13px; line-height: 1.5; }
.alert-warning { background: #fff7ed; color: #92400e; border: 1px solid #fed7aa; }
.alert-error { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }

/* RESULTS SECTION */
.results-section { margin-top: 24px; display: flex; flex-direction: column; gap: 16px; }

.result-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 12px;
}
.summary-card {
  background: #fff;
  border: 1px solid var(--ativa-border);
  border-radius: 12px;
  padding: 14px 16px;
}
.summary-label { font-size: 11px; font-weight: 600; color: #888; text-transform: uppercase; letter-spacing: 0.04em; margin: 0 0 4px; }
.summary-value { font-size: 28px; font-weight: 700; color: var(--ativa-black); margin: 0; line-height: 1.1; }
.summary-sub { font-size: 11px; color: #aaa; margin: 2px 0 0; }

.stats-box {
  background: #fff;
  border: 1px solid var(--ativa-border);
  border-radius: 14px;
  overflow: hidden;
}
.stats-box-header {
  padding: 12px 16px;
  font-size: 12px;
  font-weight: 700;
  color: #444;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid var(--ativa-border);
  background: #fafafa;
  display: flex;
  align-items: center;
  gap: 8px;
}
.stats-box-body {
  max-height: 240px;
  overflow-y: auto;
}
.stats-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 9px 16px;
  font-size: 13px;
  border-bottom: 1px solid rgba(0,0,0,0.04);
}
.stats-row:last-child { border-bottom: none; }
.stats-row:hover { background: #fafafa; }
.stats-name { color: #222; flex: 1; margin-right: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.stats-badge {
  background: #fff0e5;
  color: #c05500;
  font-size: 12px;
  font-weight: 700;
  padding: 2px 10px;
  border-radius: 999px;
  white-space: nowrap;
  flex-shrink: 0;
}

/* CHART */
.chart-container { padding: 16px; background: #fff; border: 1px solid var(--ativa-border); border-radius: 14px; }
.chart-title { font-size: 12px; font-weight: 700; color: #444; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 12px; }
.bar-chart { display: flex; flex-direction: column; gap: 7px; }
.bar-row { display: flex; align-items: center; gap: 10px; }
.bar-label { font-size: 12px; color: #555; width: 160px; flex-shrink: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: right; }
.bar-track { flex: 1; background: #f0f0f0; border-radius: 4px; height: 16px; position: relative; overflow: hidden; }
.bar-fill { height: 100%; border-radius: 4px; background: var(--ativa-orange); transition: width 0.6s ease; }
.bar-val { font-size: 12px; font-weight: 600; color: #444; width: 36px; flex-shrink: 0; }

@media (max-width: 640px) {
  .form-row-inline { flex-direction: column; }
  .card { padding: 20px 16px 24px; }
  .bar-label { width: 100px; font-size: 11px; }
  .result-summary { grid-template-columns: 1fr 1fr; }
}
</style>
