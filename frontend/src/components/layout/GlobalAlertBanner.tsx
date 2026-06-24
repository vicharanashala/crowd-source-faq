import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Info, XCircle } from 'lucide-react';
import api from '../../utils/api';

/**
 * GlobalAlertBanner.tsx
 * Feature: Predictive Friction Clusters
 * Author: Mayank Garg (gargmayank1805@gmail.com)
 * Description: Renders AI-generated incident banners based on DBSCAN clustering of real-time search queries.
 */

interface GlobalAlert {
  _id: string;
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
  isActive: boolean;
}

export const GlobalAlertBanner = () => {
  const [alerts, setAlerts] = useState<GlobalAlert[]>([]);

  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const res = await api.get<{ alerts: GlobalAlert[] }>('/api/alerts/active');
        setAlerts(res.data?.alerts || []);
      } catch (e) {
        console.error('Failed to fetch global alerts', e);
      }
    };
    
    fetchAlerts();
    // Poll every minute for new alerts
    const interval = setInterval(fetchAlerts, 60000);
    return () => clearInterval(interval);
  }, []);

  if (!alerts || alerts.length === 0) return null;

  return (
    <div className="w-full flex flex-col items-center">
      <AnimatePresence>
        {alerts.map((alert) => {
          const isCritical = alert.severity === 'critical';
          const isWarning = alert.severity === 'warning';
          
          return (
            <motion.div
              key={alert._id}
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              className={`w-full p-4 flex items-start sm:items-center justify-between text-white ${
                isCritical ? 'bg-red-600' : isWarning ? 'bg-orange-500' : 'bg-blue-600'
              }`}
            >
              <div className="flex items-start sm:items-center gap-3">
                {isCritical ? (
                  <XCircle className="w-6 h-6 flex-shrink-0" />
                ) : isWarning ? (
                  <AlertTriangle className="w-6 h-6 flex-shrink-0" />
                ) : (
                  <Info className="w-6 h-6 flex-shrink-0" />
                )}
                <div>
                  <h4 className="font-semibold">{alert.title}</h4>
                  <p className="text-sm opacity-90">{alert.description}</p>
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};
