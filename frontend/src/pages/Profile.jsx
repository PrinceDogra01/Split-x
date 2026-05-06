import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { authAPI, groupsAPI, balancesAPI, expensesAPI } from '../services/api';
import { getUser } from '../utils/auth';
import toast from 'react-hot-toast';
import InviteFriends from '../components/profile/InviteFriends';
import { 
  FaUser, 
  FaEnvelope, 
  FaUsers, 
  FaRupeeSign, 
  FaArrowUp, 
  FaArrowDown,
  FaSpinner,
  FaReceipt,
  FaWallet
} from 'react-icons/fa';

const Profile = () => {
  const [user, setUser] = useState(null);
  const [groups, setGroups] = useState([]);
  const [balanceSummary, setBalanceSummary] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalPersonalExpense, setTotalPersonalExpense] = useState(0);

  useEffect(() => {
    fetchProfileData();
  }, []);

  const fetchProfileData = async () => {
    try {
      setLoading(true);
      const [userRes, groupsRes, balanceRes, expensesRes] = await Promise.all([
        authAPI.getMe(),
        groupsAPI.getAll(),
        balancesAPI.getSummary(),
        expensesAPI.getAll(),
      ]);

      setUser(userRes.data);
      setGroups(groupsRes.data);
      setBalanceSummary(balanceRes.data);
      setExpenses(expensesRes.data);

      // Calculate total personal expense (sum of all expenses where user is in splits)
      const currentUser = getUser();
      let totalExpense = 0;
      if (expensesRes.data && currentUser) {
        expensesRes.data.forEach(expense => {
          if (expense.splits && Array.isArray(expense.splits)) {
            expense.splits.forEach(split => {
              const userId = split.userId?._id || split.userId;
              if (String(userId) === String(currentUser._id)) {
                totalExpense += Number(split.amount || 0);
              }
            });
          }
        });
      }
      setTotalPersonalExpense(totalExpense);
    } catch (error) {
      toast.error('Failed to load profile data');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const getInitials = (name) => {
    if (!name) return 'U';
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // Prefer the API user object; fall back to localStorage user (helps avoid nulls during brief loads).
  const currentUserId = user?._id || getUser()?._id;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <FaSpinner className="animate-spin text-4xl text-blue-600 dark:text-blue-400 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Loading profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 sm:p-6 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-2">
            My Profile
          </h1>
          <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
            Your account information and financial summary
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Profile Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="lg:col-span-1 bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 border border-gray-100 dark:border-gray-700"
          >
            <div className="text-center mb-4 sm:mb-6">
              <div className="w-20 h-20 sm:w-24 sm:h-24 mx-auto rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-2xl sm:text-3xl font-bold mb-3 sm:mb-4 shadow-lg">
                {user?.avatar ? (
                  <img 
                    src={user.avatar} 
                    alt={user.name} 
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  getInitials(user?.name || 'User')
                )}
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-1">
                {user?.name || 'User'}
              </h2>
              <div className="flex items-center justify-center text-gray-600 dark:text-gray-400 text-xs sm:text-sm mt-2">
                <FaEnvelope className="mr-2" />
                <span className="break-all">{user?.email || 'No email'}</span>
              </div>
            </div>

            <div className="space-y-3 pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">Member since</span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {user?.createdAt 
                    ? new Date(user.createdAt).toLocaleDateString('en-IN', { 
                        year: 'numeric', 
                        month: 'short' 
                      })
                    : 'N/A'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">Total Groups</span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {groups.length}
                </span>
              </div>
            </div>
          </motion.div>

          {/* Financial Summary */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="lg:col-span-2 space-y-6"
          >
            {/* Financial Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-4 sm:p-6 border border-gray-100 dark:border-gray-700">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">
                    Total Personal Expense
                  </p>
                  <FaReceipt className="text-blue-600 dark:text-blue-400 text-sm sm:text-base" />
                </div>
                <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                  {formatCurrency(totalPersonalExpense)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Across all groups
                </p>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-4 sm:p-6 border border-gray-100 dark:border-gray-700">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">
                    Total Amount Owed
                  </p>
                  <FaArrowDown className="text-red-600 dark:text-red-400 text-sm sm:text-base" />
                </div>
                <p className="text-xl sm:text-2xl font-bold text-red-600 dark:text-red-400">
                  {balanceSummary ? formatCurrency(balanceSummary.totalOwed) : formatCurrency(0)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  You need to pay
                </p>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-4 sm:p-6 border border-gray-100 dark:border-gray-700">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">
                    Total Amount Lent
                  </p>
                  <FaArrowUp className="text-green-600 dark:text-green-400 text-sm sm:text-base" />
                </div>
                <p className="text-xl sm:text-2xl font-bold text-green-600 dark:text-green-400">
                  {balanceSummary ? formatCurrency(balanceSummary.totalPaid) : formatCurrency(0)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  You will receive
                </p>
              </div>

              <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-md p-4 sm:p-6 border ${
                balanceSummary?.netBalance >= 0 
                  ? 'border-green-200 dark:border-green-800' 
                  : 'border-red-200 dark:border-red-800'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">
                    Net Balance
                  </p>
                  {balanceSummary?.netBalance >= 0 ? (
                    <FaWallet className="text-green-600 dark:text-green-400 text-sm sm:text-base" />
                  ) : (
                    <FaWallet className="text-red-600 dark:text-red-400 text-sm sm:text-base" />
                  )}
                </div>
                <p className={`text-xl sm:text-2xl font-bold ${
                  balanceSummary?.netBalance >= 0
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400'
                }`}>
                  {balanceSummary 
                    ? formatCurrency(balanceSummary.netBalance)
                    : formatCurrency(0)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {balanceSummary?.netBalance >= 0 ? 'You are owed' : 'You owe'}
                </p>
              </div>
            </div>

            {/* Groups List */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-4 sm:p-6 border border-gray-100 dark:border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white flex items-center">
                  <FaUsers className="mr-2 text-blue-600 dark:text-blue-400 text-sm sm:text-base" />
                  <span>Your Groups</span>
                </h3>
                <Link
                  to="/groups/new"
                  className="text-xs sm:text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
                >
                  + New Group
                </Link>
              </div>

              {groups.length === 0 ? (
                <div className="text-center py-6 sm:py-8">
                  <FaUsers className="mx-auto text-gray-400 mb-3" size={28} />
                  <p className="text-gray-600 dark:text-gray-400 text-xs sm:text-sm">
                    You haven't joined any groups yet
                  </p>
                  <Link
                    to="/groups/new"
                    className="inline-block mt-4 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium text-xs sm:text-sm"
                  >
                    Create your first group
                  </Link>
                </div>
              ) : (
                <div className="space-y-2 sm:space-y-3">
                  {groups.map((group) => (
                    <Link
                      key={group._id}
                      to={`/groups/${group._id}`}
                      className="block p-3 sm:p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-500 hover:shadow-md transition-all"
                    >
                      <div className="flex items-start sm:items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-sm sm:text-base text-gray-900 dark:text-white mb-1 break-words">
                            {group.name}
                          </h4>
                          {group.description && (
                            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-2 line-clamp-2">
                              {group.description}
                            </p>
                          )}
                          <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                            <FaUsers className="mr-1 flex-shrink-0" />
                            <span>{group.members?.length || 0} members</span>
                          </div>
                        </div>
                        <div className="ml-2 flex-shrink-0">
                          <span className="px-2 sm:px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-xs rounded-full font-medium">
                            {group.type || 'Group'}
                          </span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Invite Friends */}
            <InviteFriends userId={currentUserId} />
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default Profile;

