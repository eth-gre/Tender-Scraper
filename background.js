// Background service worker for Supertender extension

// Keep service worker alive longer
let keepAliveInterval;

function keepServiceWorkerAlive() {
	if (keepAliveInterval) clearInterval(keepAliveInterval);
	keepAliveInterval = setInterval(() => {
		console.log('Service worker keepalive ping');
	}, 20000); // Ping every 20 seconds
}

// Start keepalive when service worker starts
keepServiceWorkerAlive();

// Storage queue to handle rapid successive calls
let storageQueue = Promise.resolve();
let pendingOperations = new Map();

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	console.log('Background received message:', message);
	
	if (message.type === 'STORE_TENDER_DATA') {
		// Queue the storage operation to prevent race conditions
		storageQueue = storageQueue.then(() => storeTenderData(message.data));
		sendResponse({ success: true }); // Immediate response
	} else if (message.type === 'GET_ALL_DATA') {
		getAllTenderData().then(data => sendResponse(data));
		return true; // Keep message channel open for async response
	} else if (message.type === 'VERIFY_STORAGE') {
		verifyStoredData(message.contract_id).then(result => sendResponse(result));
		return true;
	}
});

// Fields that should NOT be sanitized (keep original formatting)
const SANITIZATION_EXEMPT_FIELDS = [
  'description',
  'reason',
  'comments',
];

/**
 * Sanitizes text for standard fields: replaces all problematic whitespace and control chars,
 * collapses all whitespace (horizontal and vertical) to single spaces, and trims.
 * @param {string} text The input string.
 * @param {string} fieldKey Optional field key for special handling.
 * @returns {string} The sanitized string.
 */
function sanitizeSingleLine(text, fieldKey = null) {
  if (typeof text !== 'string') {
    return text; // Return non-strings as they are
  }
  
  let sanitized = text
    // Replace HTML non-breaking spaces and Unicode nbsp with a standard space
    .replace(/&nbsp;/g, ' ')
    .replace(/\u00A0/g, ' ');
  
  // Special handling for contact_name: replace control characters with spaces instead of removing them
  if (fieldKey === 'contact_name') {
    sanitized = sanitized
      // Replace control characters with spaces (they were likely acting as separators)
      .replace(/[\x00-\x1F\x7F-\x9F]/g, ' ')
      // Collapse multiple spaces into single spaces
      .replace(/\s+/g, ' ')
      // Remove leading/trailing whitespace
      .trim();
  } else {
    sanitized = sanitized
      // Remove ALL control characters including newlines, carriage returns, tabs
      .replace(/[\x00-\x1F\x7F-\x9F]/g, '')
      // Collapse all remaining whitespace into single spaces
      .replace(/\s+/g, ' ')
      // Remove leading/trailing whitespace
      .trim();
  }
  
  return sanitized;
}

/**
 * Sanitizes text for block fields (like descriptions): preserves newlines (limiting to 2),
 * replaces other problematic whitespace/tabs/nbsp with single spaces, removes control chars,
 * collapses multiple horizontal spaces, and trims.
 * @param {string} text The input string.
 * @returns {string} The sanitized string.
 */
function sanitizeMultiLine(text) {
  if (typeof text !== 'string') {
    return text; // Return non-strings as they are
  }
  
  let sanitized = text;
  
  // 1. Standardize line endings (\r\n or \r to \n)
  sanitized = sanitized.replace(/\r\n?/g, '\n');
  
  // 2. Remove control characters EXCEPT newlines (preserve \n for step 3)
  // This removes tabs, form feeds, vertical tabs, and other control chars
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '');
  
  // 3. Limit consecutive newlines to a maximum of two (\n\n)
  sanitized = sanitized.replace(/\n{3,}/g, '\n\n');
  
  // 4. Replace problematic horizontal whitespace and nbsp with single spaces
  // This handles remaining spaces, and any whitespace that might have been left
  sanitized = sanitized.replace(/[ \t\f\v\u00A0]+/g, ' ');
  
  // 5. Clean up spaces around newlines (remove trailing spaces on lines)
  sanitized = sanitized.replace(/ +\n/g, '\n');
  sanitized = sanitized.replace(/\n +/g, '\n');
  
  // 6. Remove leading/trailing whitespace
  sanitized = sanitized.trim();
  
  return sanitized;
}

/**
 * Sanitizes an object's fields recursively, applying different sanitization
 * based on the field key.
 * @param {any} data The data object or array to sanitize.
 * @param {string} parentKey The parent key context for array elements.
 * @returns {any} The sanitized data.
 */
