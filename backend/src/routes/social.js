import { Router } from 'express';
import * as connections from '../controllers/connectionController.js';
import * as communities from '../controllers/communityController.js';
import * as posts from '../controllers/postController.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  sendRequestSchema,
  respondSchema,
  createPostSchema,
  feedQuery,
  createCommentSchema,
  pinSchema,
  createCommunitySchema,
  updateCommunitySchema,
  communitiesQuery,
  moderatorSchema,
} from '../validators/social.js';

export const connectionsRouter = Router();
connectionsRouter.use(authenticate);
connectionsRouter.get('/', connections.listConnections);
connectionsRouter.get('/requests', connections.listRequests);
connectionsRouter.post('/', validate(sendRequestSchema), connections.sendRequest);
connectionsRouter.patch('/:id', validate(respondSchema), connections.respond);
connectionsRouter.delete('/:id', connections.remove);

export const communitiesRouter = Router();
communitiesRouter.use(authenticate);
communitiesRouter.get('/', validate(communitiesQuery, 'query'), communities.list);
communitiesRouter.post('/', validate(createCommunitySchema), communities.create);
communitiesRouter.get('/:id', communities.get);
communitiesRouter.patch('/:id', validate(updateCommunitySchema), communities.update);
communitiesRouter.post('/:id/join', communities.join);
communitiesRouter.post('/:id/leave', communities.leave);
communitiesRouter.get('/:id/members', communities.members);
communitiesRouter.post('/:id/moderators', validate(moderatorSchema), communities.addModerator);
communitiesRouter.delete('/:id/moderators/:userId', communities.removeModerator);

export const postsRouter = Router();
postsRouter.use(authenticate);
postsRouter.get('/', validate(feedQuery, 'query'), posts.feed);
postsRouter.post('/', validate(createPostSchema), posts.create);
postsRouter.get('/:id', posts.getOne);
postsRouter.delete('/:id', posts.remove);
postsRouter.patch('/:id/pin', validate(pinSchema), posts.setPinned);
postsRouter.put('/:id/like', posts.like);
postsRouter.delete('/:id/like', posts.unlike);
postsRouter.get('/:id/comments', posts.listComments);
postsRouter.post('/:id/comments', validate(createCommentSchema), posts.addComment);
postsRouter.delete('/:id/comments/:commentId', posts.removeComment);
