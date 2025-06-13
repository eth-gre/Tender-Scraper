// Content script for tender detail pages
console.log('Supertender: Tender page script loaded');

function extractTenderData() {
  try {
    const data = {};

    // Contract ID from page title
    const pageTitleEl = document.querySelector('[name="page-title"]');
    if (pageTitleEl) {
      const titleText = pageTitleEl.textContent.trim();
      if (titleText.startsWith('Display Tender ')) {
        data.contract_id = titleText.replace('Display Tender ', '').trim();
      }
    }

    // Skip if no contract ID
    if (!data.contract_id) {
      console.log('No contract ID found on tender page');
      return;
    }

    // Description
    const descEl = document.querySelector('#tenderDescription p');
    if (descEl) {
      data.description = descEl.textContent.trim();
    }

    // Contact information
    const contactNameEl = document.querySelector('div.otherContact li');
    if (contactNameEl) {
      data.contact_name = contactNameEl.textContent.trim();
    }

    const contactEmailEl = document.querySelector('div.otherContact a');
    if (contactEmailEl) {
      data.contact_email = contactEmailEl.textContent.trim();
    }

    // Add metadata
    data.last_updated = new Date().toISOString();
    data.source_page = 'tender';

    console.log(`Extracted tender data for ${data.contract_id}:`, data);

    // Send to background script
    chrome.runtime.sendMessage({
      type: 'STORE_TENDER_DATA',
      data: data
    });

  } catch (error) {
    console.error('Error extracting tender data:', error);
  }
}

// Extract data when page loads
setTimeout(extractTenderData, 1000);

// Also extract when DOM changes
// const observer = new MutationObserver((mutations) => {
//   let shouldExtract = false;
//   mutations.forEach(mutation => {
//     if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
//       shouldExtract = true;
//     }
//   });
  
//   if (shouldExtract) {
//     setTimeout(extractTenderData, 500);
//   }
// });

observer.observe(document.body, {
  childList: true,
  subtree: true
});