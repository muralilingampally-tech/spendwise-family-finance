# SpendWise: Your Money Mastered

This is exactly what I would give Lovable. It is written as a software specification, not as a prompt.

SpendWise - Product Requirements Document (PRD)

Project Name

SpendWise

Objective

Build a modern, cloud-based Personal Finance Management application that works on desktop and mobile.

The application should be simple enough for personal use while being powerful enough for families and future small-business bookkeeping.

Technology Stack:

React

TypeScript

Vite

Firebase Authentication

Firestore

Firebase Hosting

Tailwind CSS

React Router

React Hook Form

Zustand (or Redux Toolkit if preferred)

Recharts

Authentication

Use Firebase Authentication.

Support:

Google Login

Email/Password Login

Forgot Password

Logout

Persist login.

Protected routes.

User Model

Every user belongs to one Family.

One Family contains multiple users.

Example

Family

Murali (Admin)

Rajeshwari (Member)

Roles

Admin

Manage masters

Manage users

Delete transactions

Export data

Member

Add/Edit transactions

View reports

Viewer

Read only

Firestore Collections

users

families

expenseGroups

expenseSubGroups

incomeGroups

incomeSubGroups

paymentSources

transactions

settings


Later

budgets

investments

loans

assets

liabilities

notifications


Master Data

Masters must NEVER be hardcoded.

Everything should come from Firestore.

Expense Groups

Examples

Food

Transportation

Utilities

Medical

Shopping

Entertainment

Travel

Insurance

EMI

Education

Personal Care

Family

Gifts

Miscellaneous

Expense Subgroups

Food

Home Food

Outside Food

Groceries

Milk & Curd

Vegetables

Fruits

Bakery

Snacks

Tea & Coffee

Swiggy

Zomato

Restaurant

Utilities

Electricity

Water

Internet

Mobile Recharge

Gas

Transportation

Fuel

Metro

Bus

Cab

Parking

Vehicle Service

Medical

Doctor

Medicines

Lab Tests

etc.

Income Groups

Salary

Professional Income

Investment Income

Refunds

Other Income

Income Subgroups

Salary

Salary

Bonus

Reimbursement

Professional

Audit

GST

Income Tax Return

ROC

Consultancy

Certification

Investment

Dividend

Interest

Capital Gain

Payment Sources

Cash

Bank Accounts

Credit Cards

Wallets

UPI

Examples

Cash

ICICI Savings

AU Bank

Axis Airtel

ICICI Credit Card

Amazon ICICI Card

Swiggy HDFC Card

etc.

Transactions

Support

Income

Expense

Transfer (future)

Fields

Date

Transaction Type

Expense Group

Expense Subgroup

Income Group

Income Subgroup

Payment Source

Amount

Remarks

Created By

Created Date

Updated Date


Dashboard

Cards

Total Income

Total Expense

Balance

Charts

Monthly Income vs Expense

Expense by Category

Recent Transactions

Reports

Monthly Report

Category Report

Payment Source Report

Income Report

Export to Excel

Print

Search

Search by

Date

Amount

Remarks

Category

Subcategory

Payment Source

Filters

Date Range

Category

Subcategory

Payment Source

Income

Expense

Settings

Profile

Theme

Dark Mode

Master Management

UI

Modern

Minimal

Responsive

Material Design feel

Left Sidebar

Top Navigation

Dashboard Cards

Rounded Corners

Professional Charts

Fast Loading

Folder Structure

SpendWise

src

components

pages

Dashboard

Transactions

Reports

Masters

Expense Groups

Expense Sub Groups

Income Groups

Income Sub Groups

Payment Sources

Settings

services

firebase.ts

firestore.ts

auth.ts

hooks

models

utils

assets

App.tsx

main.tsx


Coding Standards

TypeScript only

Component-based architecture

Reusable components

No duplicated code

Responsive

Firestore-driven

No hardcoded master values

Proper validation

Clean folder structure

Version 1 Scope (ONLY)

Include:

✅ Login

✅ Dashboard

✅ Expense Groups

✅ Expense Subgroups

✅ Income Groups

✅ Income Subgroups

✅ Payment Sources

✅ Add Income

✅ Add Expense

✅ Edit

✅ Delete

✅ Search

✅ Reports

✅ Firestore

✅ Google Login

Do NOT include yet:

❌ Investments

❌ Loans

❌ Budgets

❌ AI

❌ Notifications

❌ Attachments

❌ Multi Currency

❌ Offline Mode

These will be Version 2.

Important Development Rules

All master data must come from Firestore.

No hardcoded dropdown values.

Keep the UI simple and fast.

Mobile and desktop responsive.

Code must be production-ready.

Follow clean architecture.

Use Firebase Security Rules.

Build reusable CRUD components where possible.

Prepare the architecture so future modules (Investments, Budgets, Loans) can be added without redesigning the application.

Additional Instructions for Lovable

Generate a complete working React + TypeScript project.

Configure Firebase Authentication and Firestore.

Include all routing and folder structure.

Produce a deployable application, not a prototype.

Use mock Firestore data initially if Firebase credentials are not available, but structure the code so it can switch to a live Firebase project with minimal changes.

Ensure the project can be deployed to Firebase Hosting with standard configuration.

This specification should give Lovable enough detail to generate the initial version of SpendWise with a solid, extensible foundation.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://spendwise-family-finance.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/8289c528-c185-4558-9a91-2db82d75f36f).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
