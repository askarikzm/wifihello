'use client';

import { useState } from 'react';
import { 
  BarChart3, 
  Download, 
  Calendar, 
  TrendingUp, 
  Users, 
  DollarSign,
  Wifi,
  FileText
} from 'lucide-react';

const reportTypes = [
  { 
    id: 'revenue', 
    name: 'Revenue Report', 
    description: 'Monthly revenue breakdown by package and payment method',
    icon: DollarSign,
    color: 'bg-green-100 text-green-600'
  },
  { 
    id: 'subscribers', 
    name: 'Subscriber Report', 
    description: 'New subscribers, churns, and growth metrics',
    icon: Users,
    color: 'bg-blue-100 text-blue-600'
  },
  { 
    id: 'usage', 
    name: 'Bandwidth Usage Report', 
    description: 'Network utilization and peak usage analysis',
    icon: Wifi,
    color: 'bg-purple-100 text-purple-600'
  },
  { 
    id: 'aging', 
    name: 'Accounts Aging Report', 
    description: 'Outstanding invoices and overdue payments',
    icon: FileText,
    color: 'bg-orange-100 text-orange-600'
  },
  { 
    id: 'collection', 
    name: 'Collection Report', 
    description: 'Payment collection efficiency by area/collector',
    icon: TrendingUp,
    color: 'bg-teal-100 text-teal-600'
  },
];

export default function ReportsPage() {
  const [selectedReport, setSelectedReport] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async () => {
    if (!selectedReport) return;
    setGenerating(true);
    // Simulate report generation
    await new Promise(resolve => setTimeout(resolve, 2000));
    setGenerating(false);
    // In real app, would download the report
    alert('Report generated! Download would start automatically.');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Reports</h2>
        <p className="text-slate-500 mt-1">Generate and download business reports</p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Reports Generated', value: '156', sublabel: 'This month' },
          { label: 'Last Generated', value: 'Revenue', sublabel: '2 hours ago' },
          { label: 'Scheduled Reports', value: '3', sublabel: 'Active' },
          { label: 'Export Format', value: 'PDF/Excel', sublabel: 'Available' },
        ].map((stat, i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-sm text-slate-500">{stat.label}</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{stat.value}</p>
            <p className="text-xs text-slate-400 mt-1">{stat.sublabel}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Report Types */}
        <div className="col-span-2 space-y-4">
          <h3 className="text-lg font-semibold text-slate-900">Select Report Type</h3>
          <div className="grid grid-cols-2 gap-4">
            {reportTypes.map((report) => (
              <button
                key={report.id}
                onClick={() => setSelectedReport(report.id)}
                className={`
                  p-4 rounded-xl border-2 text-left transition-all
                  ${selectedReport === report.id 
                    ? 'border-blue-500 bg-blue-50' 
                    : 'border-slate-200 bg-white hover:border-slate-300'}
                `}
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${report.color}`}>
                    <report.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">{report.name}</p>
                    <p className="text-sm text-slate-500 mt-0.5">{report.description}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Report Configuration */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Report Options</h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                <Calendar className="inline h-4 w-4 mr-1" />
                Date Range
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={dateRange.from}
                  onChange={(e) => setDateRange({...dateRange, from: e.target.value})}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <input
                  type="date"
                  value={dateRange.to}
                  onChange={(e) => setDateRange({...dateRange, to: e.target.value})}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Export Format
              </label>
              <select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="pdf">PDF Document</option>
                <option value="excel">Excel Spreadsheet</option>
                <option value="csv">CSV File</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Filter by Area
              </label>
              <select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="">All Areas</option>
                <option value="islamabad">Islamabad</option>
                <option value="rawalpindi">Rawalpindi</option>
                <option value="lahore">Lahore</option>
              </select>
            </div>

            <button
              onClick={handleGenerate}
              disabled={!selectedReport || generating}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed mt-6"
            >
              {generating ? (
                <>
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                  Generating...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Generate Report
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Recent Reports */}
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="px-6 py-4 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-900">Recent Reports</h3>
        </div>
        <div className="divide-y divide-slate-100">
          {[
            { name: 'Revenue Report - November 2025', date: 'Nov 28, 2025', size: '245 KB', type: 'PDF' },
            { name: 'Subscriber Report - Q4 2025', date: 'Nov 25, 2025', size: '1.2 MB', type: 'Excel' },
            { name: 'Accounts Aging - November 2025', date: 'Nov 20, 2025', size: '156 KB', type: 'PDF' },
            { name: 'Bandwidth Usage - Week 47', date: 'Nov 18, 2025', size: '892 KB', type: 'PDF' },
          ].map((report, i) => (
            <div key={i} className="px-6 py-4 flex items-center justify-between hover:bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-slate-100 rounded-lg">
                  <FileText className="h-5 w-5 text-slate-600" />
                </div>
                <div>
                  <p className="font-medium text-slate-900">{report.name}</p>
                  <p className="text-sm text-slate-500">{report.date} • {report.size}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="px-2 py-1 text-xs font-medium bg-slate-100 text-slate-600 rounded">
                  {report.type}
                </span>
                <button className="p-2 text-slate-400 hover:text-blue-600 transition-colors">
                  <Download className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
