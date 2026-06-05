#!/bin/bash
git add src/pages/admin/BookingsPage.tsx src/pages/admin/ClientsPage.tsx src/pages/admin/DashboardPage.tsx src/pages/admin/MembersPage.tsx src/pages/admin/ServicesPage.tsx src/pages/admin/SettingsPage.tsx

git commit -m "style: Apply Design System to all admin pages

Updated the following pages with unified design system:
- BookingsPage: Added header bar with title/subtitle
- ClientsPage: New header and centered placeholder
- ServicesPage: New header and centered placeholder
- DashboardPage: New header and centered placeholder
- MembersPage: Complete redesign with header, updated table styling
- SettingsPage: New header and centered placeholder

Design changes applied:
- Container: min-h-screen bg-slate-50 flex flex-col
- Header: bg-white px-6 py-6 shadow-md border-b border-slate-200
- Title: text-4xl font-bold text-text-primary
- Subtitle: text-sm text-text-secondary
- Buttons: bg-black hover:bg-primary-hover text-white
- Cards: bg-white rounded-xl shadow-lg (no border)
- Tables: bg-white rounded-xl shadow-lg, header bg-slate-50

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
