const Group = require('../models/Group');
const GroupInvite = require('../models/GroupInvite');
const Expense = require('../models/Expense');
const User = require('../models/User');
const { sendInviteEmail, isValidEmail } = require('./inviteController');

// @desc    Create a new group
// @route   POST /api/groups
// @access  Private
const createGroup = async (req, res) => {
  try {
    const { name, description, type, members } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Please provide a group name' });
    }

    const group = await Group.create({
      name,
      description: description || '',
      type: type || 'Friends',
      createdBy: req.user._id,
      members: members ? [...new Set([req.user._id.toString(), ...members])] : [req.user._id],
    });

    const populatedGroup = await Group.findById(group._id)
      .populate('members', 'name email')
      .populate('createdBy', 'name email');

    res.status(201).json(populatedGroup);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get all groups for a user
// @route   GET /api/groups
// @access  Private
const getGroups = async (req, res) => {
  try {
    const groups = await Group.find({
      members: req.user._id,
    })
      .populate('members', 'name email')
      .populate('createdBy', 'name email')
      .sort({ updatedAt: -1 });

    res.json(groups);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get a single group
// @route   GET /api/groups/:id
// @access  Private
const getGroup = async (req, res) => {
  try {
    const group = await Group.findById(req.params.id)
      .populate('members', 'name email')
      .populate('createdBy', 'name email');

    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    // Check if user is a member
    if (!group.members.some(m => m._id.toString() === req.user._id.toString())) {
      return res.status(403).json({ message: 'Not authorized to access this group' });
    }

    res.json(group);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Update a group
// @route   PUT /api/groups/:id
// @access  Private
const updateGroup = async (req, res) => {
  try {
    const group = await Group.findById(req.params.id);

    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    // Check if user is the creator or a member
    if (group.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to update this group' });
    }

    const { name, description, type } = req.body;
    if (name) group.name = name;
    if (description !== undefined) group.description = description;
    if (type) group.type = type;

    await group.save();

    const populatedGroup = await Group.findById(group._id)
      .populate('members', 'name email')
      .populate('createdBy', 'name email');

    res.json(populatedGroup);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Delete a group
// @route   DELETE /api/groups/:id
// @access  Private
const deleteGroup = async (req, res) => {
  try {
    const group = await Group.findById(req.params.id);

    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    // Check if user is the creator
    if (group.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to delete this group' });
    }

    // Delete all expenses related to this group
    await Expense.deleteMany({ group: group._id });

    await Group.findByIdAndDelete(req.params.id);

    res.json({ message: 'Group deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Add members to a group
// @route   PUT /api/groups/:id/members
// @access  Private
const addMembers = async (req, res) => {
  try {
    const { memberIds } = req.body;
    const group = await Group.findById(req.params.id);

    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    // Check if user is the creator or a member
    const isMember = group.members.some(m => m.toString() === req.user._id.toString());
    if (group.createdBy.toString() !== req.user._id.toString() && !isMember) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // Add new members (avoid duplicates)
    memberIds.forEach(memberId => {
      if (!group.members.includes(memberId)) {
        group.members.push(memberId);
      }
    });

    await group.save();

    const populatedGroup = await Group.findById(group._id)
      .populate('members', 'name email')
      .populate('createdBy', 'name email');

    res.json(populatedGroup);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Remove a member from a group
// @route   DELETE /api/groups/:id/members/:memberId
// @access  Private
const removeMember = async (req, res) => {
  try {
    const group = await Group.findById(req.params.id);

    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    // Check if user is the creator
    if (group.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // Don't allow removing the creator
    if (req.params.memberId === group.createdBy.toString()) {
      return res.status(400).json({ message: 'Cannot remove group creator' });
    }

    group.members = group.members.filter(
      m => m.toString() !== req.params.memberId
    );

    await group.save();

    const populatedGroup = await Group.findById(group._id)
      .populate('members', 'name email')
      .populate('createdBy', 'name email');

    res.json(populatedGroup);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  createGroup,
  getGroups,
  getGroup,
  updateGroup,
  deleteGroup,
  addMembers,
  removeMember,
};

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// @desc    Invite a user to the group by email (creates pending invite, sends email)
// @route   POST /api/groups/:id/invite
// @access  Private
const inviteMember = async (req, res) => {
  try {
    const { email, message } = req.body;
    const emailTrimmed = email ? String(email).trim().toLowerCase() : '';
    if (!emailTrimmed) return res.status(400).json({ message: 'Please provide an email' });
    if (!isValidEmail(emailTrimmed)) return res.status(400).json({ message: 'Please provide a valid email address' });

    const group = await Group.findById(req.params.id)
      .populate('createdBy', 'name email');
    if (!group) return res.status(404).json({ message: 'Group not found' });

    const creatorId = (group.createdBy && (group.createdBy._id || group.createdBy)).toString();
    const isMember = group.members.some(m => m.toString() === req.user._id.toString());
    if (creatorId !== req.user._id.toString() && !isMember) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // Already a member?
    const existingUser = await User.findOne({ email: emailTrimmed });
    if (existingUser && group.members.some(m => m.toString() === existingUser._id.toString())) {
      return res.status(400).json({ message: 'This user is already a member of the group' });
    }

    // Duplicate pending invite
    const existingPending = await GroupInvite.findOne({
      group: group._id,
      email: emailTrimmed,
      status: 'pending',
    });
    if (existingPending) {
      return res.status(400).json({ message: 'An invitation has already been sent to this email' });
    }

    const token = GroupInvite.createToken();
    const tokenHash = GroupInvite.hashToken(token);
    const expiresAt = GroupInvite.getExpiryDate();

    const invite = await GroupInvite.create({
      group: group._id,
      inviter: req.user._id,
      email: emailTrimmed,
      tokenHash,
      message: message ? String(message).trim().slice(0, 500) : '',
      status: 'pending',
      expiresAt,
    });

    const inviterName = req.user.name || group.createdBy.name || 'A member';
    // Required invite link format:
    // http://localhost:5173/join-group/GROUP_ID?invite=TOKEN
    const inviteLink = `${FRONTEND_URL}/join-group/${group._id}?invite=${token}`;
    let emailSent = false;
    try {
      await sendInviteEmail({
        to: emailTrimmed,
        groupName: group.name,
        inviterName,
        inviteLink,
        expiryHours: GroupInvite.INVITE_EXPIRY_HOURS || 24,
        customMessage: invite.message,
      });
      emailSent = true;
    } catch (err) {
      console.error('Invite email failed:', err.message || err);
      // Keep the invite so user can share the link manually; don't delete
    }

    const invites = await GroupInvite.find({ group: group._id })
      .sort({ createdAt: -1 })
      .populate('inviter', 'name email')
      .lean();

    res.status(201).json({
      message: emailSent
        ? 'Invitation sent successfully'
        : 'Invitation created. Email could not be sent — share the link below.',
      invite: { _id: invite._id, email: invite.email, status: invite.status, expiresAt: invite.expiresAt },
      // Return link so UI can optionally copy/share even when email was sent.
      inviteLink,
      invites,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports.inviteMember = inviteMember;

// @desc    Invite a user to a group by email (Members tab API)
// @route   POST /api/groups/invite-member
// @access  Private
const inviteMemberByEmail = async (req, res) => {
  const { groupId } = req.body || {};
  if (!groupId) return res.status(400).json({ message: 'groupId is required' });
  req.params.id = groupId;
  return inviteMember(req, res);
};

module.exports.inviteMemberByEmail = inviteMemberByEmail;

