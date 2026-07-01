import React from 'react';
import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';
import { useProgram } from '../../context/ProgramContext';

// NOTE: MainLayout is intentionally public. Auth-required pages (e.g. Account, GoldenTicket) implement their own route-level guards. Do not add auth logic here.

export default function MainLayout() {
  const { currentProgram } = useProgram();

  return (
    <>
      <Navbar />
      <div className="flex-1 w-full relative z-0">
        <Outlet key={currentProgram?._id ?? 'none'} />
      </div>
    </>
  );
}
