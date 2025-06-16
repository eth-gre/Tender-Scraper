// Popup script for Supertender extension
console.log('Supertender popup loaded');

let allTenderData = {};

// DOM elements
const totalTendersEl = document.getElementById('totalTenders');
const openTendersEl = document.getElementById('openTenders');
const closedTendersEl = document.getElementById('closedTenders');
const refreshBtn = document.getElementById('refreshBtn');
const exportCSVBtn = document.getElementById('exportCSVBtn');
const exportJSONBtn = document.getElementById('exportJSONBtn');
const clearDataBtn = document.getElementById('clearDataBtn');
const openTenderLinksBtn = document.getElementById('openTenderLinksBtn');
const currentUrlEl = document.getElementById('currentUrl');
const lastUpdatedEl = document.getElementById('lastUpdated');
const storageSizeEl = document.getElementById('storageSize');
const recentTendersEl = document.getElementById('recentTenders');
const statusMessageEl = document.getElementById('statusMessage');

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
	await loadTenderData();
	updateCurrentUrl();
	setupEventListeners();
});

// Load all tender data
async function loadTenderData() {
	try {
		statusMessageEl.textContent = 'Loading data...';
		const response = await chrome.runtime.sendMessage({ type: 'GET_ALL_DATA' });
		allTenderData = response || {};
		
		// Also check storage directly as backup
		if (Object.keys(allTenderData).length === 0) {
			console.log('No data from background, checking storage directly...');
			const result = await chrome.storage.local.get(['tenderData']);
			allTenderData = result.tenderData || {};
			console.log('Direct storage check result:', allTenderData);
		}
		
		updateUI();
		console.log('Loaded tender data:', allTenderData);
		
		// Periodic refresh to catch any storage changes
		setTimeout(loadTenderData, 30000); // Refresh every 30 seconds
		
	} catch (error) {
		console.error('Error loading tender data:', error);
		statusMessageEl.textContent = 'Error loading data';
		
		// Try direct storage access as fallback
		try {
			const result = await chrome.storage.local.get(['tenderData']);
			allTenderData = result.tenderData || {};
			updateUI();
			console.log('Fallback storage access successful:', allTenderData);
		} catch (fallbackError) {
			console.error('Fallback storage access failed:', fallbackError);
		}
	}
}

// Update UI with current data
function updateUI() {
	const tenders = Object.values(allTenderData);
	const totalCount = tenders.length;
	
	// Count by status
	let openCount = 0;
	let closedCount = 0;
	
	tenders.forEach(tender => {
		const status = (tender.status || '').toLowerCase();
		if (status.includes('open') || status.includes('current')) {
			openCount++;
		} else if (status.includes('closed') || status.includes('awarded')) {
			closedCount++;
		}
	});

	// Update stats
	totalTendersEl.textContent = totalCount;
	openTendersEl.textContent = openCount;
	closedTendersEl.textContent = closedCount;

	// Update debug info
	updateDebugInfo();
	
	// Update recent tenders list
	updateRecentTenders(tenders);
	
	// Update open tender links button
	updateOpenTenderLinksButton(tenders);
	
	// Update status
	if (totalCount > 0) {
		statusMessageEl.textContent = `${totalCount} tenders in storage`;
	} else {
		statusMessageEl.textContent = 'No data collected yet';
	}
}

// Update debug information
function updateDebugInfo() {
	const tenders = Object.values(allTenderData);
	
	// Find most recent update
	let mostRecent = null;
	tenders.forEach(tender => {
		if (tender.last_updated) {
			const date = new Date(tender.last_updated);
			if (!mostRecent || date > mostRecent) {
				mostRecent = date;
			}
		}
	});
	
	if (mostRecent) {
		lastUpdatedEl.textContent = mostRecent.toLocaleString();
	} else {
		lastUpdatedEl.textContent = 'Never';
	}
	
	// Calculate storage size
	const dataSize = JSON.stringify(allTenderData).length;
	const sizeKB = Math.round(dataSize / 1024 * 100) / 100;
	storageSizeEl.textContent = `${sizeKB} KB`;
	
	// Update storage items count
	const storageItemsEl = document.getElementById('storageItems');
	if (storageItemsEl) {
		storageItemsEl.textContent = Object.keys(allTenderData).length;
	}
}

