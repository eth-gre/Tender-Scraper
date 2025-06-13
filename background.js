// Background service worker for Supertender extension

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message);
  
  if (message.type === 'STORE_TENDER_DATA') {
    storeTenderData(message.data);
  } else if (message.type === 'GET_ALL_DATA') {
    getAllTenderData().then(data => sendResponse(data));
    return true; // Keep message channel open for async response
  }
});

// Store tender data, merging with existing data for the same contract_id
async function storeTenderData(newData) {
  try {
    const { contract_id } = newData;
    if (!contract_id) {
      console.error('No contract_id provided for tender data:', newData);
      return;
    }

    // Clean the contract_id to ensure consistency
    const cleanContractId = contract_id.trim();
    if (!cleanContractId) {
      console.error('Empty contract_id after trimming:', contract_id);
      return;
    }

    console.log(`Attempting to store data for contract: "${cleanContractId}"`);

    // Get existing data with retry mechanism
    let existingData = {};
    let retries = 3;
    
    while (retries > 0) {
      try {
        const result = await chrome.storage.local.get(['tenderData']);
        existingData = result.tenderData || {};
        break;
      } catch (error) {
        console.warn(`Storage read attempt failed, retries left: ${retries - 1}`, error);
        retries--;
        if (retries === 0) throw error;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    // Merge new data with existing data for this contract_id
    const existing = existingData[cleanContractId] || {};
    
    // Deep merge arrays properly (especially suppliers)
    const merged = { ...existing, ...newData, contract_id: cleanContractId };
    
    // Handle suppliers array merging specially
    if (existing.suppliers && newData.suppliers) {
      merged.suppliers = [...existing.suppliers, ...newData.suppliers];
      // Remove duplicates based on supplier_name
      const uniqueSuppliers = merged.suppliers.filter((supplier, index, self) => 
        index === self.findIndex(s => s.supplier_name === supplier.supplier_name)
      );
      merged.suppliers = uniqueSuppliers;
    }
    
    // Handle categories array merging
    if (existing.categories && newData.categories) {
      merged.categories = [...new Set([...existing.categories, ...newData.categories])];
    }
    
    // Store updated data with retry mechanism
    existingData[cleanContractId] = merged;
    
    retries = 3;
    while (retries > 0) {
      try {
        await chrome.storage.local.set({ tenderData: existingData });
        console.log(`Successfully stored/updated tender data for contract ${cleanContractId}:`, merged);
        break;
      } catch (error) {
        console.warn(`Storage write attempt failed, retries left: ${retries - 1}`, error);
        retries--;
        if (retries === 0) throw error;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    // Verify the data was stored
    setTimeout(async () => {
      try {
        const verification = await chrome.storage.local.get(['tenderData']);
        const storedData = verification.tenderData || {};
        if (!storedData[cleanContractId]) {
          console.error(`Data verification failed for contract ${cleanContractId}!`);
        } else {
          console.log(`Data verification successful for contract ${cleanContractId}`);
        }
      } catch (error) {
        console.error('Data verification error:', error);
      }
    }, 500);
    
    // Notify popup if it's open
    chrome.runtime.sendMessage({
      type: 'DATA_UPDATED',
      contract_id: cleanContractId,
      data: merged
    }).catch(() => {
      // Popup might not be open, ignore error
    });
  } catch (error) {
    console.error('Error storing tender data:', error);
  }
}

// Get all stored tender data
async function getAllTenderData() {
  try {
    const result = await chrome.storage.local.get(['tenderData']);
    return result.tenderData || {};
  } catch (error) {
    console.error('Error getting tender data:', error);
    return {};
  }
}

// Clear all stored data (for debugging)
async function clearAllData() {
  try {
    await chrome.storage.local.clear();
    console.log('All tender data cleared');
  } catch (error) {
    console.error('Error clearing data:', error);
  }
}