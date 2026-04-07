<template>
  <div id="app" class="app">
    <header class="app-header">
      <div class="app-header-left">
        <img class="app-logo" :src="logoUrl" alt="Ativa.ai" />
        <div class="app-header-text">
          <span class="app-title">Relatório de Aberturas</span>
          <span class="app-subtitle">Monitoramento automático de campanhas</span>
        </div>
      </div>
    </header>

    <main class="app-main">
      <div class="page-wrapper">

        <!-- TABS -->
        <div class="tabs">
          <button
            class="tab-btn"
            :class="{ active: activeTab === 'snovio' }"
            @click="activeTab = 'snovio'"
          >
            📧 Snov.io
          </button>
          <button
            class="tab-btn"
            :class="{ active: activeTab === 'ativalive' }"
            @click="activeTab = 'ativalive'"
          >
            🔴 ativa.live
          </button>
        </div>

        <!-- ABA SNOV.IO -->
        <section v-if="activeTab === 'snovio'" class="card">
          <h1 class="card-title">Aberturas de campanhas</h1>
          <p class="card-text">
            Selecione o <strong>email Snov.io</strong> do cliente e o período desejado.
            O sistema irá consultar as campanhas, consolidar as aberturas e gerar um
            arquivo <strong>CSV</strong> pronto para análise.
          </p>
          <EmailForm />
        </section>

        <!-- ABA ATIVA.LIVE -->
        <section v-if="activeTab === 'ativalive'" class="card">
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
    return {
      activeTab: 'snovio',
      logoUrl:
        'https://firebasestorage.googleapis.com/v0/b/ativaaifoto.appspot.com/o/Logo_Ativa_BIMI_Compliant.svg?alt=media&token=93d2725f-7d92-4c87-8299-c769f186b5ff',
    };
  },
};
</script>

<style>
:root {
  --ativa-orange: #ff7a00;
  --ativa-black: #111111;
  --ativa-white: #ffffff;
  --ativa-gray: #f5f5f5;
}

*, *::before, *::after { box-sizing: border-box; }

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen,
    Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
  background: radial-gradient(circle at top left, #262626 0, #050505 55%);
  color: var(--ativa-white);
}

.app { min-height: 100vh; display: flex; flex-direction: column; }

/* HEADER */
.app-header {
  height: 64px;
  display: flex;
  align-items: center;
  padding: 0 32px;
  background: rgba(75, 71, 71, 0.96);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(8px);
}
.app-header-left { display: flex; align-items: center; gap: 12px; }
.app-logo { height: 60px; width: auto; transform: translateY(-1px); }
.app-header-text { display: flex; flex-direction: column; }
.app-title { font-size: 18px; font-weight: 600; color: var(--ativa-white); }
.app-subtitle { font-size: 12px; color: rgba(255, 255, 255, 0.7); }

/* CONTEÚDO */
.app-main {
  flex: 1;
  padding: 32px 16px 24px;
  display: flex;
  justify-content: center;
  align-items: flex-start;
}
.page-wrapper { width: 100%; max-width: 840px; }

/* TABS */
.tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 0;
}
.tab-btn {
  padding: 10px 24px;
  border-radius: 14px 14px 0 0;
  border: none;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.55);
  transition: background 0.15s, color 0.15s;
}
.tab-btn:hover {
  background: rgba(255, 255, 255, 0.14);
  color: rgba(255, 255, 255, 0.85);
}
.tab-btn.active {
  background: var(--ativa-gray);
  color: var(--ativa-black);
}

/* CARD */
.card {
  background: var(--ativa-gray);
  color: #111;
  border-radius: 0 18px 18px 18px;
  padding: 28px 32px 32px;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.55);
  border: 1px solid rgba(255, 255, 255, 0.04);
  position: relative;
  overflow: hidden;
}
.card::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(135deg, rgba(255, 122, 0, 0.22), transparent 40%);
  opacity: 0.5;
  pointer-events: none;
}
.card > * { position: relative; z-index: 1; }

.card-title { margin: 0 0 4px; font-size: 24px; font-weight: 600; color: var(--ativa-black); }
.card-text { margin: 0 0 22px; font-size: 14px; color: #555; max-width: 640px; }

/* FOOTER */
.app-footer {
  padding: 10px 16px;
  text-align: center;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.6);
  background: #000;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}
</style>
