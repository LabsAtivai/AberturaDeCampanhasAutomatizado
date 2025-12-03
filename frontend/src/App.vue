<template>
  <div id="app">
    <header>
      <h1>Automação de Aberturas de Campanhas</h1>
    </header>

    <!-- Usando o componente EmailForm -->
    <EmailForm />

    <!-- Usando o componente CampaignList -->
    <CampaignList :campaigns="campaigns" />

    <footer>
      <p>&copy; 2025 Sua Empresa</p>
    </footer>
  </div>
</template>

<script>
// Importando os componentes necessários
import EmailForm from './components/EmailForm.vue';
import CampaignList from './components/CampaignList.vue';

export default {
  name: 'App',
  components: {
    EmailForm,
    CampaignList
  },
  data() {
    return {
      campaigns: [] // Aqui você pode armazenar a lista de campanhas, preenchida com os dados reais
    };
  }
};
</script>

<style scoped>
/* Estilos gerais do seu app */
#app {
  font-family: Arial, sans-serif;
  background-color: #f9f9f9;
  padding: 20px;
}

header {
  background-color: #42b983;
  padding: 10px;
  color: white;
  text-align: center;
  border-radius: 5px;
}

footer {
  margin-top: 20px;
  text-align: center;
  color: #777;
}

main {
  margin-top: 20px;
}

/* Estilo do conteúdo da página */
h1 {
  font-size: 2em;
  margin: 0;
}

p {
  font-size: 1em;
  margin: 10px 0;
}
</style>
