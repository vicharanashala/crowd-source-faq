/**
 * PasswordCard.tsx — Change-password form card for the Account page.
 *
 * Self-contained: owns its form state, validation, and submission. Renders
 * a toggle between "Change password" button and the inline form.
 *
 * Extracted from AccountPage.tsx (formerly lines 124-160 + 624-666 in the
 * pre-split file) so the Account page can show this card without having
 * to inline the entire form.
 */

import React, { useState } from 'react';
import api from '../../utils/api';
import Input from '../ui/Input';
import Button from '../ui/Button';
import {
  accountActionLink,
  accountCancelLink,
  accountCard,
  accountCardHeader,
  accountCardStack,
  accountLastUpdated,
  accountSectionTitle,
  flexRowSm,
  inlineDangerBanner,
  inlineSuccessBanner,
  stackMd,
} from '../../styles/style_config';

export default function PasswordCard() {
  const [showPassword, setShowPassword] = useState(false);
  const [pwForm, setPwForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [pwLoading, setPwLoading] = useState(false);
  const [pwSuccess, setPwSuccess] = useState('');
  const [pwError, setPwError] = useState('');

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError('');
    setPwSuccess('');

    if (pwForm.newPassword.length < 6) {
      setPwError('New password must be at least 6 characters.');
      return;
    }
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      setPwError('Passwords do not match.');
      return;
    }

    setPwLoading(true);
    try {
      await api.put('/auth/password', {
        currentPassword: pwForm.currentPassword,
        newPassword: pwForm.newPassword,
      });
      setPwSuccess('Password changed successfully.');
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setTimeout(() => {
        setPwSuccess('');
        setShowPassword(false);
      }, 3000);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setPwError(axiosErr.response?.data?.message || 'Failed to change password.');
    } finally {
      setPwLoading(false);
    }
  };

  if (!showPassword) {
    return (
      <div className={accountCard}>
        <div className={accountCardHeader}>
          <h2 className={accountSectionTitle}>Password</h2>
          <button
            onClick={() => {
              setShowPassword(true);
              setPwSuccess('');
              setPwError('');
            }}
            className={accountActionLink}
          >
            Change
          </button>
        </div>
        <p className={accountLastUpdated}>Last changed: unknown — update regularly for security.</p>
      </div>
    );
  }

  return (
    <div className={accountCardStack}>
      <div className={accountCardHeader}>
        <h2 className={accountSectionTitle}>Change Password</h2>
        <button
          onClick={() => {
            setShowPassword(false);
            setPwError('');
            setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
          }}
          className={accountCancelLink}
        >
          Cancel
        </button>
      </div>
      <form onSubmit={handlePasswordSubmit} className={stackMd}>
        <Input
          id="current-password"
          type="password"
          label="Current Password"
          value={pwForm.currentPassword}
          onChange={e => setPwForm(f => ({ ...f, currentPassword: e.target.value }))}
          placeholder="Enter your current password"
          disabled={pwLoading}
        />
        <Input
          id="new-password"
          type="password"
          label="New Password"
          value={pwForm.newPassword}
          onChange={e => setPwForm(f => ({ ...f, newPassword: e.target.value }))}
          placeholder="At least 6 characters"
          disabled={pwLoading}
        />
        <Input
          id="confirm-password"
          type="password"
          label="Confirm New Password"
          value={pwForm.confirmPassword}
          onChange={e => setPwForm(f => ({ ...f, confirmPassword: e.target.value }))}
          placeholder="Re-enter your new password"
          disabled={pwLoading}
        />
        {pwError && (
          <p className={inlineDangerBanner}>
            {pwError}
          </p>
        )}
        {pwSuccess && (
          <p className={inlineSuccessBanner}>
            {pwSuccess}
          </p>
        )}
        <div className={`${flexRowSm} pt-1`}>
          <Button type="submit" loading={pwLoading} size="sm">
            Update Password
          </Button>
        </div>
      </form>
    </div>
  );
}
