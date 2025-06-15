// Content script for tender search pages
console.log('Supertender: Search page script loaded');

let isExtracting = false;
let lastExtractedCount = 0;
let extractionAttempts = 0;
const MAX_EXTRACTION_ATTEMPTS = 3;

// Queue for storing data to prevent overwhelming the background script
let dataQueue = [];
let isProcessingQueue = false;

async function processDataQueue() {
	if (isProcessingQueue || dataQueue.length === 0) {
		return;
	}
	
	isProcessingQueue = true;
	console.log(`Processing data queue with ${dataQueue.length} items`);
	
	const results = [];
	
	while (dataQueue.length > 0) {
		const data = dataQueue.shift();
		try {
			const response = await sendToBackground(data);
			results.push({ contract_id: data.contract_id, success: true, response });
			
			// Small delay between items to prevent overwhelming
			await new Promise(resolve => setTimeout(resolve, 50));
		} catch (error) {
			console.error(`Failed to process ${data.contract_id}:`, error);
			results.push({ contract_id: data.contract_id, success: false, error: error.message });
		}
	}
	
	isProcessingQueue = false;
	console.log(`Queue processing completed. Results:`, results);
	
	// Verify a few random items were actually stored
	await verifyRandomSamples(results.filter(r => r.success));
}

async function sendToBackground(data) {
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			reject(new Error('Background script timeout'));
		}, 10000); // 10 second timeout
		
		chrome.runtime.sendMessage({
			type: 'STORE_TENDER_DATA',
			data: data
		}).then(response => {
			clearTimeout(timeout);
			resolve(response);
		}).catch(error => {
			clearTimeout(timeout);
			reject(error);
		});
	});
}

async function verifyRandomSamples(successfulResults) {
	if (successfulResults.length === 0) return;
	
	// Verify up to 3 random items
	const samplesToVerify = Math.min(3, successfulResults.length);
	const samples = successfulResults
		.sort(() => 0.5 - Math.random())
		.slice(0, samplesToVerify);
	
	console.log(`Verifying ${samples.length} random samples...`);
	
	for (const sample of samples) {
		try {
			const response = await new Promise((resolve, reject) => {
				const timeout = setTimeout(() => reject(new Error('Verification timeout')), 5000);
				
				chrome.runtime.sendMessage({
					type: 'VERIFY_STORAGE',
					contract_id: sample.contract_id
				}).then(result => {
					clearTimeout(timeout);
					resolve(result);
				}).catch(error => {
					clearTimeout(timeout);
					reject(error);
				});
			});
			
			if (response.success) {
				console.log(`✓ Verification successful for ${sample.contract_id}`);
			} else {
				console.error(`✗ Verification failed for ${sample.contract_id}:`, response);
			}
		} catch (error) {
			console.error(`Verification error for ${sample.contract_id}:`, error);
		}
	}
}

function extractSearchData() {
	if (isExtracting) {
		console.log('Already extracting, skipping...');
		return;
	}
	
	extractionAttempts++;
	if (extractionAttempts > MAX_EXTRACTION_ATTEMPTS) {
		console.log('Max extraction attempts reached, stopping');
		return;
	}
	
	isExtracting = true;
	console.log(`Starting search data extraction (attempt ${extractionAttempts})...`);

	try {
		const tbody = document.querySelector('tbody');
		if (!tbody) {
			console.log('No tbody found on search page');
			isExtracting = false;
			return;
		}

		const tenderRows = tbody.querySelectorAll('tr');
		console.log(`Found ${tenderRows.length} tender rows`);

		if (tenderRows.length === 0) {
			console.log('No tender rows found');
			isExtracting = false;
			return;
		}

		if (tenderRows.length === lastExtractedCount && lastExtractedCount > 0) {
			console.log('Same number of rows as last extraction, skipping...');
			isExtracting = false;
			return;
		}

		let successCount = 0;
		let errorCount = 0;
		const extractedData = [];

		tenderRows.forEach((row, index) => {
			try {
				const data = extractRowData(row, index);
				if (data && data.contract_id) {
					extractedData.push(data);
					successCount++;
				} else {
					console.log(`Row ${index}: No valid data extracted`);
					errorCount++;
				}
			} catch (error) {
				console.error(`Error extracting data from row ${index}:`, error);
				errorCount++;
			}
		});

		// Add all extracted data to queue
		dataQueue.push(...extractedData);
		
		lastExtractedCount = tenderRows.length;
		console.log(`Search extraction completed: ${successCount} successful, ${errorCount} errors. Queue now has ${dataQueue.length} items.`);
		
		// Process the queue
		processDataQueue();
		
	} catch (error) {
		console.error('Error in extractSearchData:', error);
	} finally {
		isExtracting = false;
	}
}

