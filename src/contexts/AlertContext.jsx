/**
 * AlertContext.jsx — Admin alert state shared between admin and student pages
 * 
 * Pinned alert auto-appears on HomePage red bar.
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import * as alertService from '../services/alertService';

const AlertContext = createContext({
  alerts: [],
  pinnedAlert: null,
  createAlert: () => {},
  pinAlert: () => {},
  unpinAlert: () => {},
  editAlert: () => {},
  deleteAlert: () => {},
  refresh: () => {},
});

export const useAlerts = () => useContext(AlertContext);

export function AlertProvider({ children }) {
  const [alerts, setAlerts] = useState([]);
  const [pinnedAlert, setPinnedAlert] = useState(null);

  const refresh = useCallback(() => {
    setAlerts(alertService.getAlerts());
    setPinnedAlert(alertService.getPinnedAlert());
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleCreate = useCallback(({ title, message, note, priority }) => {
    const alert = alertService.createAlert({ title, message, note, priority });
    refresh();
    return alert;
  }, [refresh]);

  const handlePin = useCallback((id) => {
    alertService.pinAlert(id);
    refresh();
  }, [refresh]);

  const handleUnpin = useCallback((id) => {
    alertService.unpinAlert(id);
    refresh();
  }, [refresh]);

  const handleEdit = useCallback((id, patch) => {
    alertService.editAlert(id, patch);
    refresh();
  }, [refresh]);

  const handleDelete = useCallback((id) => {
    alertService.deleteAlert(id);
    refresh();
  }, [refresh]);

  const value = {
    alerts,
    pinnedAlert,
    createAlert: handleCreate,
    pinAlert: handlePin,
    unpinAlert: handleUnpin,
    editAlert: handleEdit,
    deleteAlert: handleDelete,
    refresh,
  };

  return (
    <AlertContext.Provider value={value}>
      {children}
    </AlertContext.Provider>
  );
}
