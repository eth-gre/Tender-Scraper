// Content script for tender search pages
console.log('Supertender: Search page script loaded');

let isExtracting = false;
let lastExtractedCount = 0;

function extractSearchData() {
  if (isExtracting) {
    console.log('Already extracting, skipping...');
    return;
  }
  
  isExtracting = true;
  console.log('Starting search data extraction...');

  try {
    const tbody = document.querySelector('tbody');
    if (!tbody) {
      console.log('No tbody found on search page');
      isExtracting = false;
      return;
    }

    const tenderRows = tbody.querySelectorAll('tr');
    console.log(`Found ${tenderRows.length} tender rows`);

    if (tenderRows.length === lastExtractedCount && lastExtractedCount > 0) {
      console.log('Same number of rows as last extraction, skipping...');
      isExtracting = false;
      return;
    }

    let successCount = 0;
    let errorCount = 0;

    tenderRows.forEach((row, index) => {
      try {
        const data = {};

        // Contract ID - try multiple selectors
        let contractIdEl = row.querySelector('td.tender-code-state > span > b');
        if (!contractIdEl) {
          contractIdEl = row.querySelector('td.tender-code-state b');
        }
        if (!contractIdEl) {
          contractIdEl = row.querySelector('.tender-code-state b');
        }
        
        if (contractIdEl) {
          data.contract_id = contractIdEl.textContent.trim();
        }

        // Skip if no contract ID
        if (!data.contract_id) {
          console.log(`Row ${index}: No contract ID found, trying alternative selectors...`);
          
          // Try to find any bold text in the row that looks like a contract ID
          const boldElements = row.querySelectorAll('b, strong');
          for (const bold of boldElements) {
            const text = bold.textContent.trim();
            if (text.match(/^[A-Z0-9\-\/]+$/)) {
              data.contract_id = text;
              console.log(`Row ${index}: Found contract ID via alternative method: ${text}`);
              break;
            }
          }
          
          if (!data.contract_id) {
            console.log(`Row ${index}: Still no contract ID found, skipping`);
            errorCount++;
            return;
          }
        }

        // Title and Link
        const titleEl = row.querySelector('.strong.tenderRowTitle');
        if (!titleEl) {
          // Try alternative selectors
          const altTitleEl = row.querySelector('a[href*="/tender/view"], .tenderRowTitle, .tender-title');
          if (altTitleEl) {
            data.title = altTitleEl.textContent.trim();
            data.link = altTitleEl.getAttribute('href');
          }
        } else {
          data.title = titleEl.textContent.trim();
          data.link = titleEl.getAttribute('href');
        }
        
        if (data.link && !data.link.startsWith('http')) {
          data.link = 'https://www.tenders.vic.gov.au' + data.link;
        }

        // Status - try multiple selectors
        let statusEl = row.querySelector('td.tender-code-state span.tender-row-state');
        if (!statusEl) {
          statusEl = row.querySelector('.tender-row-state, .tender-status, .status');
        }
        if (statusEl) {
          data.status = statusEl.textContent.trim();
        }

        // Body name (first line-item-detail)
        const bodyEl = row.querySelector('.line-item-detail');
        if (bodyEl) {
          data.body_name = bodyEl.textContent.trim();
        }

        // Categories (all line-item-detail after first)
        const categoryEls = row.querySelectorAll('.line-item-detail');
        if (categoryEls.length > 1) {
          const categories = [];
          for (let i = 1; i < categoryEls.length; i++) {
            const categoryText = categoryEls[i].textContent.trim();
            if (categoryText) {
              categories.push(categoryText);
            }
          }
          if (categories.length > 0) {
            data.categories = categories;
          }
        }

        // Dates - try multiple selectors
        let dateContainer = row.querySelector('td.tender-date');
        if (!dateContainer) {
          dateContainer = row.querySelector('.tender-date, .dates');
        }
        
        if (dateContainer) {
          const openedEl = dateContainer.querySelector('span.opening_date, .opening_date, .opened');
          if (openedEl) {
            data.opened_at = openedEl.textContent.trim();
          }

          const closedEl = dateContainer.querySelector('span.closing_date, .closing_date, .closed');
          if (closedEl) {
            data.closed_at = closedEl.textContent.trim();
          }
        }

        // Add metadata
        data.last_updated = new Date().toISOString();
        data.source_page = 'search';

        console.log(`Row ${index}: Extracted search data for ${data.contract_id}:`, data);

        // Send to background script with error handling
        chrome.runtime.sendMessage({
          type: 'STORE_TENDER_DATA',
          data: data
        }).then(() => {
          console.log(`Successfully sent data for ${data.contract_id} to background`);
          successCount++;
        }).catch(error => {
          console.error(`Failed to send data for ${data.contract_id}:`, error);
          errorCount++;
        });

      } catch (error) {
        console.error(`Error extracting data from row ${index}:`, error);
        errorCount++;
      }
    });

    lastExtractedCount = tenderRows.length;
    console.log(`Search extraction completed: ${successCount} successful, ${errorCount} errors`);
    
  } catch (error) {
    console.error('Error in extractSearchData:', error);
  } finally {
    isExtracting = false;
  }
}

// Extract data when page loads with longer delay
setTimeout(() => {
  console.log('Initial search data extraction...');
  extractSearchData();
}, 2000);

// Also extract when DOM changes (for dynamic content)
const observer = new MutationObserver((mutations) => {
  let shouldExtract = false;
  mutations.forEach(mutation => {
    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
      // Check if new rows were added
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.tagName === 'TR' || node.querySelector('tr')) {
            shouldExtract = true;
            break;
          }
        }
      }
    }
  });
  
  if (shouldExtract && !isExtracting) {
    console.log('DOM changes detected, extracting search data...');
    setTimeout(extractSearchData, 1000);
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});

// Periodic extraction every 10 seconds to catch any missed updates
// setInterval(() => {
//   if (!isExtracting) {
//     console.log('Periodic search data extraction...');
//     extractSearchData();
//   }
// }, 10000);