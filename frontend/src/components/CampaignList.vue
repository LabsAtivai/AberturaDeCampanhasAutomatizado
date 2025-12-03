<template>
  <div v-if="campaigns.length">
    <h3>Campanhas Abertas</h3>
    <table>
      <thead>
        <tr>
          <th>Campanha</th>
          <th>Email Prospect</th>
          <th>Data de Abertura</th>
          <th>Fonte</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="campaign in campaigns" :key="campaign.prospectEmail">
          <td>{{ campaign.campaign }}</td>
          <td>{{ campaign.prospectEmail }}</td>
          <td>{{ campaign.visitedAt }}</td>
          <td>{{ campaign.sourcePage }}</td>
        </tr>
      </tbody>
    </table>
  </div>
  <div v-else>
    <p>Nenhuma campanha encontrada.</p>
  </div>
</template>

<script>
export default {
  props: {
    campaigns: Array
  }
};
</script>

<style scoped>
table {
  width: 100%;
  border-collapse: collapse;
}

th, td {
  padding: 10px;
  border: 1px solid #ddd;
  text-align: left;
}

th {
  background-color: #42b983;
  color: white;
}
</style>
