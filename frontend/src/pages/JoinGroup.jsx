import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import { inviteAPI } from '../services/api';
import { isAuthenticated } from '../utils/auth';
import toast from 'react-hot-toast';
import { FaSpinner, FaUsers, FaCheckCircle } from 'react-icons/fa';

// Reuse the same pending token storage as the existing AcceptInvite flow.
const PENDING_INVITE_TOKEN_KEY = 'pendingInviteToken';

function setPendingInviteToken(token) {
  if (token) sessionStorage.setItem(PENDING_INVITE_TOKEN_KEY, token);
  else sessionStorage.removeItem(PENDING_INVITE_TOKEN_KEY);
}

function clearPendingInviteToken() {
  sessionStorage.removeItem(PENDING_INVITE_TOKEN_KEY);
}

export default function JoinGroup() {
  const navigate = useNavigate();
  const { groupId } = useParams();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('invite');

  const [inviteInfo, setInviteInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!token || !groupId) {
      setError('Invalid invite link.');
      setLoading(false);
      return;
    }

    setPendingInviteToken(token);

    (async () => {
      try {
        const res = await inviteAPI.getByToken(token);

        // Safety: link contains groupId, but the token is the source of truth.
        if (String(res.data?.groupId) !== String(groupId)) {
          setError('This invite link does not match the group.');
          clearPendingInviteToken();
          setInviteInfo(null);
        } else {
          setInviteInfo(res.data);
          setError(null);
        }
      } catch (err) {
        setError(err.response?.data?.message || 'This invitation is invalid or has expired.');
        clearPendingInviteToken();
        setInviteInfo(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [token, groupId]);

  // If logged in, auto-join for a smooth flow.
  useEffect(() => {
    if (!isAuthenticated()) return;
    if (!token || !inviteInfo) return;

    let cancelled = false;
    (async () => {
      setJoining(true);
      try {
        const res = await inviteAPI.accept(token);
        clearPendingInviteToken();
        if (!cancelled) {
          toast.success('Successfully joined group');
          navigate(`/groups/${res.data.group._id}`, { replace: true });
        }
      } catch (err) {
        if (!cancelled) {
          toast.error(err.response?.data?.message || 'Failed to join group');
        }
      } finally {
        if (!cancelled) setJoining(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, inviteInfo, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
        <div className="text-center">
          <FaSpinner className="animate-spin text-3xl text-indigo-600 dark:text-indigo-400 mx-auto mb-3" />
          <p className="text-gray-600 dark:text-gray-400">Loading invitation…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 border border-gray-100 dark:border-gray-700 text-center">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Invitation unavailable</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">{error}</p>
          <Link
            to="/dashboard"
            className="inline-block px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const expiry = inviteInfo?.expiresAt ? new Date(inviteInfo.expiresAt).toLocaleString() : '';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 border border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-3 mb-3">
          <FaUsers className="text-indigo-600 dark:text-indigo-400" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Join Group</h1>
        </div>

        <p className="text-gray-600 dark:text-gray-400 mb-4">
          <strong className="text-gray-900 dark:text-white">{inviteInfo.inviterName}</strong> invited you to join{' '}
          <strong className="text-gray-900 dark:text-white">{inviteInfo.groupName}</strong>.
        </p>

        {expiry && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-6">
            Invite expires: {expiry}
          </p>
        )}

        {isAuthenticated() ? (
          <div className="rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-4 flex items-start gap-3">
            <FaCheckCircle className="text-green-600 dark:text-green-400 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-green-800 dark:text-green-200">
                {joining ? 'Joining group…' : 'Joining now'}
              </p>
              <p className="text-xs text-green-700 dark:text-green-300">
                Please wait a moment.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Please sign in or create an account. After login/signup, SplitX will automatically join you to the group.
            </p>
            <Link
              to="/login"
              className="block w-full py-3 px-4 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 text-center transition-colors"
            >
              Sign in
            </Link>
            <Link
              to="/register"
              className="block w-full py-3 px-4 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 font-semibold rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-center transition-colors"
            >
              Create account
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

