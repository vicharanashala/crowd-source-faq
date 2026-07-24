import React from 'react';
import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';
import GuidedTour from '../ui/GuidedTour';

// NOTE: MainLayout is intentionally public. Auth-required pages (e.g. Account, GoldenTicket) implement their own route-level guards. Do not add auth logic here.
//
// 1.9 (LOW) — previously this Outlet was keyed by `currentProgram._id`,
// forcing React to unmount/remount the routed page on every program
// switch. That nuked any unsaved form state across the entire app
// (CreatePostDialog, AskAIButton, NewSupportRequestPage, etc) the
// moment a user clicked BatchSwitcher. Pages already invalidate their
// own data via `useProgramScopedFetch` and friends, so the keyed
// Outlet was redundant *and* destructive — drop the key.

export default function MainLayout() {
  return (
    <>
      <Navbar />
      <div className="flex-1 w-full relative z-0">
        <Outlet />
      </div>
      <GuidedTour />
    </>
  );
}
