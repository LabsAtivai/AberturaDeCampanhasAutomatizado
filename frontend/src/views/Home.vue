<template>
  <div class="page-wrapper">
    <main class="main-content card">
      <EmailForm />
    </main>
  </div>
</template>

<script>
import EmailForm from '../components/EmailForm.vue';

export default {
  name: 'Home',
  components: {
    EmailForm
  }
};
</script>

<style scoped>
.page-wrapper {
  display: flex;
  justify-content: center;
  padding: 24px;
}

.main-content {
  width: 100%;
  max-width: 600px;
}
</style>
