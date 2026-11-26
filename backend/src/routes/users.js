import { Router } from 'express';
import * as users from '../controllers/userController.js';
import { options } from '../controllers/metaController.js';
import * as avatars from '../controllers/avatarController.js';
import { handleUpload } from '../controllers/avatarController.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { updateProfileSchema, discoverQuery, matchesQuery } from '../validators/profile.js';

export const usersRouter = Router();
usersRouter.use(authenticate);
usersRouter.patch('/me', validate(updateProfileSchema), users.updateMe);
usersRouter.put('/me/avatar', handleUpload, avatars.setAvatar);
usersRouter.delete('/me/avatar', avatars.removeAvatar);
usersRouter.get('/', validate(discoverQuery, 'query'), users.discover);
usersRouter.get('/:id', users.getUser);

export const matchesRouter = Router();
matchesRouter.get('/', authenticate, validate(matchesQuery, 'query'), users.matches);
matchesRouter.get('/people', authenticate, validate(matchesQuery, 'query'), users.peopleYouMayKnow);

export const metaRouter = Router();
metaRouter.get('/options', authenticate, options);
