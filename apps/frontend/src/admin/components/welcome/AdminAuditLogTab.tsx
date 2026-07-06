import React, { useState, useEffect } from 'react';
import adminApi from '../../utils/adminApi';

interface AuditLog {
  _id: string;
  changedBy: { _id: string; name: string; email: string } | string;
  entityType: string;
  entityId: string;
  action: string;
  previousValue: any;
  newValue: any;
  createdAt: string;
}

export default function AdminAuditLogTab() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const res = await adminApi.get('/admin/welcome/audit-logs');
        setLogs(res.data);
      } catch (error) {
        console.error('Error fetching audit logs', error);
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, []);

  if (loading) {
    return <div className="p-8 text-center text-ink-soft">Loading audit logs...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-ink">CMS Audit Log</h2>
        <p className="text-sm text-ink-faint mt-0.5">Track administrative changes to the Welcome Package.</p>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-bg/50 border-b border-border">
                <th className="px-6 py-4 font-semibold text-ink">Date</th>
                <th className="px-6 py-4 font-semibold text-ink">Admin</th>
                <th className="px-6 py-4 font-semibold text-ink">Action</th>
                <th className="px-6 py-4 font-semibold text-ink">Entity</th>
                <th className="px-6 py-4 font-semibold text-ink">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-ink-faint">
                    No audit logs found.
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const adminName = typeof log.changedBy === 'object' ? log.changedBy.name : log.changedBy;
                  return (
                    <tr key={log._id} className="hover:bg-bg/50 transition-colors">
                      <td className="px-6 py-4 text-ink-soft whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-ink font-medium whitespace-nowrap">
                        {adminName || 'System'}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest ${
                          log.action === 'create' ? 'bg-accent/10 text-accent' :
                          log.action === 'update' ? 'bg-amber-500/10 text-amber-500' :
                          log.action === 'delete' ? 'bg-red-500/10 text-red-500' :
                          'bg-ink/10 text-ink-soft'
                        }`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-ink-soft whitespace-nowrap capitalize">
                        {log.entityType} <span className="text-[10px] text-ink-faint ml-1 font-mono">({log.entityId.slice(-6)})</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="max-w-xs md:max-w-md lg:max-w-lg">
                          {log.action === 'update' && log.previousValue && log.newValue && (
                            <div className="text-xs space-y-1">
                              {Object.keys(log.newValue).map(key => {
                                const oldV = JSON.stringify(log.previousValue[key] ?? null);
                                const newV = JSON.stringify(log.newValue[key] ?? null);
                                if (oldV === newV) return null;
                                return (
                                  <div key={key} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 bg-bg p-1.5 rounded border border-border/50">
                                    <span className="font-mono text-[10px] text-ink-faint">{key}:</span>
                                    <span className="text-red-400 line-through truncate max-w-[100px] sm:max-w-[150px]" title={oldV}>{oldV}</span>
                                    <span className="hidden sm:inline text-ink-faint">→</span>
                                    <span className="text-accent truncate max-w-[100px] sm:max-w-[150px]" title={newV}>{newV}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          {(log.action === 'create' || log.action === 'delete') && log.newValue && (
                            <div className="text-xs bg-bg p-1.5 rounded border border-border/50 font-mono text-ink-soft truncate" title={JSON.stringify(log.newValue)}>
                              {JSON.stringify(log.newValue)}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