function extractRowData(row, index) {
	const data = {};

	// Contract ID - try multiple selectors with more robust fallbacks
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

	// Skip if no contract ID found - try alternative methods
	if (!data.contract_id) {
		console.log(`Row ${index}: No contract ID found, trying alternative selectors...`);
		
		// Try to find any bold text in the row that looks like a contract ID
		const boldElements = row.querySelectorAll('b, strong');
		for (const bold of boldElements) {
			const text = bold.textContent.trim();
			// More flexible contract ID pattern
			if (text && (text.match(/^[A-Z0-9\-\/\.]{3,}$/) || text.match(/^\d{4,}/))) {
				data.contract_id = text;
				console.log(`Row ${index}: Found contract ID via alternative method: ${text}`);
				break;
			}
		}
		
		// Last resort - try to find any numeric or alphanumeric identifier
		if (!data.contract_id) {
			const allText = row.textContent;
			const matches = allText.match(/\b([A-Z0-9\-\/\.]{5,}|\d{4,})\b/g);
			if (matches && matches.length > 0) {
				data.contract_id = matches[0];
				console.log(`Row ${index}: Found potential contract ID via text matching: ${matches[0]}`);
			}
		}
		
		if (!data.contract_id) {
			console.log(`Row ${index}: Still no contract ID found, skipping`);
			return null;
		}
	}

	// Validate contract ID
	if (!data.contract_id || data.contract_id.length < 3) {
		console.log(`Row ${index}: Contract ID too short or invalid: "${data.contract_id}"`);
		return null;
	}

	// Title and Link
	const titleEl = row.querySelector('.strong.tenderRowTitle, .tenderRowTitle, a[href*="/tender/view"], .tender-title');
	if (titleEl) {
		data.title = titleEl.textContent.trim();
		data.link = titleEl.getAttribute('href');
		
		if (data.link && !data.link.startsWith('http')) {
			data.link = 'https://www.tenders.vic.gov.au' + data.link;
		}
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
			if (categoryText && categoryText.length > 0) {
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
	data.extraction_attempt = extractionAttempts;
	data.row_index = index;

	console.log(`Row ${index}: Extracted search data for ${data.contract_id}:`, {
		contract_id: data.contract_id,
		title: data.title ? data.title.substring(0, 50) + '...' : 'N/A',
		status: data.status,
		body_name: data.body_name,
		categories_count: data.categories ? data.categories.length : 0
	});

	return data;
}

// Extract data when page loads with progressive delays
setTimeout(() => {
	console.log('Initial search data extraction (2s delay)...');
	extractSearchData();
}, 2000);

// Additional extraction after longer delay in case content loads slowly
setTimeout(() => {
	console.log('Secondary search data extraction (5s delay)...');
	extractSearchData();
}, 5000);

// DOM change observer with debouncing
let observerTimeout;
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
		// Debounce the extraction
		clearTimeout(observerTimeout);
		observerTimeout = setTimeout(() => {
			console.log('DOM changes detected, extracting search data...');
			extractSearchData();
		}, 1000);
	}
});

observer.observe(document.body, {
	childList: true,
	subtree: true
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
	console.log(`Page unloading. Final queue size: ${dataQueue.length}`);
	if (dataQueue.length > 0) {
		console.warn('Data queue not empty on page unload - some data may be lost');
	}
});

// Debug function to check current state
window.debugSupertender = () => {
	console.log('Supertender Debug Info:', {
		isExtracting,
		lastExtractedCount,
		extractionAttempts,
		queueSize: dataQueue.length,
		isProcessingQueue
	});
};