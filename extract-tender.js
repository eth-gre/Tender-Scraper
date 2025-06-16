// Content script for tender detail pages
console.log('Supertender: Tender page script loaded');

function extractTenderData() {
	try {
		const data = {};

		data.tender = true

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

		// Description (extract the fourth div and keep all the text)
		const descEl = document.querySelectorAll('#tenderDescription div')[3];
		console.log(descEl);
		if (descEl) {
			data.description = descEl.textContent.trim();
		}

		// Contact information
		// There can either be MULTIPLE with 'contact' or just one with 'otherContact'
		const otherContactEl = document.querySelector('div.otherContact')
		data.contact_name = []
		
		if (otherContactEl) {
			const contactNameEl = document.querySelector('div.otherContact li');

			data.contact_name.push(contactNameEl.textContent.trim());

		}
		// Try a backup option where we look for 'contact' instead of otherContact
		else {
			const contactEls = document.querySelectorAll('div.contact');

			contactEls.forEach(contact => {
				const name = contact.querySelector('li').textContent.trim()
				data.contact_name.push(name);
			})
		}

		// Add metadata
		data.last_updated = new Date().toISOString();

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

observer.observe(document.body, {
	childList: true,
	subtree: true
});