// Update open tender links button state
function updateOpenTenderLinksButton(tenders) {
	const unscrapedTenders = tenders.filter(tender => 
		tender.link && !tender.tender && tender.search === true
	);
	
	if (openTenderLinksBtn) {
		const count = unscrapedTenders.length;
		const buttonText = count > 0 ? `Open ${Math.min(count, 10)} Tender Links` : 'No Tender Links to Open';
		openTenderLinksBtn.innerHTML = `
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
				<path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
			</svg>
			${buttonText}
		`;
		openTenderLinksBtn.disabled = count === 0;
		
		if (count === 0) {
			openTenderLinksBtn.classList.add('btn-disabled');
		} else {
			openTenderLinksBtn.classList.remove('btn-disabled');
		}
	}
}

// Update recent tenders list
function updateRecentTenders(tenders) {
	if (tenders.length === 0) {
		recentTendersEl.innerHTML = '<div class="empty-state">No tenders found. Visit tender pages to start collecting data.</div>';
		return;
	}

	// Sort by last updated (most recent first)
	const sortedTenders = tenders
		.filter(tender => tender.last_updated)
		.sort((a, b) => new Date(b.last_updated) - new Date(a.last_updated))
		.slice(0, 5); // Show only 5 most recent

	const html = sortedTenders.map(tender => {
		const status = (tender.status || 'unknown').toLowerCase();
		let statusClass = 'tender-status';
		
		if (status.includes('open') || status.includes('current')) {
			statusClass += ' status-open';
		} else if (status.includes('closed')) {
			statusClass += ' status-closed';
		} else if (status.includes('awarded')) {
			statusClass += ' status-awarded';
		}

		// Add scraping status indicators
		const scrapingStatus = [];
		if (tender.search) scrapingStatus.push('S');
		if (tender.tender) scrapingStatus.push('T');
		if (tender.contract) scrapingStatus.push('C');
		const scrapingIndicator = scrapingStatus.length > 0 ? ` [${scrapingStatus.join(',')}]` : ' [None]';

		return `
			<div class="tender-item">
				<div class="tender-title">${tender.title || tender.contract_id || 'Unknown Title'}</div>
				<div class="tender-meta">
					<span class="tender-id">${tender.contract_id || 'No ID'}</span>
					<span class="${statusClass}">${tender.status || 'Unknown'}</span>
				</div>
				<div class="tender-scraping-status">Scraped: ${scrapingIndicator}</div>
			</div>
		`;
	}).join('');

	recentTendersEl.innerHTML = html;
}

// Get current tab URL
async function updateCurrentUrl() {
	try {
		const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
		if (tab && tab.url) {
			const url = new URL(tab.url);
			currentUrlEl.textContent = url.hostname + url.pathname;
		} else {
			currentUrlEl.textContent = 'Unknown';
		}
	} catch (error) {
		console.error('Error getting current URL:', error);
		currentUrlEl.textContent = 'Error';
	}
}

// Open tender links in new tabs
async function openTenderLinks() {
	const tenders = Object.values(allTenderData);
	const unscrapedTenders = tenders.filter(tender => 
		tender.link && !tender.tender && tender.search === true
	);
	
	if (unscrapedTenders.length === 0) {
		statusMessageEl.textContent = 'No tender links to open';
		return;
	}
	
	// Take up to 10 tenders
	const tendersToOpen = unscrapedTenders.slice(0, 10);
	
	try {
		// Open each link in a new tab
		for (const tender of tendersToOpen) {
			await chrome.tabs.create({ url: tender.link, active: false });
		}
		
		statusMessageEl.textContent = `Opened ${tendersToOpen.length} tender links in new tabs`;
		
		// Update button state
		updateOpenTenderLinksButton(tenders);
		
	} catch (error) {
		console.error('Error opening tender links:', error);
		statusMessageEl.textContent = 'Error opening tender links';
	}
}

