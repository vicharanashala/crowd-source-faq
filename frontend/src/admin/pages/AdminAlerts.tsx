import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import api from '../../utils/api';

/**
 * AdminAlerts.tsx
 * Feature: Predictive Friction Clusters
 * Author: Mayank Garg (gargmayank1805@gmail.com)
 * Description: Admin dashboard interface for managing AI-generated friction alerts.
 */

interface GlobalAlert {
  _id: string;
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
  isActive: boolean;
  clusterQueries: string[];
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: {
    name: string;
    email: string;
  };
}

export default function AdminAlerts() {
  const [alerts, setAlerts] = useState<GlobalAlert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isResolving, setIsResolving] = useState<string | null>(null);

  useEffect(() => {
    fetchAlerts();
  }, []);

  const fetchAlerts = async () => {
    try {
      const res = await api.get<{ alerts: GlobalAlert[] }>('/api/alerts/admin');
      setAlerts(res.data?.alerts || []);
    } catch (e) {
      console.error('Failed to fetch alerts', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResolve = async (id: string) => {
    setIsResolving(id);
    try {
      await api.put(`/api/admin/alerts/${id}/resolve`);
      await fetchAlerts();
    } catch (e) {
      console.error('Failed to resolve alert', e);
    } finally {
      setIsResolving(null);
    }
  };

  if (isLoading) {
    return <div className="p-8 text-slate-500">Loading alerts...</div>;
  }

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Friction Alerts</h1>
        <p className="text-slate-500 mt-2">
          AI-generated incident banners based on sudden spikes in similar search queries.
        </p>
      </div>

      <div className="grid gap-6">
        {!alerts || alerts.length === 0 ? (
          <div className="bg-white p-8 rounded-xl border border-slate-200 text-center text-slate-500">
            No friction alerts have been generated yet.
          </div>
        ) : (
          alerts.map((alert) => (
            <motion.div
              key={alert._id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`bg-white rounded-xl border overflow-hidden ${
                alert.isActive ? 'border-orange-500 shadow-sm' : 'border-slate-200 opacity-80'
              }`}
            >
              <div className={`px-6 py-4 border-b flex items-start justify-between ${
                alert.isActive ? 'bg-orange-50' : 'bg-slate-50'
              }`}>
                <div className="flex items-center gap-3">
                  {alert.isActive ? (
                    <AlertTriangle className="w-6 h-6 text-orange-500" />
                  ) : (
                    <CheckCircle className="w-6 h-6 text-slate-400" />
                  )}
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">
                      {alert.title}
                    </h3>
                    <div className="flex items-center gap-2 text-sm text-slate-500 mt-1">
                      <Clock className="w-4 h-4" />
                      <span>Detected: {new Date(alert.createdAt).toLocaleString()}</span>
                      {alert.resolvedAt && (
                        <>
                          <span className="px-2">&bull;</span>
                          <span>Resolved: {new Date(alert.resolvedAt).toLocaleString()}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {alert.isActive && (
                  <button
                    onClick={() => handleResolve(alert._id)}
                    disabled={isResolving === alert._id}
                    className="px-4 py-2 bg-orange-500 text-white font-medium rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors"
                  >
                    {isResolving === alert._id ? 'Resolving...' : 'Resolve Alert'}
                  </button>
                )}
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-2">
                    AI Description
                  </h4>
                  <p className="text-slate-700 bg-slate-50 p-4 rounded-lg border border-slate-100">
                    {alert.description}
                  </p>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-2">
                    Triggering Queries ({alert.clusterQueries.length})
                  </h4>
                  <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-4 bg-slate-50 rounded-lg border border-slate-100">
                    {alert.clusterQueries.map((q, i) => (
                      <span key={i} className="px-3 py-1 bg-white border border-slate-200 rounded-full text-sm text-slate-600">
                        {q}
                      </span>
                    ))}
                  </div>
                </div>

                {!alert.isActive && alert.resolvedBy && (
                  <div className="text-sm text-slate-500 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    Resolved by {alert.resolvedBy.name} ({alert.resolvedBy.email})
                  </div>
                )}
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
