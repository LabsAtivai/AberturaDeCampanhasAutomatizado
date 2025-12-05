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
          v-model="selectedEmailValues"
          multiple
          class="email-select"
          :disabled="isLoading || !filteredOptions.length"
          size="6"
          @change="logSelection"
        >
          <option
            v-for="opt in filteredOptions"
            :key="opt.value"
            :value="opt.value"
            :title="opt.label"
          >
            {{ opt.label }}
          </option>
        </select>
        <small class="helper">
          Use CTRL / SHIFT para selecionar mais de um email.
          <span v-if="selectedEmailValues.length > 0">
            Selecionados: {{ selectedEmailValues.length }}
          </span>
        </small>
        
        <!-- DEBUG: Mostrar o que está sendo enviado -->
        <div v-if="debugMode" class="debug-info">
          <h4>🔍 Debug Info:</h4>
          <p><strong>Valores selecionados:</strong> {{ selectedEmailValues }}</p>
          <p><strong>Opções filtradas:</strong> {{ filteredOptions.length }}</p>
          <p><strong>Opções completas:</strong> {{ emailOptions.length }}</p>
        </div>
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
            @change="validateDates"
          />
        </div>

        <div class="form-field">
          <label>Data de fim</label>
          <input
            v-model="endDate"
            type="date"
            required
            :disabled="isLoading"
            @change="validateDates"
          />
        </div>
      </div>

      <!-- BOTÕES -->
      <div class="buttons-row">
        <button
          type="submit"
          class="btn-primary"
          :disabled="isLoading || !selectedEmailValues.length"
        >
          <span v-if="!isLoading">📈 Gerar CSV</span>
          <span v-else>⏳ Gerando CSV...</span>
        </button>

        <button
          type="button"
          class="btn-secondary"
          :disabled="isLoading || !selectedEmailValues.length"
          @click="onStatsClick"
        >
          📊 Estatísticas de abertura
        </button>
        
        <button
          type="button"
          class="btn-info"
          @click="debugMode = !debugMode"
        >
          🔧 Debug
        </button>
      </div>
    </form>

    <!-- LOADER -->
    <div v-if="isLoading" class="loader-wrapper">
      <div class="loader-text">{{ loadingText }}</div>
      <div class="loader-bar">
        <div class="loader-bar-inner"></div>
      </div>
      
      <!-- Mostrar emails sendo processados -->
      <div v-if="processingEmails.length" class="processing-info">
        <p>Processando:</p>
        <ul>
          <li v-for="email in processingEmails" :key="email">{{ email }}</li>
        </ul>
      </div>
    </div>

    <!-- MENSAGENS -->
    <div v-if="warningMessage" class="warning-msg">
      ⚠️ {{ warningMessage }}
    </div>

    <div v-if="errorMessage" class="error-msg">
      ❌ {{ errorMessage }}
    </div>

    <!-- ESTATÍSTICAS -->
    <div v-if="showStats && totalOpenings > 0" class="stats-box">
      <div class="stats-header">📊 Estatísticas de aberturas</div>

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
      selectedEmailValues: [], // Armazena os valores reais (emailSnovio)
      startDate: '',
      endDate: '',
      emailOptions: [], // Array de objetos { value, label }
      searchTerm: '',
      isLoading: false,
      loadingText: 'Processando...',
      warningMessage: '',
      errorMessage: '',
      totalOpenings: 0,
      emailCounts: [],
      showStats: false,
      debugMode: false,
      processingEmails: [],
    };
  },

  async mounted() {
    try {
      this.loadingText = 'Carregando emails...';
      const res = await api.get('/api/campaigns/get-emails');
      
      // Transforma os dados para o formato correto
      this.emailOptions = (res.data || []).map(item => {
        // item pode ser string ou objeto com emailSnovio e totalCampaigns
        let value, label;
        
        if (typeof item === 'string') {
          value = item;
          label = item;
        } else if (item.emailSnovio) {
          value = item.emailSnovio;
          
        } else if (item.email) {
          value = item.email;
          
        } else {
          value = JSON.stringify(item);
          label = JSON.stringify(item);
        }
        
        return { value, label };
      });
      
      console.log('📧 Emails carregados:', this.emailOptions);
      this.setDefaultDates();
    } catch (err) {
      console.error('❌ Erro ao carregar emails:', err);
      this.errorMessage = 'Não foi possível carregar a lista de emails. Verifique a conexão.';
    }
  },

  computed: {
    filteredOptions() {
      const term = this.searchTerm.trim().toLowerCase();
      if (!term) return this.emailOptions;

      return this.emailOptions.filter((opt) => {
        // Filtra tanto pelo valor quanto pelo label
        return (
          opt.value.toLowerCase().includes(term) ||
          opt.label.toLowerCase().includes(term)
        );
      });
    },
  },

  methods: {
    setDefaultDates() {
      const today = new Date();
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(today.getMonth() - 1);
      
      // Formato YYYY-MM-DD para input date
      this.endDate = today.toISOString().split('T')[0];
      this.startDate = oneMonthAgo.toISOString().split('T')[0];
    },
    
    validateDates() {
      if (this.startDate && this.endDate) {
        const start = new Date(this.startDate);
        const end = new Date(this.endDate);
        
        if (start > end) {
          this.warningMessage = 'Data inicial não pode ser maior que data final';
          // Auto-corrige trocando as datas
          [this.startDate, this.endDate] = [this.endDate, this.startDate];
        } else {
          this.warningMessage = '';
        }
      }
    },
    
    logSelection() {
      console.log('📝 Emails selecionados:', this.selectedEmailValues);
      console.log('📝 Opções selecionadas detalhadas:', 
        this.selectedEmailValues.map(value => 
          this.emailOptions.find(opt => opt.value === value)?.label || value
        )
      );
    },
    
    async onSubmit() {
      await this.runReport({ downloadCsv: true });
    },

    async onStatsClick() {
      await this.runReport({ downloadCsv: false });
    },

    async runReport({ downloadCsv }) {
      console.log('🚀 Iniciando relatório...');
      console.log('📤 Emails que serão enviados:', this.selectedEmailValues);
      console.log('📤 Data inicial:', this.startDate);
      console.log('📤 Data final:', this.endDate);
      
      if (!this.selectedEmailValues.length) {
        this.warningMessage = 'Selecione pelo menos um email Snov.io.';
        return;
      }

      if (!this.startDate || !this.endDate) {
        this.warningMessage = 'Selecione o período.';
        return;
      }
      
      this.errorMessage = '';
      this.warningMessage = '';
      this.totalOpenings = 0;
      this.emailCounts = [];
      this.showStats = false;
      this.isLoading = true;
      this.processingEmails = [...this.selectedEmailValues];
      
      try {
        // Formata datas para dd/mm/yyyy
        const formatForAPI = (dateStr) => {
          const [year, month, day] = dateStr.split('-');
          return `${day}/${month}/${year}`;
        };
        
        const payload = {
          emailsSnovio: this.selectedEmailValues,
          startDate: formatForAPI(this.startDate),
          endDate: formatForAPI(this.endDate),
        };
        
        console.log('📤 Payload enviado:', payload);
        
        this.loadingText = 'Consultando campanhas...';
        const res = await api.post('/api/campaigns', payload);
        
        console.log('📥 Resposta recebida:', res.data);
        
        const { totalOpenings, countsByEmail, message } = res.data || {};
        this.totalOpenings = totalOpenings || 0;
        
        // Transforma countsByEmail em array para exibição
        const entries = Object.entries(countsByEmail || {});
        this.emailCounts = entries
          .map(([email, count]) => ({ email, count }))
          .sort((a, b) => b.count - a.count);
        
        this.showStats = true;
        this.warningMessage = this.totalOpenings === 0 
          ? 'Nenhuma abertura encontrada no período selecionado.'
          : '';
        
        if (downloadCsv && this.totalOpenings > 0) {
          this.loadingText = 'Baixando CSV...';
          
          try {
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
            
            console.log('✅ CSV baixado com sucesso');
          } catch (downloadError) {
            console.error('❌ Erro ao baixar CSV:', downloadError);
            this.errorMessage = 'CSV gerado, mas houve erro no download.';
          }
        }
      } catch (err) {
        console.error('❌ Erro ao gerar relatório:', err);
        console.error('❌ Detalhes:', err.response?.data);
        
        if (err.response?.data?.message) {
          this.errorMessage = `Erro: ${err.response.data.message}`;
        } else if (err.response?.status === 401) {
          this.errorMessage = 'Falha na autenticação com Snov.io. Verifique as credenciais.';
        } else {
          this.errorMessage = 'Ocorreu um erro ao gerar o relatório. Tente novamente.';
        }
      } finally {
        this.isLoading = false;
        this.processingEmails = [];
        this.loadingText = 'Processando...';
      }
    },
  },
};
</script>

<style scoped>
/* Estilos anteriores mantidos... */

/* Novos estilos para debug */
.debug-info {
  margin-top: 10px;
  padding: 10px;
  background-color: #f5f5f5;
  border-radius: 5px;
  border-left: 4px solid #2196f3;
  font-size: 12px;
}

.debug-info h4 {
  margin: 0 0 5px 0;
  color: #2196f3;
}

.processing-info {
  margin-top: 10px;
  font-size: 12px;
  color: #666;
}

.processing-info ul {
  margin: 5px 0;
  padding-left: 20px;
}

.processing-info li {
  margin: 2px 0;
}

.btn-info {
  padding: 8px 15px;
  border-radius: 999px;
  border: 1px solid #2196f3;
  background: #e3f2fd;
  color: #2196f3;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-info:hover {
  background: #bbdefb;
}

/* Melhorar visibilidade dos selects */
.email-select option {
  padding: 5px;
  border-bottom: 1px solid #eee;
}

.email-select option:checked {
  background-color: #ff7a00;
  color: white;
}

/* Indicador de seleção */
.helper span {
  display: block;
  margin-top: 5px;
  font-weight: bold;
  color: #ff7a00;
}
</style>
