import { createRouter, createWebHistory } from 'vue-router';
import Home from '../views/Home.vue';  // Página inicial
import CampaignsPage from '../views/CampaignsPage.vue'; // Página de campanhas

const routes = [
  {
    path: '/',
    name: 'Home',
    component: Home,  // Página inicial que exibe EmailForm
  },
  {
    path: '/campaigns',
    name: 'Campaigns',
    component: CampaignsPage, // Página que exibe a lista de campanhas
  },
];

const router = createRouter({
  history: createWebHistory(process.env.BASE_URL),
  routes
});

export default router;
