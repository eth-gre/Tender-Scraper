// Content script for contract detail pages
console.log('Supertender: Contract page script loaded');

function extractContractData() {
	try {
		const data = {};

		data.contract = true

		// Find the tender number from the 'Associated with' field. 
		// Sometimes the contract number is different so we must do it this way
		const id_regex = /\(([^)]+)\)$/
		const contract_text = findValueByLabel('Associated with Tender');

		const contract_match = contract_text.match(id_regex)

		if (contract_match) {
			data.contract_id = contract_match[1];
		}
		else {
			data.contract_id = null
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
					const valueEl = row.querySelector('div.col-sm-8, div.col-sm-6');
					return valueEl ? valueEl.textContent.trim() : null;
				}
			}
			return null;
		}


		// Extract all of the contract details
		const value_text = findValueByLabel('Total Value of the Contract');
		if (value_text) {
			const value_regex = /\$(\d+(?:,\d{3})*\.\d{2})/
			const value_match = value_text.match(value_regex)
	
			if (value_match) {
				data.contract_value = value_match[1]
			}
			else {
				data.contract_value = 0
			}
		} 
		else {
			data.contract_value = 0
		}

		// The rest are just normal
		data.number_of_submissions = findValueByLabel('Number of Submissions');
		data.comment = findValueByLabel('Comments');
		data.reason = findValueByLabel('Reason');
		data.started_at = findValueByLabel('Starting Date');
		data.expired_at = findValueByLabel('Expiry Date');


		// Suppliers information
		const supplierTable = document.querySelector('.table.tablesaw.tablesaw-stack.table-responsive');
		if (supplierTable) {
			const supplierRows = supplierTable.querySelectorAll('tr.contractor');
			const suppliers = [];
			
			supplierRows.forEach(row => {
				console.log(row);
				const supplier = {};
				
				// First cell should contain the supplier name in <strong><b> tags
				const nameEl = row.querySelector('strong b, b');
				if (nameEl) {
					supplier.supplier_name = nameEl.textContent.trim();
				}
				
				// Try to find the ABN and ACN
				const detailRows = row.querySelectorAll('tr')

				detailRows.forEach(detail => {
					const infoTextEl = detail.querySelector('strong')
					if (infoTextEl) {
						const infoText = infoTextEl.textContent
						
						if (infoText == 'ACN') {
							const possibleText = detail.querySelectorAll('td')[1]
							console.log(possibleText);
							supplier.acn = possibleText.textContent.trim()
						}
						if (infoText == 'ABN') {
							const possibleText = detail.querySelectorAll('td')[1]
							console.log(possibleText);
							supplier.abn = possibleText.textContent.trim()
						}
					}
				})

				console.log('here');
				
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

observer.observe(document.body, {
	childList: true,
	subtree: true
});