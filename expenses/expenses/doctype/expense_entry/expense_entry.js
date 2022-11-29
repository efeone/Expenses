// Copyright (c) 2022, efeone Pvt Ltd and contributors
// For license information, please see license.txt

frappe.ui.form.on('Expense Entry', {
	refresh:function(frm){
		erpnext.hide_company();
		frm.events.show_general_ledger(frm);

		
	},
	setup: function(frm) {
		frm.set_query("payment_account", function() {
			frm.events.validate_company(frm);
			var account_types = ["Bank", "Cash"];
			return {
				filters: {
					"account_type": ["in", account_types],
					"is_group": 0,
					"company": frm.doc.company
				}
			}
		});

		frm.set_query("account_head", "expense_entry_taxes_and_charges", function() {
			return {
				filters: [
					['company', '=', frm.doc.company],
					['account_type', 'in', ["Tax", "Chargeable", "Income Account", "Expenses Included In Valuation"]]
				]
			};
		});
	},
	mode_of_payment:function(frm){
		if(frm.doc.mode_of_payment){
			get_payment_mode_account(frm, frm.doc.mode_of_payment, function(account){
					frm.set_value('payment_account', account)
			});
		}
	},
	validate_company: (frm) => {
		if (!frm.doc.company){
			frappe.throw({message:__("Please select a Company first."), title: __("Mandatory")});
		}
	},

	calculate_grand_total: function(frm) {
		var grand_total = flt(frm.doc.total) + flt(frm.doc.total_tax_amount);
		frm.set_value("total_amount", grand_total);
		frm.refresh_fields();
	},

	show_general_ledger: function(frm) {
		if(frm.doc.docstatus > 0) {
			frm.add_custom_button(__('Ledger'), function() {
				frappe.route_options = {
					"voucher_no": frm.doc.name,
					"from_date": frm.doc.posting_date,
					"to_date": moment(frm.doc.modified).format('YYYY-MM-DD'),
					"company": frm.doc.company,
					"group_by": "",
					"show_cancelled_entries": frm.doc.docstatus === 2
				};
				frappe.set_route("query-report", "General Ledger");
			}, "fa fa-table");
		}
	},

	payment_account: function(frm){
		set_account_currency_and_balance(frm, frm.doc.payment_account)
	},
	get_taxes: function(frm) {
		if(frm.doc.taxes) {
			frappe.call({
				method: "calculate_taxes",
				doc: frm.doc,
				callback: () => {
					refresh_field("expense_entry_taxes_and_charges");
					frm.trigger("calculate_grand_total");
				}
			});
		}
	},
	cost_center: function(frm) {
		frm.events.set_child_cost_center(frm);
	},

	validate: function(frm) {
		frm.events.set_child_cost_center(frm);
	},

	set_child_cost_center: function(frm){
		(frm.doc.expenses || []).forEach(function(d) {
			if (!d.cost_center){
				d.cost_center = frm.doc.cost_center;
			}
		});
	},
	
});

frappe.ui.form.on('Expense Entry Item', {
	amount: function(frm, cdt, cdn) {
		cur_frm.cscript.calculate_total(frm.doc, cdt, cdn);
		frm.trigger("get_taxes");
		frm.trigger("calculate_grand_total");
	},
	items_remove: function(frm, cdt, cdn){
		cur_frm.cscript.calculate_total(frm.doc, cdt, cdn);
		frm.trigger("get_taxes");
		frm.trigger("calculate_grand_total");
	},
	is_taxable: function(frm, cdt, cdn){
		cur_frm.cscript.calculate_total(frm.doc, cdt, cdn);
		frm.trigger("get_taxes");
		frm.trigger("calculate_grand_total");
	},
	cost_center: function(frm, cdt, cdn) {
		erpnext.utils.copy_value_in_all_rows(frm.doc, cdt, cdn, "expenses", "cost_center");
	}
});

let get_payment_mode_account = function(frm, mode_of_payment, callback) {
	if(!frm.doc.company) {
		frappe.throw(__('Please select the Company first'));
	}
	if(!mode_of_payment) {
		return;
	}
	return  frappe.call({
		method: 'erpnext.accounts.doctype.sales_invoice.sales_invoice.get_bank_cash_account',
		args: {
			'mode_of_payment': mode_of_payment,
			'company': frm.doc.company
		},
		callback: function(r, rt) {
			if(r.message) {
				callback(r.message.account)
			}
		}
	});
}


cur_frm.cscript.validate = function(doc) {
	cur_frm.cscript.calculate_total(doc);
};

cur_frm.cscript.calculate_total = function(doc){
	doc.total_quantity = 0;
	doc.total = 0;
	doc.total_taxable_amount = 0;
	$.each((doc.expenses || []), function(i, d) {
		doc.total += d.amount;
		doc.total_quantity += 1;
		if(d.is_taxable){
			doc.total_taxable_amount += d.amount;
		}
	});
};

cur_frm.fields_dict['cost_center'].get_query = function(doc) {
	return {
		filters: {
			"company": doc.company
		}
	}
};
frappe.ui.form.on("Expense Entry Taxes and Charges", {
	account_head: function(frm, cdt, cdn) {
		var child = locals[cdt][cdn];
		if(child.account_head && !child.description) {
			// set description from account head
			child.description = child.account_head.split(' - ').slice(0, -1).join(' - ');
		}
		if(child.account_head){
			frappe.call({
				method: "expenses.expenses.doctype.expense_entry.expense_entry.get_tax_rate",
				args: {
					"account": child.account_head
				},
				callback: function(r, ) {
					if(r.message) {
						child.rate = r.message;
					}
					refresh_field("expense_entry_taxes_and_charges");
				}
			});
		}
		refresh_field("expense_entry_taxes_and_charges");
	},

	calculate_total_tax: function(frm, cdt, cdn) {
		var child = locals[cdt][cdn];
		child.total = flt(frm.doc.total_taxable_amount) + flt(child.tax_amount);
		frm.trigger("calculate_tax_amount", cdt, cdn);
	},

	calculate_tax_amount: function(frm) {
		frm.doc.total_tax_amount = 0;
		(frm.doc.taxes || []).forEach(function(d) {
			frm.doc.total_tax_amount += d.tax_amount;
		});
		frm.trigger("calculate_grand_total");
	},

	rate: function(frm, cdt, cdn) {
		var child = locals[cdt][cdn];
		if(!child.amount) {
			child.tax_amount = flt(frm.doc.total_taxable_amount) * (flt(child.rate)/100);
		}
		frm.trigger("calculate_total_tax", cdt, cdn);
	},

	tax_amount: function(frm, cdt, cdn) {
		frm.trigger("calculate_total_tax", cdt, cdn);
	}
});

let set_account_currency_and_balance = function(frm, account) {
	if (frm.doc.posting_date && account) {
		frappe.call({
			method: "erpnext.accounts.doctype.payment_entry.payment_entry.get_account_details",
			args: {
				"account": account,
				"date": frm.doc.posting_date,
				"cost_center": frm.doc.cost_center
			},
			callback: function(r, ) {
				if(r.message) {
					frappe.run_serially([
						() => frm.set_value('account_currency', r.message['account_currency']),
						() => {
							frm.set_value('payment_account_balance', r.message['account_balance']);
						}
					]);
				}
			}
		});
	}
}

let get_tax_rate = function(account) {
	if (account) {
		frappe.call({
			method: "expenses.expenses.doctype.expense_entry.expense_entry.get_tax_rate",
			args: {
				"account": account
			},
			callback: function(r, ) {
				if(r.message) {
					return r.message
				}
			}
		});
	}
}