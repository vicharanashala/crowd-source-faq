// Community Pinboard — page shell.
// Owns all page-level state (currently just `activeTab`) and passes it
// down to child components as props. Child components stay controlled /
// stateless so multiple contributors can build out `reminders/`,
// `bookmarks/`, `links/`, `create/`, `admin/`, `widget/`, and `services/`
// in parallel without touching this file's state logic.

import React, { useState } from 'react';
import {
  CommunityPinboardHeader,
  PinboardTabs,
  type PinboardTabKey,
} from '../components/community/community-pinboard';

export default function CommunityPinboardPage(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<PinboardTabKey>('reminders');

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-20 sm:pt-24 pb-10">
      {/* TODO(owner: widget folder contributor): pass an icon/element
          here once available, e.g. <CommunityPinboardHeader icon={<PinboardIcon />} /> */}
      <CommunityPinboardHeader />

      <div className="mt-6">
        <PinboardTabs activeTab={activeTab} onTabChange={setActiveTab} />
      </div>

      <div className="mt-6 bg-card border border-border rounded-xl p-8 text-center">
        {activeTab === 'reminders' && (
          // TODO(owner: reminders folder contributor): replace with the
          // real reminders list, e.g. <ReminderList /> from
          // components/community/community-pinboard/reminders
          <p className="text-sm text-ink-soft">Reminder list will appear here.</p>
        )}

        {activeTab === 'bookmarks' && (
          // TODO(owner: bookmarks folder contributor): replace with the
          // real bookmarks list, e.g. <BookmarkList /> from
          // components/community/community-pinboard/bookmarks
          <p className="text-sm text-ink-soft">Your bookmarked reminders will appear here.</p>
        )}

        {activeTab === 'links' && (
          // TODO(owner: links folder contributor): replace with the real
          // links list, e.g. <ImportantLinksList /> from
          // components/community/community-pinboard/links
          <p className="text-sm text-ink-soft">Important links will appear here.</p>
        )}
      </div>

      {/* TODO(owner: create folder contributor): mount the "Add Reminder"
          entry point (button/modal/form) here, e.g. <CreateReminderTrigger />
          from components/community/community-pinboard/create */}

      {/* TODO(owner: admin folder contributor): admin-only controls
          (pin/verify/edit/delete, manage links) get their own components
          under components/community/community-pinboard/admin — render
          conditionally based on the current user's role once wired up. */}

      {/* TODO(owner: services folder contributor): data fetching for
          reminders/bookmarks/links belongs in
          components/community/community-pinboard/services — this page
          should receive data via props/hooks from there, not fetch
          directly. */}
    </div>
  );
}