function sanitizeData(data, parentKey = null) {
  // Base case: If not an object or is null, return as-is
  if (!data || typeof data !== 'object') {
    return data;
  }
  
  // Create a new object or array based on the input type
  const sanitized = Array.isArray(data) ? [] : {};
  
  // Iterate over keys/values
  for (const [key, value] of Object.entries(data)) {
    // Handle null explicitly to preserve it
    if (value === null) {
      sanitized[key] = null;
    }
    // Recursively sanitize arrays (elements might need sanitization too)
    else if (Array.isArray(value)) {
      // Map over array elements, passing the current key as parentKey
      // so that string elements know which field they belong to
      sanitized[key] = value.map(item => {
        if (typeof item === 'string') {
          // Apply sanitization based on the parent key (current key)
          if (SANITIZATION_EXEMPT_FIELDS.includes(key)) {
            return sanitizeMultiLine(item);
          } else {
            return sanitizeSingleLine(item, key); // Pass the key for special handling
          }
        } else {
          // For non-string array elements, recursively sanitize
          return sanitizeData(item, key);
        }
      });
    }
    // Recursively sanitize nested objects
    else if (typeof value === 'object') {
      sanitized[key] = sanitizeData(value);
    }
    // Sanitize string values based on exemption list
    else if (typeof value === 'string') {
      if (SANITIZATION_EXEMPT_FIELDS.includes(key)) {
        // Use multiline sanitizer for exempt fields
        sanitized[key] = sanitizeMultiLine(value);
      } else {
        // Use singleline sanitizer for other fields
        sanitized[key] = sanitizeSingleLine(value, key); // Pass the key for special handling
      }
    }
    // Keep other types (numbers, booleans, etc.) as-is
    else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

// Store tender data with better error handling and deduplication
async function storeTenderData(newData) {
	const startTime = Date.now();
	try {
		const { contract_id } = newData;
		if (!contract_id) {
			console.error('No contract_id provided for tender data:', newData);
			return { success: false, error: 'No contract_id' };
		}

		// Clean the contract_id to ensure consistency
		const cleanContractId = contract_id.trim();
		if (!cleanContractId) {
			console.error('Empty contract_id after trimming:', contract_id);
			return { success: false, error: 'Empty contract_id' };
		}

		// Sanitize the incoming data
		const sanitizedData = sanitizeData(newData);
		console.log(`[${startTime}] Storing sanitized data for contract: "${cleanContractId}"`);

		// Check if this operation is already in progress
		if (pendingOperations.has(cleanContractId)) {
			console.log(`Operation already pending for ${cleanContractId}, skipping duplicate`);
			return { success: false, error: 'Operation pending' };
		}

		pendingOperations.set(cleanContractId, true);

		try {
			// Get existing data with exponential backoff retry
			let existingData = {};
			let retries = 5;
			let delay = 100;
			
			while (retries > 0) {
				try {
					const result = await chrome.storage.local.get(['tenderData']);
					existingData = result.tenderData || {};
					console.log(`[${startTime}] Successfully read storage, found ${Object.keys(existingData).length} existing contracts`);
					break;
				} catch (error) {
					retries--;
					console.warn(`[${startTime}] Storage read failed, retries left: ${retries}`, error);
					if (retries === 0) throw error;
					await new Promise(resolve => setTimeout(resolve, delay));
					delay *= 2; // Exponential backoff
				}
			}
			
			// Merge sanitized data with existing data for this contract_id
			const existing = existingData[cleanContractId] || {};
			
			// Deep merge with careful handling of arrays
			const merged = { ...existing, ...sanitizedData, contract_id: cleanContractId };
			
			// Handle suppliers array merging specially
			if (existing.suppliers && sanitizedData.suppliers) {
				const existingSuppliers = Array.isArray(existing.suppliers) ? existing.suppliers : [];
				const newSuppliers = Array.isArray(sanitizedData.suppliers) ? sanitizedData.suppliers : [];
				
				const allSuppliers = [...existingSuppliers, ...newSuppliers];
				// Remove duplicates based on supplier_name
				const uniqueSuppliers = allSuppliers.filter((supplier, index, self) => 
					index === self.findIndex(s => s.supplier_name === supplier.supplier_name)
				);
				merged.suppliers = uniqueSuppliers;
			}
			
			// Handle categories array merging
			if (existing.categories && sanitizedData.categories) {
				const existingCategories = Array.isArray(existing.categories) ? existing.categories : [];
				const newCategories = Array.isArray(sanitizedData.categories) ? sanitizedData.categories : [];
				merged.categories = [...new Set([...existingCategories, ...newCategories])];
			}

			// Add processing timestamp
			merged.last_processed = new Date().toISOString();
			merged.processing_time = Date.now() - startTime;
			
			// Update the data object
			existingData[cleanContractId] = merged;
			
			// Store with retry mechanism and size checking
			const dataSize = JSON.stringify(existingData).length;
			console.log(`[${startTime}] Attempting to store ${dataSize} bytes for ${Object.keys(existingData).length} contracts`);
			
			// Check storage quota
			const quota = await chrome.storage.local.getBytesInUse();
			console.log(`[${startTime}] Current storage usage: ${quota} bytes`);
			
			retries = 5;
			delay = 100;
			while (retries > 0) {
				try {
					await chrome.storage.local.set({ tenderData: existingData });
					console.log(`[${startTime}] Successfully stored tender data for contract ${cleanContractId}`);
					break;
				} catch (error) {
					retries--;
					console.warn(`[${startTime}] Storage write failed, retries left: ${retries}`, error);
					if (retries === 0) throw error;
					await new Promise(resolve => setTimeout(resolve, delay));
					delay *= 2;
				}
			}
			
			// Immediate verification
			const verificationResult = await verifyStoredData(cleanContractId);
			if (!verificationResult.success) {
				console.error(`[${startTime}] Immediate verification failed for ${cleanContractId}:`, verificationResult);
				return { success: false, error: 'Verification failed', details: verificationResult };
			}
			
			console.log(`[${startTime}] Data successfully stored and verified for ${cleanContractId}`);
			
			// Notify popup if it's open (don't await this)
			chrome.runtime.sendMessage({
				type: 'DATA_UPDATED',
				contract_id: cleanContractId,
				data: merged
			}).catch(() => {
				// Popup might not be open, ignore error
			});

			return { success: true, contract_id: cleanContractId, merged };
			
		} finally {
			pendingOperations.delete(cleanContractId);
		}
		
	} catch (error) {
		console.error(`[${startTime}] Error storing tender data:`, error);
		return { success: false, error: error.message };
	}
}

// Verify that data was actually stored
async function verifyStoredData(contractId) {
	try {
		const result = await chrome.storage.local.get(['tenderData']);
		const storedData = result.tenderData || {};
		
		if (!storedData[contractId]) {
			return { 
				success: false, 
				error: 'Contract not found in storage',
				totalContracts: Object.keys(storedData).length,
				availableContracts: Object.keys(storedData).slice(0, 5) // First 5 for debugging
			};
		}
		
		return { 
			success: true, 
			data: storedData[contractId],
			totalContracts: Object.keys(storedData).length
		};
	} catch (error) {
		return { success: false, error: error.message };
	}
}

// Get all stored tender data with caching
let dataCache = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 5000; // 5 seconds

async function getAllTenderData() {
	try {
		const now = Date.now();
		
		// Return cached data if it's still fresh
		if (dataCache && (now - cacheTimestamp) < CACHE_DURATION) {
			console.log('Returning cached tender data');
			return dataCache;
		}
		
		const result = await chrome.storage.local.get(['tenderData']);
		const data = result.tenderData || {};
		
		// Update cache
		dataCache = data;
		cacheTimestamp = now;
		
		console.log(`Retrieved ${Object.keys(data).length} contracts from storage`);
		return data;
	} catch (error) {
		console.error('Error getting tender data:', error);
		return {};
	}
}

// Clear all stored data (for debugging)
async function clearAllData() {
	try {
		await chrome.storage.local.clear();
		dataCache = null;
		cacheTimestamp = 0;
		console.log('All tender data cleared');
		return { success: true };
	} catch (error) {
		console.error('Error clearing data:', error);
		return { success: false, error: error.message };
	}
}

// Periodic storage health check
setInterval(async () => {
	try {
		const data = await getAllTenderData();
		const contractCount = Object.keys(data).length;
		const dataSize = JSON.stringify(data).length;
		const quota = await chrome.storage.local.getBytesInUse();
		
		console.log(`Storage health check: ${contractCount} contracts, ${dataSize} bytes JSON, ${quota} bytes used`);
		
		// Clear cache periodically to prevent memory leaks
		if (Date.now() - cacheTimestamp > 60000) { // 1 minute
			dataCache = null;
			cacheTimestamp = 0;
		}
	} catch (error) {
		console.error('Storage health check failed:', error);
	}
}, 30000); // Every 30 seconds

// Export data as backup (for debugging)
async function exportData() {
	try {
		const data = await getAllTenderData();
		const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		
		await chrome.downloads.download({
			url: url,
			filename: `tender-data-backup-${new Date().toISOString().split('T')[0]}.json`
		});
		
		console.log('Data exported successfully');
		return { success: true };
	} catch (error) {
		console.error('Export failed:', error);
		return { success: false, error: error.message };
	}
}