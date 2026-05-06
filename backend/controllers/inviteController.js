const GroupInvite = require('../models/GroupInvite');
const Group = require('../models/Group');
const User = require('../models/User');
const { sendMail } = require('../utils/email');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const INVITE_EXPIRY_HOURS = GroupInvite.INVITE_EXPIRY_HOURS || 24;

// Validate email format
function isValidEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(String(email).toLowerCase());
}

// Send invite email (group name, inviter name, join link, expiry)
async function sendInviteEmail({ to, groupName, inviterName, inviteLink, expiryHours, customMessage }) {
  const expiryText = `This invitation expires in ${expiryHours} hours.`;
  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #4f46e5;">You're invited to join a group on SplitX</h2>
      <p><strong>${inviterName}</strong> has invited you to join the group <strong>${groupName}</strong>.</p>
      ${customMessage ? `<p style="background: #f3f4f6; padding: 12px; border-radius: 8px;">"${customMessage}"</p>` : ''}
      <p>${expiryText}</p>
      <p style="margin: 24px 0;">
        <a href="${inviteLink}" style="display: inline-block; background: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600;">Join Group</a>
      </p>
      <p style="color: #6b7280; font-size: 14px;">If you don't have an account, you'll be able to sign up after clicking the link.</p>
      <p style="color: #9ca3af; font-size: 12px;">If you didn't expect this email, you can ignore it.</p>
    </div>
  `;
  const text = `${inviterName} invited you to join "${groupName}" on SplitX. ${expiryText} Join here: ${inviteLink}`;
  await sendMail({
    to,
    subject: `${inviterName} invited you to "${groupName}" on SplitX`,
    text,
    html,
  });
}

// @desc    Get invite details by token (public - for accept page)
// @route   GET /api/invite?token=...
// @access  Public
const getInviteByToken = async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) {
      return res.status(400).json({ message: 'Invite token is required' });
    }

    const tokenHash = GroupInvite.hashToken(token);
    const invite = await GroupInvite.findOne({ tokenHash })
      .populate('group', 'name')
      .populate('inviter', 'name email');

    if (!invite) {
      return res.status(404).json({ message: 'Invitation not found or invalid' });
    }

    if (invite.status !== 'pending') {
      return res.status(400).json({
        message: `This invitation has been ${invite.status}`,
        status: invite.status,
      });
    }

    if (new Date() > invite.expiresAt) {
      invite.status = 'expired';
      await invite.save();
      return res.status(400).json({ message: 'This invitation has expired', status: 'expired' });
    }

    res.json({
      groupName: invite.group.name,
      groupId: invite.group._id,
      inviterName: invite.inviter.name,
      inviterEmail: invite.inviter.email,
      email: invite.email,
      expiresAt: invite.expiresAt,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Accept invite (add current user to group)
// @route   POST /api/invite/accept
// @access  Private (or public returns needsAuth)
const acceptInvite = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ message: 'Invite token is required' });
    }

    const tokenHash = GroupInvite.hashToken(token);
    const invite = await GroupInvite.findOne({ tokenHash })
      .populate('group');

    if (!invite) {
      return res.status(404).json({ message: 'Invitation not found or invalid' });
    }

    if (invite.status !== 'pending') {
      return res.status(400).json({
        message: `This invitation has been ${invite.status}`,
        status: invite.status,
      });
    }

    if (new Date() > invite.expiresAt) {
      invite.status = 'expired';
      await invite.save();
      return res.status(400).json({ message: 'This invitation has expired', status: 'expired' });
    }

    // If no auth, tell frontend to redirect to login/register with token
    if (!req.user) {
      return res.json({
        needsAuth: true,
        message: 'Please sign in or create an account to join this group',
      });
    }

    const userId = req.user._id.toString();
    const group = invite.group;

    if (group.members.some(m => m.toString() === userId)) {
      invite.status = 'accepted';
      invite.acceptedAt = new Date();
      invite.acceptedBy = req.user._id;
      await invite.save();
      return res.json({
        message: 'You are already a member of this group',
        group: await Group.findById(group._id).populate('members', 'name email').populate('createdBy', 'name email'),
      });
    }

    group.members.push(req.user._id);
    await group.save();

    invite.status = 'accepted';
    invite.acceptedAt = new Date();
    invite.acceptedBy = req.user._id;
    await invite.save();

    const populatedGroup = await Group.findById(group._id)
      .populate('members', 'name email')
      .populate('createdBy', 'name email');

    res.json({
      message: 'You have joined the group',
      group: populatedGroup,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get pending (and recent) invites for a group
// @route   GET /api/groups/:id/invites
// @access  Private
const getGroupInvites = async (req, res) => {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ message: 'Group not found' });

    const isMember = group.members.some(m => m.toString() === req.user._id.toString());
    if (group.createdBy.toString() !== req.user._id.toString() && !isMember) {
      return res.status(403).json({ message: 'Not authorized to view invites' });
    }

    const invites = await GroupInvite.find({ group: group._id })
      .sort({ createdAt: -1 })
      .populate('inviter', 'name email')
      .lean();

    res.json(invites);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Resend invite email
// @route   POST /api/invite/:id/resend
// @access  Private
const resendInvite = async (req, res) => {
  try {
    const invite = await GroupInvite.findById(req.params.id)
      .populate('group', 'name')
      .populate('inviter', 'name email');

    if (!invite) return res.status(404).json({ message: 'Invitation not found' });
    if (invite.status !== 'pending') {
      return res.status(400).json({ message: `Cannot resend: invitation is ${invite.status}` });
    }
    if (new Date() > invite.expiresAt) {
      invite.status = 'expired';
      await invite.save();
      return res.status(400).json({ message: 'Invitation has expired' });
    }

    const group = await Group.findById(invite.group._id);
    const isMember = group.members.some(m => m.toString() === req.user._id.toString());
    if (group.createdBy.toString() !== req.user._id.toString() && !isMember) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // Extend expiry and get new token for link (we don't store raw token - so we need to create a new invite and cancel old, or store token in env for 48h - simpler: keep same invite, extend expiry, resend with token in link - but we don't have the token!)
    // So we must create a new token when sending the first time and store... we can't. We only store hash. So the link we send must be generated at invite creation and stored once... or we store the raw token encrypted. Simplest: when creating invite we build the link and store it nowhere - we send it in email. For resend we need to send the same link. So we have to store the token (or the full link) somewhere. Store token encrypted? Or store the token in plain in a separate field only for "resend" - security: if DB is leaked they can accept. So better: store token in DB (same as we do for password reset OTP - we store hash for verification but for invite we need to resend the same link). So store the plain token in the model (optional, only for resend). Actually the standard approach is: we don't support "resend same link" - we invalidate the old invite and create a new one with a new token for resend. So: resend = create new invite (new token), cancel old one, send email with new link. That way we don't store plain token.
    // Resend = new invite with new token, cancel old one, send email
    const newToken = GroupInvite.createToken();
    const tokenHash = GroupInvite.hashToken(newToken);
    const expiresAt = GroupInvite.getExpiryDate(INVITE_EXPIRY_HOURS);

    const newInvite = await GroupInvite.create({
      group: invite.group._id,
      inviter: invite.inviter._id,
      email: invite.email,
      tokenHash,
      message: invite.message,
      status: 'pending',
      expiresAt,
    });

    invite.status = 'cancelled';
    await invite.save();

    const inviteLink = `${FRONTEND_URL}/join-group/${invite.group._id}?invite=${newToken}`;
    await sendInviteEmail({
      to: newInvite.email,
      groupName: invite.group.name,
      inviterName: invite.inviter.name,
      inviteLink,
      expiryHours: INVITE_EXPIRY_HOURS,
      customMessage: invite.message,
    });

    const list = await GroupInvite.find({ group: invite.group._id })
      .sort({ createdAt: -1 })
      .populate('inviter', 'name email')
      .lean();

    res.json({ message: 'Invitation resent', invites: list });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Cancel invite
// @route   DELETE /api/invite/:id
// @access  Private
const cancelInvite = async (req, res) => {
  try {
    const invite = await GroupInvite.findById(req.params.id).populate('group');
    if (!invite) return res.status(404).json({ message: 'Invitation not found' });
    if (invite.status !== 'pending') {
      return res.status(400).json({ message: `Invitation is already ${invite.status}` });
    }

    const group = invite.group;
    const isMember = group.members.some(m => m.toString() === req.user._id.toString());
    if (group.createdBy.toString() !== req.user._id.toString() && !isMember) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    invite.status = 'cancelled';
    await invite.save();

    res.json({ message: 'Invitation cancelled' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Join group by invite token (alias API for frontend join page)
// @route   GET /api/groups/join/:token
// @access  Optional (if not logged in, returns needsAuth)
const joinGroupByToken = async (req, res) => {
  // Reuse acceptInvite logic; token comes from params instead of body.
  req.body = { token: req.params.token };
  return acceptInvite(req, res);
};

module.exports = {
  getInviteByToken,
  acceptInvite,
  getGroupInvites,
  resendInvite,
  cancelInvite,
  joinGroupByToken,
  sendInviteEmail,
  isValidEmail,
  FRONTEND_URL,
  INVITE_EXPIRY_HOURS,
};
