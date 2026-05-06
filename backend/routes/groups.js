const express = require('express');
const router = express.Router();
const { protect, optionalProtect } = require('../middleware/auth');
const { inviteLimiter } = require('../middleware/rateLimit');
const {
  createGroup,
  getGroups,
  getGroup,
  updateGroup,
  deleteGroup,
  addMembers,
  removeMember,
  inviteMember,
  inviteMemberByEmail,
} = require('../controllers/groupController');
const { getGroupInvites, joinGroupByToken } = require('../controllers/inviteController');

// Public-ish join endpoint (optional auth)
router.get('/join/:token', optionalProtect, joinGroupByToken);

router.use(protect); // All routes below require authentication

router.route('/')
  .post(createGroup)
  .get(getGroups);

router.route('/:id')
  .get(getGroup)
  .put(updateGroup)
  .delete(deleteGroup);

router.put('/:id/members', addMembers);
router.delete('/:id/members/:memberId', removeMember);
router.get('/:id/invites', getGroupInvites);
router.post('/:id/invite', inviteLimiter, inviteMember);
router.post('/invite-member', inviteLimiter, inviteMemberByEmail);

module.exports = router;

