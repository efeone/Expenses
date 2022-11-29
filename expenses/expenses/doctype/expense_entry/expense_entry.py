# Copyright (c) 2022, efeone Pvt Ltd and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import cint, cstr, flt, formatdate, getdate, now
from erpnext.accounts.general_ledger import make_gl_entries
from frappe.model.document import Document

from erpnext.controllers.accounts_controller import AccountsController

class ExpenseEntry(AccountsController):
	def validate(self):
		if self.total_amount == 0:
			frappe.throw(_("Amount cannot be zero"))
		if self.total_amount < 0:
			frappe.throw(_("Amount cannot be negative"))
		self.set_missing_values()
	
	def on_submit(self):
		self.make_gl_entries()
	

	def make_gl_entries(self, cancel=False):
		if flt(self.total_amount) > 0:
			gl_entries = self.get_gl_entries()
			make_gl_entries(gl_entries, cancel)

	def set_missing_values(self):
		if not self.posting_date:
			self.posting_date = nowdate()

		if not self.cost_center:
			self.cost_center = erpnext.get_default_cost_center(self.company)
	
	def get_gl_entries(self):
		gl_entry = []

		# Payment account entry
		if self.total_amount:
			gl_entry.append(
				self.get_gl_dict(
					{
						"account": self.payment_account,
						"credit": self.total_amount,
						"credit_in_account_currency": self.total_amount,
						"against": ",".join([d.expense_account for d in self.expenses]),
						"against_voucher_type": self.doctype,
						"against_voucher": self.name,
						"cost_center": self.cost_center
					},
					item=self,
				)
			)

		# expense entries
		for data in self.expenses:
			gl_entry.append(
				self.get_gl_dict(
					{
						"account": data.expense_account,
						"debit": data.amount,
						"debit_in_account_currency": data.amount,
						"against": self.payment_account,
						"cost_center": data.cost_center or self.cost_center,
					},
					item=data,
				)
			)

		self.add_tax_gl_entries(gl_entry)
		return gl_entry

	def add_tax_gl_entries(self, gl_entries):
		for tax in self.get("expense_entry_taxes_and_charges"):
			gl_entries.append(
				self.get_gl_dict(
					{
						"account": tax.account_head,
						"debit": tax.tax_amount,
						"debit_in_account_currency": tax.tax_amount,
						"against": self.payment_account,
						"cost_center": self.cost_center,
						"against_voucher_type": self.doctype,
						"against_voucher": self.name,
					},
					item=tax,
				)
			)
