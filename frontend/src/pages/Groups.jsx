import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FaPlus, FaTrash, FaUserPlus, FaReceipt, FaSpinner, FaCopy, FaWhatsapp, FaEnvelope } from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';
import { groupsAPI, inviteAPI, expensesAPI, balancesAPI, settlementsAPI } from '../services/api';
import { parseExpenseVoiceCommand } from '../utils/voiceParser';
import SpendingChart from '../components/SpendingChart';
import ExpenseDistribution from '../components/ExpenseDistribution';
import { getUser } from '../utils/auth';
import toast from 'react-hot-toast';

const Groups = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [group, setGroup] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [balances, setBalances] = useState(null);
  const [activeTab, setActiveTab] = useState('expenses'); // expenses, balances, members, distribution
  const [loading, setLoading] = useState(true);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteMessage, setInviteMessage] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [invites, setInvites] = useState([]);
  const [invitesLoading, setInvitesLoading] = useState(false);
  useEffect(() => {
    if (id) {
      fetchGroupData();
    }
  }, [id]);

  useEffect(() => {
    if (showInviteModal && id) fetchInvites();
  }, [showInviteModal, id]);

  const fetchGroupData = async () => {
    try {
      const [groupRes, expensesRes, balancesRes] = await Promise.all([
        groupsAPI.getOne(id),
        expensesAPI.getByGroup(id),
        balancesAPI.getByGroup(id),
      ]);
      setGroup(groupRes.data);
      setExpenses(expensesRes.data);
      setBalances(balancesRes.data);
    } catch (error) {
      toast.error('Failed to load group data');
      navigate('/dashboard');
    } finally {
      setLoading(false);
    }
  };

  const fetchInvites = async () => {
    if (!id) return;
    setInvitesLoading(true);
    try {
      const res = await groupsAPI.getInvites(id);
      setInvites(res.data || []);
    } catch (err) {
      setInvites([]);
    } finally {
      setInvitesLoading(false);
    }
  };

  const handleDeleteExpense = async (expenseId) => {
    if (!window.confirm('Are you sure you want to delete this expense?')) return;

    try {
      await expensesAPI.delete(expenseId);
      toast.success('Expense deleted');
      fetchGroupData();
    } catch (error) {
      toast.error('Failed to delete expense');
    }
  };

  const handleSettle = async (fromUser, toUser, amount) => {
    try {
      await settlementsAPI.create({
        fromUser,
        toUser,
        groupId: id,
        amount,
      });
      toast.success('Settlement created');
      fetchGroupData();
    } catch (error) {
      toast.error('Failed to create settlement');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  if (!group) return null;

  // Summary: compute how much current user will receive / needs to pay
  const currentUser = getUser();
  let youNet = 0;
  if (balances && Array.isArray(balances.balances)) {
    const entry = balances.balances.find((b) => {
      return (b.userId && currentUser && b.userId === currentUser._id) || (b.user && b.user._id && currentUser && b.user._id === currentUser._id);
    });
    youNet = Number(entry?.netBalance ?? 0);
  }
  const willReceive = youNet > 0 ? youNet : 0;
  const needToPay = youNet < 0 ? Math.abs(youNet) : 0;
  const fmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

  // Prepare last 6 months spending trend from `expenses` (sum of amounts per month)
  const makeTrendData = () => {
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        label: d.toLocaleString('default', { month: 'short' }),
        year: d.getFullYear(),
        month: d.getMonth(),
        total: 0,
      });
    }

    if (Array.isArray(expenses) && expenses.length > 0) {
      for (const ex of expenses) {
        const dt = ex.date ? new Date(ex.date) : null;
        if (!dt || isNaN(dt.getTime())) continue;
        for (const m of months) {
          if (dt.getFullYear() === m.year && dt.getMonth() === m.month) {
            m.total += Number(ex.amount ?? 0);
            break;
          }
        }
      }
    }

    // If all zeros, provide dummy sample data
    const allZero = months.every((m) => m.total === 0);
    if (allZero) {
      const base = [1200, 900, 1500, 1100, 700, 1300];
      months.forEach((m, idx) => (m.total = base[idx]));
    }

    return months.map((m) => ({ label: m.label, value: Number(m.total) }));
  };

  const trendData = makeTrendData();

  // Trust score calculation helper (frontend-only, rule-based)
  const computeTrustScore = (member) => {
    let score = 100;
    let lateSettlements = 0;
    let disputes = 0;
    let edits = 0;

    // Late settlements: count settlements where member is the payer (fromUser)
    // and status is 'pending' and createdAt is older than 7 days
    if (balances && Array.isArray(balances.settlements)) {
      const now = Date.now();
      for (const s of balances.settlements) {
        const fromId = s.fromUser || s.fromUser?._id;
        if (!fromId) continue;
        const sFrom = String(fromId);
        if (sFrom === String(member._id)) {
          const created = s.createdAt ? new Date(s.createdAt).getTime() : (s.createdAt ? new Date(s.createdAt).getTime() : null);
          const status = s.status || 'pending';
          if (status === 'pending' && created && (now - created) > 7 * 24 * 60 * 60 * 1000) {
            lateSettlements += 1;
          }
        }
      }
    }

    // Disputes and edits: not tracked explicitly in this frontend, try to infer
    // For now keep as 0 unless backend provides explicit fields in future

    // Apply deductions
    score -= lateSettlements * 5;
    score -= disputes * 10;
    score -= edits * 2;

    if (score < 0) score = 0;

    const breakdown = {
      lateSettlements,
      disputes,
      edits,
    };

    return { score, breakdown };
  };

  const isDistributionTab = activeTab === 'distribution';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-8">
      <div className={`mx-auto ${isDistributionTab ? 'max-w-full' : 'max-w-7xl'}`}>
        {/* Header - Hidden when distribution tab is active */}
        <AnimatePresence mode="wait">
          {!isDistributionTab && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="mb-8"
            >
              <button
                onClick={() => navigate('/dashboard')}
                className="text-blue-600 dark:text-blue-400 hover:underline mb-4 transition-colors"
              >
                ← Back to Dashboard
              </button>
              <div className="flex justify-between items-center">
                <div>
                  <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                    {group.name}
                  </h1>
                  <p className="text-gray-600 dark:text-gray-400">
                    {group.description || 'No description'}
                  </p>
                </div>
                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => setShowInviteModal(true)}
                    className="flex items-center space-x-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors shadow-md"
                  >
                    <span>Invite via Email</span>
                  </button>
                  <button
                    onClick={() => setShowAddExpense(true)}
                    className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors shadow-md"
                  >
                    <FaPlus />
                    <span>Add Expense</span>
                  </button>
                </div>
              </div>
              {/* Summary row */}
              <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-start sm:space-x-4">
                <div className="inline-flex items-center px-3 py-2 rounded-lg bg-green-50 dark:bg-green-900 text-green-800 dark:text-green-200 border border-green-100 dark:border-green-800 shadow-sm">
                  <span className="font-medium mr-2">You will receive</span>
                  <span className="font-bold">₹{fmt.format(willReceive)}</span>
                </div>
                <div className="inline-flex items-center px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900 text-red-800 dark:text-red-200 border border-red-100 dark:border-red-800 mt-2 sm:mt-0 shadow-sm">
                  <span className="font-medium mr-2">You need to pay</span>
                  <span className="font-bold">₹{fmt.format(needToPay)}</span>
                </div>
              </div>
              {/* Spending trend chart */}
              <SpendingChart data={trendData} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tabs */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="mb-6 border-b border-gray-200 dark:border-gray-700"
        >
          <div className="flex space-x-8 overflow-x-auto">
            <button
              onClick={() => setActiveTab('expenses')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-all whitespace-nowrap ${
                activeTab === 'expenses'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              Expenses
            </button>
            <button
              onClick={() => setActiveTab('balances')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-all whitespace-nowrap ${
                activeTab === 'balances'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              Balances
            </button>
            <button
              onClick={() => setActiveTab('members')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-all whitespace-nowrap ${
                activeTab === 'members'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              Members
            </button>
            <button
              onClick={() => setActiveTab('distribution')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-all whitespace-nowrap ${
                activeTab === 'distribution'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              Expense Distribution
            </button>
          </div>
        </motion.div>

        {/* Expenses Tab */}
        <AnimatePresence mode="wait">
          {activeTab === 'expenses' && (
            <motion.div
              key="expenses"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
            {expenses.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-12 text-center">
                <FaReceipt className="mx-auto text-gray-400 mb-4" size={48} />
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                  No expenses yet
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  Add your first expense to get started
                </p>
                <button
                  onClick={() => setShowAddExpense(true)}
                  className="inline-flex items-center space-x-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <FaPlus />
                  <span>Add Expense</span>
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {expenses.map((expense) => (
                  <div
                    key={expense._id}
                    className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                          {expense.title}
                        </h3>
                        <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">
                          Paid by {expense.paidBy?.name}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">
                          ₹{expense.amount.toFixed(2)}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {new Date(expense.date).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    {expense.description && (
                      <p className="text-gray-600 dark:text-gray-400 mb-4">
                        {expense.description}
                      </p>
                    )}
                    <div className="flex justify-between items-center">
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        Split: {expense.splitType === 'equal' ? 'Equal' : 'Custom'} •{' '}
                        {expense.splits?.length || 0} participants
                      </div>
                      <button
                        onClick={() => handleDeleteExpense(expense._id)}
                        className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300"
                      >
                        <FaTrash />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Balances Tab */}
        <AnimatePresence mode="wait">
          {activeTab === 'balances' && balances && (
            <motion.div
              key="balances"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                Who owes whom
              </h3>
              {balances.settlements && balances.settlements.length > 0 ? (
                <div className="space-y-3">
                  {balances.settlements.map((settlement, index) => (
                    <div
                      key={index}
                      className="flex justify-between items-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
                    >
                      <div>
                        <p className="text-gray-900 dark:text-white font-medium">
                          {settlement.fromUserName} owes {settlement.toUserName}
                        </p>
                      </div>
                      <div className="flex items-center space-x-4">
                        <span className="text-lg font-bold text-gray-900 dark:text-white">
                          ₹{settlement.amount.toFixed(2)}
                        </span>
                        <button
                          onClick={() => handleSettle(settlement.fromUser, settlement.toUser, settlement.amount)}
                          className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
                        >
                          Settle
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-600 dark:text-gray-400">All settled up!</p>
              )}
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                Individual Balances
              </h3>
              <div className="space-y-3">
                {balances.balances.map((balance) => (
                  <div
                    key={balance.userId}
                    className="flex justify-between items-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
                  >
                    <div>
                      <p className="text-gray-900 dark:text-white font-medium">
                        {balance.user?.name || 'Unknown'}
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Paid: ₹{balance.totalPaid.toFixed(2)} • Owed: ₹{balance.totalOwed.toFixed(2)}
                      </p>
                    </div>
                    <div className={`text-lg font-bold ${
                      balance.netBalance >= 0
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}>
                      {balance.netBalance >= 0 ? '+' : ''}₹{balance.netBalance.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Members Tab */}
        <AnimatePresence mode="wait">
          {activeTab === 'members' && (
            <motion.div
              key="members"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Group Members
                </h3>
                <button
                  onClick={() => setShowAddMember(true)}
                  className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <FaUserPlus />
                  <span>Add Member</span>
                </button>
              </div>
              <div className="space-y-3">
                {group.members?.map((member) => (
                  <div
                    key={member._id}
                    className="flex justify-between items-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
                  >
                    <div>
                      <p className="text-gray-900 dark:text-white font-medium flex items-center">
                        <span>{member.name}</span>
                        {(() => {
                          const { score, breakdown } = computeTrustScore(member);
                          const tooltip = `Trust Score starts at 100. -5 per late settlement (${breakdown.lateSettlements}). -10 per dispute (${breakdown.disputes}). -2 per edit/delete (${breakdown.edits}).`;
                          const colorClass = score >= 80 ? 'text-green-600 dark:text-green-400' : score >= 50 ? 'text-yellow-500 dark:text-yellow-400' : 'text-red-600 dark:text-red-400';
                          return (
                            <span title={tooltip} className={`ml-3 text-sm font-medium ${colorClass}`}>
                              <span className="mr-1">⭐</span>
                              {score}
                            </span>
                          );
                        })()}
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {member.email}
                      </p>
                    </div>
                    {group.createdBy._id === member._id && (
                      <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-xs rounded-full">
                        Creator
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Expense Distribution Tab */}
        <AnimatePresence mode="wait">
          {activeTab === 'distribution' && (
            <motion.div
              key="distribution"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              className="w-full"
            >
              <ExpenseDistribution 
                expenses={expenses} 
                members={group.members || []} 
                groupName={group.name}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Invite Modal - component below */}
        {/* Add Expense Modal */}
        {showAddExpense && (
          <AddExpenseModal
            group={group}
            onClose={() => setShowAddExpense(false)}
            onSuccess={() => {
              setShowAddExpense(false);
              fetchGroupData();
            }}
          />
        )}

        {/* Invite Modal */}
        {showInviteModal && (
          <InviteModal
            groupId={group._id}
            inviteEmail={inviteEmail}
            setInviteEmail={setInviteEmail}
            inviteMessage={inviteMessage}
            setInviteMessage={setInviteMessage}
            inviteLoading={inviteLoading}
            setInviteLoading={setInviteLoading}
            invites={invites}
            invitesLoading={invitesLoading}
            fetchInvites={fetchInvites}
            onClose={() => {
              setShowInviteModal(false);
              setInviteEmail('');
              setInviteMessage('');
            }}
          />
        )}

        {/* Add Member Modal */}
        {showAddMember && (
          <AddMemberModal
            group={group}
            onClose={() => setShowAddMember(false)}
            onSuccess={() => {
              setShowAddMember(false);
              fetchGroupData();
            }}
          />
        )}

      </div>
    </div>
  );
};

// Invite Modal: email + optional message, send; list pending with resend/cancel
const InviteModal = ({
  groupId,
  inviteEmail,
  setInviteEmail,
  inviteMessage,
  setInviteMessage,
  inviteLoading,
  setInviteLoading,
  invites,
  invitesLoading,
  fetchInvites,
  onClose,
}) => {
  const [lastInviteLink, setLastInviteLink] = useState(null);
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const handleSendInvite = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email) {
      toast.error('Please enter an email address');
      return;
    }
    if (!emailRe.test(email)) {
      toast.error('Please enter a valid email address');
      return;
    }
    setInviteLoading(true);
    setLastInviteLink(null);
    try {
      const res = await groupsAPI.invite(groupId, { email, message: inviteMessage.trim() });
      toast.success(res.data.message || 'Invitation created');
      setInviteEmail('');
      setInviteMessage('');
      if (res.data.inviteLink) setLastInviteLink(res.data.inviteLink);
      fetchInvites();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send invite');
    } finally {
      setInviteLoading(false);
    }
  };

  const copyInviteLink = () => {
    if (!lastInviteLink) return;
    navigator.clipboard.writeText(lastInviteLink).then(() => toast.success('Link copied to clipboard'));
  };

  const handleResend = async (inviteId) => {
    try {
      await inviteAPI.resend(inviteId);
      toast.success('Invitation resent');
      fetchInvites();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to resend');
    }
  };

  const handleCancelInvite = async (inviteId) => {
    try {
      await inviteAPI.cancel(inviteId);
      toast.success('Invitation cancelled');
      fetchInvites();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to cancel');
    }
  };

  const pendingInvites = (invites || []).filter(
    (i) => i.status === 'pending' && new Date(i.expiresAt) > new Date()
  );
  const expiredOrOther = (invites || []).filter(
    (i) => i.status !== 'pending' || new Date(i.expiresAt) <= new Date()
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Invite via Email</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email address</label>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="friend@example.com"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Message (optional)</label>
              <textarea
                value={inviteMessage}
                onChange={(e) => setInviteMessage(e.target.value)}
                placeholder="Add a personal message..."
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            {lastInviteLink && (
              <div className="rounded-lg bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 p-3">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-2">Share this link (email was not sent):</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={lastInviteLink}
                    className="flex-1 text-xs px-2 py-1.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={copyInviteLink}
                    className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700"
                  >
                    Copy
                  </button>
                </div>
              </div>
            )}

            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendInvite}
                disabled={inviteLoading}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-70 disabled:cursor-not-allowed transition-colors"
              >
                {inviteLoading ? 'Sending...' : 'Send Invitation'}
              </button>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Pending invitations</h3>
            {invitesLoading ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
            ) : pendingInvites.length === 0 && expiredOrOther.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">No invitations yet.</p>
            ) : (
              <ul className="space-y-2">
                {pendingInvites.map((inv) => (
                  <li
                    key={inv._id}
                    className="flex items-center justify-between py-2 px-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{inv.email}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Expires {new Date(inv.expiresAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleResend(inv._id)}
                        className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                      >
                        Resend
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCancelInvite(inv._id)}
                        className="text-xs text-red-600 dark:text-red-400 hover:underline"
                      >
                        Cancel
                      </button>
                    </div>
                  </li>
                ))}
                {expiredOrOther.map((inv) => (
                  <li
                    key={inv._id}
                    className="flex items-center justify-between py-2 px-3 bg-gray-100 dark:bg-gray-700 rounded-lg opacity-80"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{inv.email}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {inv.status === 'expired'
                          ? 'Expired'
                          : inv.status === 'accepted'
                          ? 'Accepted'
                          : inv.status === 'cancelled'
                          ? 'Cancelled'
                          : 'Expired'}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Add Expense Modal Component
const AddExpenseModal = ({ group, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    title: '',
    amount: '',
    paidBy: '',
    splitType: 'equal',
    splits: [],
    description: '',
    category: '',
  });
  const [loading, setLoading] = useState(false);
  const [voiceSupported,] = useState(
    typeof window !== 'undefined' &&
      (window.SpeechRecognition || window.webkitSpeechRecognition)
      ? true
      : false
  );
  const [listening, setListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');

  useEffect(() => {
    if (group.members && group.members.length > 0) {
      setFormData(prev => ({
        ...prev,
        paidBy: group.members[0]._id,
      }));
    }
  }, [group]);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const startVoiceInput = () => {
    if (!voiceSupported) {
      toast.error('Voice input is not supported in this browser.');
      return;
    }

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-IN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    setListening(true);
    setVoiceTranscript('');

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setVoiceTranscript(transcript);

      const parsed = parseExpenseVoiceCommand(transcript);

      setFormData((prev) => ({
        ...prev,
        title: parsed.title || prev.title,
        amount:
          parsed.amount != null
            ? String(parsed.amount)
            : prev.amount,
        category: parsed.category || prev.category || '',
      }));

      toast.success('Filled fields from voice. Please review before saving.');
    };

    recognition.onerror = () => {
      toast.error('Voice recognition failed. Please try again or type manually.');
    };

    recognition.onend = () => {
      setListening(false);
    };

    recognition.start();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const expenseData = {
        title: formData.title,
        amount: parseFloat(formData.amount),
        paidBy: formData.paidBy,
        group: group._id,
        splitType: formData.splitType,
        description: formData.description,
      };

      if (formData.category) {
        expenseData.category = formData.category;
      }

      if (formData.splitType === 'custom') {
        expenseData.splits = formData.splits;
      }

      await expensesAPI.create(expenseData);
      toast.success('Expense added successfully');
      onSuccess();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to add expense');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
          Add Expense
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Title
            </label>
            <input
              type="text"
              name="title"
              required
              value={formData.title}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Amount
            </label>
            <input
              type="number"
              name="amount"
              step="0.01"
              required
              value={formData.amount}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Paid By
            </label>
            <select
              name="paidBy"
              required
              value={formData.paidBy}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
            >
              {group.members?.map((member) => (
                <option key={member._id} value={member._id}>
                  {member.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Split Type
            </label>
            <select
              name="splitType"
              value={formData.splitType}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
            >
              <option value="equal">Equal</option>
              <option value="custom">Custom</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description (optional)
            </label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
              rows="3"
            />
          </div>
          {/* Voice-based entry (optional, Beta) */}
          <div className="border border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Voice entry (Beta)
              </p>
              <button
                type="button"
                onClick={startVoiceInput}
                disabled={!voiceSupported || listening}
                className="px-3 py-1 text-xs rounded-md border border-blue-500 text-blue-600 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900 disabled:opacity-50"
              >
                {listening ? 'Listening…' : 'Speak command'}
              </button>
            </div>
            {!voiceSupported && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Voice input is not supported in this browser. You can still add expenses manually.
              </p>
            )}
            {voiceTranscript && (
              <div className="bg-gray-50 dark:bg-gray-700 rounded-md px-3 py-2">
                <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                  Last command
                </p>
                <p className="text-sm text-gray-800 dark:text-gray-100">
                  “{voiceTranscript}”
                </p>
              </div>
            )}
          </div>
          {/* Category (auto-detected but editable) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Category (optional)
            </label>
            <select
              name="category"
              value={formData.category}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
            >
              <option value="">Auto / Other</option>
              <option value="Food">Food</option>
              <option value="Travel">Travel</option>
              <option value="Rent">Rent</option>
              <option value="Shopping">Shopping</option>
              <option value="Entertainment">Entertainment</option>
              <option value="Groceries">Groceries</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div className="flex space-x-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Adding...' : 'Add Expense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Add Member Modal Component (simplified - would need user search in production)
const AddMemberModal = ({ group, onClose, onSuccess }) => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastInviteLink, setLastInviteLink] = useState('');

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const copyInviteLink = async () => {
    if (!lastInviteLink) return;
    try {
      await navigator.clipboard.writeText(lastInviteLink);
      toast.success('Invite link copied!');
    } catch {
      toast.error('Failed to copy link');
    }
  };

  const shareWhatsApp = () => {
    if (!lastInviteLink) return;
    const msg = `Join my group "${group?.name || 'SplitX Group'}" on SplitX.\n\n${lastInviteLink}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const emailTrimmed = email.trim().toLowerCase();
    if (!emailTrimmed) return toast.error('Please enter an email address');
    if (!emailRe.test(emailTrimmed)) return toast.error('Invalid email address');

    setLoading(true);
    setLastInviteLink('');
    try {
      const res = await groupsAPI.inviteMemberByEmail(group._id, emailTrimmed);
      toast.success(res.data?.message || 'Invite sent successfully');
      if (res.data?.inviteLink) setLastInviteLink(res.data.inviteLink);
      setEmail('');
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send invite');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.98 }}
        transition={{ duration: 0.2 }}
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full p-6 border border-gray-100 dark:border-gray-700"
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
              Invite Member by Email
            </h2>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">
              We’ll email them a secure link to join <span className="font-semibold text-gray-900 dark:text-white">{group?.name}</span>.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Email address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500"
              placeholder="user@example.com"
            />
          </div>

          {lastInviteLink && (
            <div className="rounded-xl bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 p-3">
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-200 mb-2 flex items-center gap-2">
                <FaEnvelope className="opacity-80" />
                Invite link (optional share)
              </p>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={lastInviteLink}
                  className="flex-1 text-xs px-3 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-800 dark:text-gray-200"
                />
                <button
                  type="button"
                  onClick={copyInviteLink}
                  className="px-3 py-2 rounded-lg bg-gray-900 hover:bg-gray-800 dark:bg-gray-600 dark:hover:bg-gray-500 text-white text-xs font-semibold transition-colors"
                >
                  <span className="inline-flex items-center gap-2">
                    <FaCopy />
                    Copy
                  </span>
                </button>
              </div>
              <button
                type="button"
                onClick={shareWhatsApp}
                className="mt-2 w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-semibold transition-colors"
              >
                <FaWhatsapp />
                Share on WhatsApp
              </button>
            </div>
          )}

          <div className="flex space-x-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <FaSpinner className="animate-spin" />
                  Sending Invite...
                </span>
              ) : (
                'Send Invite'
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

export default Groups;
