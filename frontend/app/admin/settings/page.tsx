'use client';

import { useState } from 'react';
import { 
  Settings, 
  Building2, 
  Mail, 
  CreditCard, 
  Shield, 
  Bell, 
  Globe, 
  Database,
  Save,
  CheckCircle
} from 'lucide-react';

interface SettingSection {
  id: string;
  label: string;
  icon: React.ElementType;
}

const sections: SettingSection[] = [
  { id: 'company', label: 'Company Info', icon: Building2 },
  { id: 'billing', label: 'Billing Settings', icon: CreditCard },
  { id: 'notifications', label: 'Notification Templates', icon: Mail },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'integrations', label: 'Integrations', icon: Globe },
  { id: 'system', label: 'System', icon: Database },
];

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState('company');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Company settings state
  const [companySettings, setCompanySettings] = useState({
    companyName: 'WANCOM Internet Services',
    email: 'support@wancom.pk',
    phone: '+92 300 1234567',
    address: 'Plot 123, Blue Area, Islamabad',
    taxId: '1234567-8',
    website: 'https://wancom.pk',
  });

  // Billing settings state
  const [billingSettings, setBillingSettings] = useState({
    invoicePrefix: 'INV-',
    dueDays: '15',
    gracePeriod: '5',
    lateFeePercent: '5',
    currency: 'PKR',
    autoSuspend: true,
  });

  // Security settings state
  const [securitySettings, setSecuritySettings] = useState({
    sessionTimeout: '60',
    mfaRequired: false,
    passwordMinLength: '8',
    maxLoginAttempts: '5',
  });

  const handleSave = async () => {
    setSaving(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Settings</h2>
          <p className="text-slate-500 mt-1">Manage your ISP configuration and preferences</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? (
            <>
              <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
              Saving...
            </>
          ) : saved ? (
            <>
              <CheckCircle className="h-4 w-4" />
              Saved!
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Save Changes
            </>
          )}
        </button>
      </div>

      <div className="flex gap-6">
        {/* Sidebar */}
        <div className="w-64 shrink-0">
          <nav className="space-y-1">
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`
                  flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors
                  ${activeSection === section.id
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}
                `}
              >
                <section.icon className="h-5 w-5" />
                {section.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 bg-white rounded-xl border border-slate-200 p-6">
          {activeSection === 'company' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Company Information</h3>
                <p className="text-sm text-slate-500 mt-1">Basic information about your ISP</p>
              </div>
              
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Company Name
                  </label>
                  <input
                    type="text"
                    value={companySettings.companyName}
                    onChange={(e) => setCompanySettings({...companySettings, companyName: e.target.value})}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Support Email
                  </label>
                  <input
                    type="email"
                    value={companySettings.email}
                    onChange={(e) => setCompanySettings({...companySettings, email: e.target.value})}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={companySettings.phone}
                    onChange={(e) => setCompanySettings({...companySettings, phone: e.target.value})}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Tax ID / NTN
                  </label>
                  <input
                    type="text"
                    value={companySettings.taxId}
                    onChange={(e) => setCompanySettings({...companySettings, taxId: e.target.value})}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Website
                  </label>
                  <input
                    type="url"
                    value={companySettings.website}
                    onChange={(e) => setCompanySettings({...companySettings, website: e.target.value})}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Business Address
                  </label>
                  <textarea
                    value={companySettings.address}
                    onChange={(e) => setCompanySettings({...companySettings, address: e.target.value})}
                    rows={3}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          )}

          {activeSection === 'billing' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Billing Settings</h3>
                <p className="text-sm text-slate-500 mt-1">Configure invoicing and payment options</p>
              </div>
              
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Invoice Prefix
                  </label>
                  <input
                    type="text"
                    value={billingSettings.invoicePrefix}
                    onChange={(e) => setBillingSettings({...billingSettings, invoicePrefix: e.target.value})}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Currency
                  </label>
                  <select
                    value={billingSettings.currency}
                    onChange={(e) => setBillingSettings({...billingSettings, currency: e.target.value})}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="PKR">PKR - Pakistani Rupee</option>
                    <option value="USD">USD - US Dollar</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Payment Due Days
                  </label>
                  <input
                    type="number"
                    value={billingSettings.dueDays}
                    onChange={(e) => setBillingSettings({...billingSettings, dueDays: e.target.value})}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                  <p className="text-xs text-slate-500 mt-1">Days after invoice date</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Grace Period (Days)
                  </label>
                  <input
                    type="number"
                    value={billingSettings.gracePeriod}
                    onChange={(e) => setBillingSettings({...billingSettings, gracePeriod: e.target.value})}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                  <p className="text-xs text-slate-500 mt-1">Days before suspension after due date</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Late Fee (%)
                  </label>
                  <input
                    type="number"
                    value={billingSettings.lateFeePercent}
                    onChange={(e) => setBillingSettings({...billingSettings, lateFeePercent: e.target.value})}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="autoSuspend"
                    checked={billingSettings.autoSuspend}
                    onChange={(e) => setBillingSettings({...billingSettings, autoSuspend: e.target.checked})}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="autoSuspend" className="text-sm font-medium text-slate-700">
                    Auto-suspend after grace period
                  </label>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'notifications' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Notification Templates</h3>
                <p className="text-sm text-slate-500 mt-1">Customize SMS and email templates</p>
              </div>
              
              <div className="space-y-4">
                {['Invoice Generated', 'Payment Received', 'Payment Reminder', 'Service Suspended', 'Service Activated'].map((template) => (
                  <div key={template} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                    <div>
                      <p className="font-medium text-slate-900">{template}</p>
                      <p className="text-sm text-slate-500">SMS & Email template</p>
                    </div>
                    <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                      Edit Template
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeSection === 'security' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Security Settings</h3>
                <p className="text-sm text-slate-500 mt-1">Configure authentication and access controls</p>
              </div>
              
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Session Timeout (minutes)
                  </label>
                  <input
                    type="number"
                    value={securitySettings.sessionTimeout}
                    onChange={(e) => setSecuritySettings({...securitySettings, sessionTimeout: e.target.value})}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Max Login Attempts
                  </label>
                  <input
                    type="number"
                    value={securitySettings.maxLoginAttempts}
                    onChange={(e) => setSecuritySettings({...securitySettings, maxLoginAttempts: e.target.value})}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Minimum Password Length
                  </label>
                  <input
                    type="number"
                    value={securitySettings.passwordMinLength}
                    onChange={(e) => setSecuritySettings({...securitySettings, passwordMinLength: e.target.value})}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="mfaRequired"
                    checked={securitySettings.mfaRequired}
                    onChange={(e) => setSecuritySettings({...securitySettings, mfaRequired: e.target.checked})}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="mfaRequired" className="text-sm font-medium text-slate-700">
                    Require MFA for admin users
                  </label>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'integrations' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Integrations</h3>
                <p className="text-sm text-slate-500 mt-1">Manage third-party service connections</p>
              </div>
              
              <div className="space-y-4">
                {[
                  { name: 'PayFast', status: 'connected', description: 'Payment gateway' },
                  { name: 'JazzCash', status: 'not_configured', description: 'Mobile wallet payments' },
                  { name: 'Easypaisa', status: 'not_configured', description: 'Mobile wallet payments' },
                  { name: 'SMS Gateway', status: 'connected', description: 'SMS notifications' },
                  { name: 'Email (SMTP)', status: 'connected', description: 'Email notifications' },
                ].map((integration) => (
                  <div key={integration.name} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                    <div className="flex items-center gap-4">
                      <div className={`h-3 w-3 rounded-full ${integration.status === 'connected' ? 'bg-green-500' : 'bg-slate-300'}`} />
                      <div>
                        <p className="font-medium text-slate-900">{integration.name}</p>
                        <p className="text-sm text-slate-500">{integration.description}</p>
                      </div>
                    </div>
                    <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                      {integration.status === 'connected' ? 'Configure' : 'Setup'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeSection === 'system' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">System Settings</h3>
                <p className="text-sm text-slate-500 mt-1">Database and system configuration</p>
              </div>
              
              <div className="space-y-4">
                <div className="p-4 bg-slate-50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-slate-900">Database Backup</p>
                      <p className="text-sm text-slate-500">Last backup: Today at 3:00 AM</p>
                    </div>
                    <button className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                      Backup Now
                    </button>
                  </div>
                </div>
                
                <div className="p-4 bg-slate-50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-slate-900">System Logs</p>
                      <p className="text-sm text-slate-500">View application and error logs</p>
                    </div>
                    <button className="px-3 py-1.5 text-sm border border-slate-300 text-slate-700 rounded-lg hover:bg-white">
                      View Logs
                    </button>
                  </div>
                </div>

                <div className="p-4 bg-slate-50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-slate-900">Cache</p>
                      <p className="text-sm text-slate-500">Clear application cache</p>
                    </div>
                    <button className="px-3 py-1.5 text-sm border border-slate-300 text-slate-700 rounded-lg hover:bg-white">
                      Clear Cache
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
