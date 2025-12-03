import { createStore } from 'vuex';

export default createStore({
  state: {
    campaigns: []
  },
  mutations: {
    setCampaigns(state, campaigns) {
      state.campaigns = campaigns;
    }
  },
  actions: {
    async fetchCampaigns({ commit }, payload) {
      const response = await axios.post('/api/campaigns', payload);
      commit('setCampaigns', response.data.campaigns);
    }
  }
});
