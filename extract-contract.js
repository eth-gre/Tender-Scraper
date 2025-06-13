// Content script for contract detail pages
console.log('Supertender: Contract page script loaded');

function extractContractData() {
  try {
    const data = {};

    // Contract ID from page title
    const pageTitleEl = document.querySelector('[name="page-title"]');
    if (pageTitleEl) {
      const titleText = pageTitleEl.textContent.trim();
      if (titleText.startsWith('Contract - ')) {
        data.contract_id = titleText.replace('Contract - ', '').trim();
      }
    }

    // Skip if no contract ID
    if (!data.contract_id) {
      console.log('No contract ID found on contract page');
      return;
    }

    // Helper function to find value by label
    function findValueByLabel(labelText) {
      const rows = document.querySelectorAll('div.row');
      for (const row of rows) {
        const span = row.querySelector('span');
        if (span && span.textContent.includes(labelText)) {
          const valueEl = row.querySelector('div.col-sm-8');
          return valueEl ? valueEl.textContent.trim() : null;
        }
      }
      return null;
    }

    // Contract details
    data.contract_value = findValueByLabel('Total Value of the Contract');
    data.number_of_submissions = findValueByLabel('Number of Submissions');
    data.comment = findValueByLabel('Comments');
    data.reason = findValueByLabel('Reason');
    data.started_at = findValueByLabel('Starting Date');
    data.expired_at = findValueByLabel('Expiry Date');

    // Suppliers information
    const supplierTable = document.querySelector('.table.tablesaw.tablesaw-stack.table-responsive');
    if (supplierTable) {
      const supplierRows = supplierTable.querySelectorAll('tr');
      const suppliers = [];

      supplierRows.forEach(row => {
        const supplier = {};
        
        // Supplier name (from b tag)
        const nameEl = row.querySelector('b');
        if (nameEl) {
          supplier.supplier_name = nameEl.textContent.trim();
        }

        // ABN
        const abnCell = row.querySelector('td');
        const cells = row.querySelectorAll('td');
        for (const cell of cells) {
          const strongEl = cell.querySelector('strong');
          if (strongEl && strongEl.textContent.includes('ABN')) {
            supplier.abn = cell.textContent.replace(/ABN.*?:/i, '').trim();
          }
          if (strongEl && strongEl.textContent.includes('ACN')) {
            supplier.acn = cell.textContent.replace(/ACN.*?:/i, '').trim();
          }
        }

        // Only add if we found a supplier name
        if (supplier.supplier_name) {
          suppliers.push(supplier);
        }
      });

      if (suppliers.length > 0) {
        data.suppliers = suppliers;
      }
    }

    // Add metadata
    data.last_updated = new Date().toISOString();
    data.source_page = 'contract';

    console.log(`Extracted contract data for ${data.contract_id}:`, data);

    // Send to background script
    chrome.runtime.sendMessage({
      type: 'STORE_TENDER_DATA',
      data: data
    });

  } catch (error) {
    console.error('Error extracting contract data:', error);
  }
}

// Extract data when page loads
setTimeout(extractContractData, 1000);

// Also extract when DOM changes
// const observer = new MutationObserver((mutations) => {
//   let shouldExtract = false;
//   mutations.forEach(mutation => {
//     if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
//       shouldExtract = true;
//     }
//   });
  
//   if (shouldExtract) {
//     setTimeout(extractContractData, 500);
//   }
// });

observer.observe(document.body, {
  childList: true,
  subtree: true
});