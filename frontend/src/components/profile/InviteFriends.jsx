import { useMemo } from 'react';
import toast from 'react-hot-toast';
import { FaWhatsapp, FaEnvelope, FaCopy, FaLink } from 'react-icons/fa';

/**
 * InviteFriends
 * - Generates a referral/invite link using the current user's ID
 * - Provides quick actions to share via WhatsApp, Email, or copy to clipboard
 *
 * Note: The link format is kept EXACTLY as requested:
 *   http://localhost:5173/signup?ref=USER_ID
 */
export default function InviteFriends({ userId }) {
  const inviteLink = useMemo(() => {
    if (!userId) return '';
    return `http://localhost:5173/signup?ref=${encodeURIComponent(String(userId))}`;
  }, [userId]);

  const inviteMessage = 'Join me on SplitX to split expenses easily!';

  const openWhatsApp = () => {
    if (!inviteLink) return toast.error('Invite link not available');
    const text = `${inviteMessage} ${inviteLink}`;
    // WhatsApp share URL: https://wa.me/?text=<encoded>
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  };

  const openEmail = () => {
    if (!inviteLink) return toast.error('Invite link not available');
    const subject = 'Join me on SplitX';
    const body = `${inviteMessage}\n\nInvite link:\n${inviteLink}`;
    // mailto opens the user's default email app
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const copyInviteLink = async () => {
    if (!inviteLink) return toast.error('Invite link not available');

    try {
      // Modern clipboard API (works on HTTPS and most localhost setups)
      await navigator.clipboard.writeText(inviteLink);
      toast.success('Invite link copied!');
    } catch {
      // Fallback for older browsers / restricted clipboard environments
      try {
        const textarea = document.createElement('textarea');
        textarea.value = inviteLink;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'absolute';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        toast.success('Invite link copied!');
      } catch (e) {
        toast.error('Failed to copy invite link');
        console.error(e);
      }
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-4 sm:p-6 border border-gray-100 dark:border-gray-700">
      <div className="flex items-start sm:items-center justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white flex items-center">
            <FaLink className="mr-2 text-indigo-600 dark:text-indigo-400 text-sm sm:text-base" />
            <span>Invite Friends</span>
          </h3>
          <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">
            Share your referral link and invite friends to SplitX.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Referral link (read-only) */}
        <div>
          <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Your invite link
          </label>
          <div className="flex items-stretch gap-2">
            <input
              value={inviteLink || 'Loading link...'}
              readOnly
              className="w-full px-3 sm:px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
            <button
              type="button"
              onClick={copyInviteLink}
              className="inline-flex items-center justify-center px-3 sm:px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-semibold shadow-sm hover:shadow-md transition-all duration-200 active:scale-[0.98]"
              aria-label="Copy invite link"
              title="Copy"
            >
              <FaCopy className="mr-2" />
              Copy
            </button>
          </div>
          <p className="mt-2 text-[11px] sm:text-xs text-gray-500 dark:text-gray-400">
            This link includes your user ID as a referral code.
          </p>
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
          <button
            type="button"
            onClick={openWhatsApp}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold shadow-sm hover:shadow-md transition-all duration-200 active:scale-[0.98]"
          >
            <FaWhatsapp className="text-base" />
            Share on WhatsApp
          </button>

          <button
            type="button"
            onClick={openEmail}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-sm hover:shadow-md transition-all duration-200 active:scale-[0.98]"
          >
            <FaEnvelope className="text-base" />
            Invite via Email
          </button>

          <button
            type="button"
            onClick={copyInviteLink}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gray-900 hover:bg-gray-800 dark:bg-gray-700 dark:hover:bg-gray-600 text-white text-sm font-semibold shadow-sm hover:shadow-md transition-all duration-200 active:scale-[0.98]"
          >
            <FaCopy className="text-base" />
            Copy Invite Link
          </button>
        </div>
      </div>
    </div>
  );
}

