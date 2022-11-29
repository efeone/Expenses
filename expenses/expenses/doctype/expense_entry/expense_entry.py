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
		self.calculate_total_amount()
		self.set_cost_center()
		self.calculate_taxes()
		self.set_missing_values()

	def on_submit(self):
		if self.payment_account:
			self.make_gl_entries()

	def on_cancel(self):
		self.ignore_linked_doctypes = ("GL Entry")
		if self.payment_account:
			self.make_gl_entries(cancel=True)

	def set_cost_center(self):
		if not self.cost_center:
			self.cost_center = frappe.get_cached_value("Company", self.company, "cost_center")

	def calculate_total_amount(self):
		self.total = 0
		self.total_taxable_amount = 0
		for d in self.get("expenses"):
			self.total += flt(d.amount)
			if d.is_taxable:
				self.total_taxable_amount += flt(d.amount)

	def make_gl_entries(self, cancel=False):
		if flt(self.total_amount) > 0:
			gl_entries = self.get_gl_entries()
			make_gl_entries(gl_entries, cancel)

	def set_missing_values(self):
		if not self.posting_date:
			self.posting_date = nowdate()

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
						"remarks": data.description
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

	@frappe.whitelist()
	def calculate_taxes(self):
		self.total_tax_amount = 0
		for tax in self.expense_entry_taxes_and_charges:
			if tax.rate:
				tax.tax_amount = flt(self.total_taxable_amount) * flt(tax.rate / 100)

			tax.total = flt(tax.tax_amount) + flt(self.total_taxable_amount)
			self.total_tax_amount += flt(tax.tax_amount)

		self.total_amount = (
			flt(self.total)
			+ flt(self.total_tax_amount)
		)

@frappe.whitelist()
def get_tax_rate(account):
	return frappe.db.get_value("Account", account, 'tax_rate')