// Setup event listeners
function setupEventListeners() {
    // Check if elements exist before adding listeners
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            refreshBtn.classList.add('loading');
            refreshBtn.textContent = 'Refreshing...';
            
            await loadTenderData();
            
            setTimeout(() => {
                refreshBtn.classList.remove('loading');
                refreshBtn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M1 4v6h6m16-6v6h-6m-5 10a9 9 0 110-18 9 9 0 010 18z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    Refresh Data
                `;
            }, 500);
        });
    }

    if (exportCSVBtn) {
        exportCSVBtn.addEventListener('click', async () => {
            try {
                exportToCSV();
            } catch (error) {
                console.error('CSV export error:', error);
                statusMessageEl.textContent = `CSV export failed: ${error.message}`;
            }
        });
    }

    if (exportJSONBtn) {
        exportJSONBtn.addEventListener('click', async () => {
            try {
                exportToJSON();
            } catch (error) {
                console.error('JSON export error:', error);
                statusMessageEl.textContent = `JSON export failed: ${error.message}`;
            }
        });
    }
    
    if (openTenderLinksBtn) {
        openTenderLinksBtn.addEventListener('click', openTenderLinks);
    }
    
    if (clearDataBtn) {
        clearDataBtn.addEventListener('click', async () => {
            if (confirm('Are you sure you want to clear all stored tender data? This cannot be undone.')) {
                try {
                    await chrome.storage.local.clear();
                    allTenderData = {};
                    updateUI();
                    statusMessageEl.textContent = 'All data cleared';
                } catch (error) {
                    console.error('Error clearing data:', error);
                    statusMessageEl.textContent = 'Error clearing data';
                }
            }
        });
    }
    
    const testStorageBtn = document.getElementById('testStorageBtn');
    if (testStorageBtn) {
        testStorageBtn.addEventListener('click', async () => {
            try {
                const testData = { test: 'data', timestamp: Date.now() };
                
                await chrome.storage.local.set({ storageTest: testData });
                console.log('Storage write test successful');
                
                const result = await chrome.storage.local.get(['storageTest']);
                if (result.storageTest && result.storageTest.test === 'data') {
                    console.log('Storage read test successful');
                    statusMessageEl.textContent = 'Storage test passed';
                    await chrome.storage.local.remove(['storageTest']);
                } else {
                    throw new Error('Storage read test failed');
                }
                
            } catch (error) {
                console.error('Storage test failed:', error);
                statusMessageEl.textContent = 'Storage test failed';
            }
        });
    }
}

// Another way to export data
function exportToJSON() {
	const tenders = Object.values(allTenderData);
	
	if (tenders.length === 0) {
		alert('No data to export');
		return;
	}

	// Create JSON content with proper formatting
	const jsonData = {
		export_info: {
			exported_at: new Date().toISOString(),
			total_records: tenders.length,
			extension: 'Supertender',
			version: '1.0'
		},
		tenders: tenders
	};

	const jsonContent = JSON.stringify(jsonData, null, 2);

	// Download JSON file
	const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
	const link = document.createElement('a');
	const url = URL.createObjectURL(blob);
	
	link.setAttribute('href', url);
	link.setAttribute('download', `supertender-export-${new Date().toISOString().split('T')[0]}.json`);
	link.style.visibility = 'hidden';
	
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	
	statusMessageEl.textContent = `Exported ${tenders.length} tenders to JSON`;
}

// Export data to CSV
function exportToCSV() {
	const tenders = Object.values(allTenderData);
	
	if (tenders.length === 0) {
		alert('No data to export');
		return;
	}

	// Define CSV headers
	const headers = [
		'contract_id', 'title', 'description', 'type', 'status', 'body_name', 'categories',
		'opened_at', 'closed_at', 'started_at', 'expired_at', 'contract_value',
		'number_of_submissions', 'comment', 'reason', 'contact_name',
		'suppliers', 'link', 'last_updated', 'search', 'tender', 'contract'
	];

	// Convert data to CSV format
	const csvData = tenders.map(tender => {
		return headers.map(header => {
			let value = tender[header] || '';
			
			// Handle arrays and objects
			if (Array.isArray(value)) {
				if (header === 'suppliers') {
					value = value.map(s => `${s.supplier_name || 'Unknown'} (ABN: ${s.abn || 'N/A'}, ACN: ${s.acn || 'N/A'})`).join('; ');
				} else {
					value = value.join('; ');
				}
			} else if (typeof value === 'object') {
				value = JSON.stringify(value);
			}
			
			// Escape quotes and wrap in quotes if contains comma
			value = String(value).replace(/"/g, '""');
			if (value.includes(',') || value.includes('\n') || value.includes('"')) {
				value = `"${value}"`;
			}
			
			return value;
		});
	});

	// Create CSV content
	const csvContent = [
		headers.join(','),
		...csvData.map(row => row.join(','))
	].join('\n');

	// Download CSV file
	const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
	const link = document.createElement('a');
	const url = URL.createObjectURL(blob);
	
	link.setAttribute('href', url);
	link.setAttribute('download', `supertender-export-${new Date().toISOString().split('T')[0]}.csv`);
	link.style.visibility = 'hidden';
	
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	
	statusMessageEl.textContent = `Exported ${tenders.length} tenders to CSV`;
}

// Listen for data updates from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message.type === 'DATA_UPDATED') {
		console.log('Data updated for contract:', message.contract_id);
		allTenderData[message.contract_id] = message.data;
		updateUI();
	}
});