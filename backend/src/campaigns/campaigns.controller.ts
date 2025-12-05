// ... outras funções ...

async getEmailsOpenedFast(
  accessToken: string,
  campaigns: Array<{id: string, name: string}>,
  startDate: string, // RECEBE DO CONTROLLER
  endDate: string,   // RECEBE DO CONTROLLER
) {
  console.log(`🚀 Processando ${campaigns.length} campanhas em paralelo...`);
  console.log(`📅 Período: ${startDate} a ${endDate}`);
  
  const start = this.parseBrDate(startDate);
  const end = this.parseBrDate(endDate);
  
  // Processa até 10 campanhas por lote
  const BATCH_SIZE = 10;
  const allData: any[] = [];
  
  for (let i = 0; i < campaigns.length; i += BATCH_SIZE) {
    const batch = campaigns.slice(i, i + BATCH_SIZE);
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(campaigns.length / BATCH_SIZE);
    
    console.log(`📦 Lote ${batchNumber}/${totalBatches} (${batch.length} campanhas)`);
    
    const promises = batch.map(campaign => 
      this.getSingleCampaignEmails(accessToken, campaign, start, end)
    );
    
    const batchResults = await Promise.all(promises);
    allData.push(...batchResults.flat());
    
    // Pequena pausa entre lotes
    if (i + BATCH_SIZE < campaigns.length) {
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
  
  console.log(`✅ Total de aberturas: ${allData.length}`);
  return allData;
}

private async getSingleCampaignEmails(
  accessToken: string,
  campaign: {id: string, name: string},
  start: Date, // JÁ CONVERTIDO
  end: Date    // JÁ CONVERTIDO
) {
  const url = 'https://api.snov.io/v1/get-emails-opened';
  
  try {
    const { data } = await axios.get(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { campaignId: campaign.id },
      timeout: 10000,
    });

    if (!Array.isArray(data)) return [];

    return data
      .filter((item: any) => {
        const visitedAt = new Date(item.visitedAt);
        return visitedAt >= start && visitedAt <= end;
      })
      .map((item: any) => {
        const visitedDate = new Date(item.visitedAt);
        const day = String(visitedDate.getDate()).padStart(2, '0');
        const month = String(visitedDate.getMonth() + 1).padStart(2, '0');
        const year = visitedDate.getFullYear();
        const formattedDate = `${day}-${month}-${year}`;

        return {
          campaignId: campaign.id,
          campaign: campaign.name || 'N/A',
          prospectEmail: item.prospectEmail || '',
          sourcePage: item.sourcePage || '',
          visitedAt: formattedDate,
        };
      });
  } catch (err: any) {
    console.error(`❌ Campanha ${campaign.id}:`, err.message);
    return [];
  }
}

// Função original mantida para compatibilidade
async getEmailsOpened(
  accessToken: string,
  campaignId: string,
  campaignName: string,
  startDate: string, // RECEBE DO CALLER
  endDate: string,   // RECEBE DO CALLER
) {
  const url = 'https://api.snov.io/v1/get-emails-opened';
  try {
    const { data } = await axios.get(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { campaignId },
    });

    if (!Array.isArray(data)) return [];

    const start = this.parseBrDate(startDate);
    const end = this.parseBrDate(endDate);

    return data
      .filter((item: any) => {
        const visitedAt = new Date(item.visitedAt);
        return visitedAt >= start && visitedAt <= end;
      })
      .map((item: any) => {
        const visitedDate = new Date(item.visitedAt);
        const day = String(visitedDate.getDate()).padStart(2, '0');
        const month = String(visitedDate.getMonth() + 1).padStart(2, '0');
        const year = visitedDate.getFullYear();
        const formattedDate = `${day}-${month}-${year}`;

        return {
          campaignId,
          campaign: campaignName || 'N/A',
          prospectEmail: item.prospectEmail || '',
          sourcePage: item.sourcePage || '',
          visitedAt: formattedDate,
        };
      });
  } catch (err: any) {
    console.error('Erro ao obter aberturas:', err.message || err);
    throw new Error('Falha ao obter aberturas');
  }
}
