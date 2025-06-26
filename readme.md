# About
Yet another vibe coded extension to complete a very specific task that I don't want to do manually. Manually extacts data and merges it from Buying for Victoria and can then be easily exported. Yeah, non existent code quality here but that wasn't the point :)

# Scraping Hints

## General tips
- This is formatted as key, page it is on, selector.
- Everything in 'search' is inside tbody, there is only one tbody. Each tender will be in its own trow. Use that as the scope per row.
- For all of the 'suppliers' info, there may be multiple so these should be a list of objects with those properties. The supplier info is found in '.table.tablesaw.tablesaw-stack.table-responsive' and each is scoped to its own tr.contractor.
- If can't find it, set a reasonable default for the expected data type.
- All of the below should be in a single entry in the stored list, it is divided up here purely for semantic understanding. Mising values are expected based on the 'status' (ie open tenders won't have supplier information).
- The contract_id is listed on all pages as this is the information needed to ensure that data lines up correctly, only store this once obviously

## Contacts
         contact_name,   tender, div.otherContact li (first li)
        contact_email,   tender, div.otherContact a

## Suppliers
  	    supplier_name, contract, b
                  abn, contract, td (where the tr it is in contains a td with 'ABN' in a strong)
                  acn, contract, td (where the tr it is in contains a td with 'ACN' in a strong)

## Bodies
			body_name,   search, line-item-detail (the first one)

## Tender Info
      	  contract_id,   search, td.tender-code-state > span > b
      	  contract_id,   tender, [name="page-title"] (then trim the beginning "Display Tender " off and keep what is after)
      	  contract_id, contract, [name="page-title"] (then trim the beginning "Contract - " off and keep what is after)
        		 link,   search, .strong.tenderRowTitle (it is the href on this)
       contract_value, contract, div.col-sm-8 (where the parent div.row has a span in it that says 'Total Value of the Contract')
number_of_submissions, contract, div.col-sm-8 (where the parent div.row has a span in it that says 'Number of Submissions')
              comment, contract, div.col-sm-8 (where the parent div.row has a span in it that says 'Comments')
               reason, contract, div.col-sm-8 (where the parent div.row has a span in it that says 'Reason')
                title,   search, .strong.tenderRowTitle
          description,   tender, #tenderDescription p
               status,   search, td.tender-code-state span.tender-row-state
           categories,   search, line-item-detail (all after the first one)
            opened_at,   search, td.tender-date span.opening_date
            closed_at,   search, td.tender-date span.closing_date
           started_at, contract, div.col-sm-8 (where the parent div.row has a span in it that says 'Starting Date')
           expired_at, contract, div.col-sm-8 (where the parent div.row has a span in it that says 'Expiry Date')
