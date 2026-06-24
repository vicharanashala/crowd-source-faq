import React from 'react';
import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';
import { GlobalAlertBanner } from './GlobalAlertBanner';

export default function MainLayout() {
  return (
    <>
      <GlobalAlertBanner />
      <Navbar />
      <div className="flex-1 w-full relative z-0">
        <Outlet />
      </div>
    </>
  );
}
