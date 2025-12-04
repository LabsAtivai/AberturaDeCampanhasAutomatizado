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
  background: var(--ativa-black);
  color: var(--ativa-white);
  border-radius: 10px;
  overflow: hidden;
  font-size: 13px;
}

th,
td {
  padding: 10px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  text-align: left;
}

th {
  background-color: var(--ativa-orange);
  color: var(--ativa-white);
  font-weight: 600;
}

tbody tr:nth-child(even) {
  background-color: rgba(255, 255, 255, 0.02);
}
</style>

