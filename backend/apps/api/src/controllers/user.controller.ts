import { Response } from 'express';
import { Profile } from '../models/profile.model';
import { WatchHistory } from '../models/watch-history.model';
import { Favorite } from '../models/favorite.model';
import { AuthRequest } from '../middleware/auth.middleware';
import { sendSuccess, sendError } from '../utils/response';

// GET /api/v1/users/profiles
export async function getProfiles(req: AuthRequest, res: Response) {
  try {
    const profiles = await Profile.find({ userId: req.userId });
    return sendSuccess(res, profiles);
  } catch (error) {
    console.error('getProfiles error:', error);
    return sendError(res, 'SERVER_ERROR', 'Failed to get profiles', 500);
  }
}

// POST /api/v1/users/profiles
export async function createProfile(req: AuthRequest, res: Response) {
  try {
    const { name, avatar, isKids, ratingCeiling } = req.body;

    if (!name) {
      return sendError(res, 'VALIDATION', 'Profile name is required');
    }

    const count = await Profile.countDocuments({ userId: req.userId });
    if (count >= 5) {
      return sendError(res, 'LIMIT_REACHED', 'Maximum 5 profiles allowed');
    }

    const profile = await Profile.create({
      userId: req.userId,
      name,
      avatar: avatar || '',
      isKids: isKids || false,
      ratingCeiling: ratingCeiling || 'A',
    });

    return sendSuccess(res, profile, 'Profile created', 201);
  } catch (error) {
    console.error('createProfile error:', error);
    return sendError(res, 'SERVER_ERROR', 'Failed to create profile', 500);
  }
}

// PUT /api/v1/users/profiles/:profileId
export async function updateProfile(req: AuthRequest, res: Response) {
  try {
    const { profileId } = req.params;
    const updates = req.body;

    const profile = await Profile.findOneAndUpdate(
      { _id: profileId, userId: req.userId },
      { $set: updates },
      { new: true }
    );

    if (!profile) {
      return sendError(res, 'NOT_FOUND', 'Profile not found', 404);
    }

    return sendSuccess(res, profile, 'Profile updated');
  } catch (error) {
    console.error('updateProfile error:', error);
    return sendError(res, 'SERVER_ERROR', 'Failed to update profile', 500);
  }
}

// DELETE /api/v1/users/profiles/:profileId
export async function deleteProfile(req: AuthRequest, res: Response) {
  try {
    const { profileId } = req.params;

    const profile = await Profile.findOneAndDelete({ _id: profileId, userId: req.userId });

    if (!profile) {
      return sendError(res, 'NOT_FOUND', 'Profile not found', 404);
    }

    // Clean up related data
    await WatchHistory.deleteMany({ profileId });
    await Favorite.deleteMany({ profileId });

    return sendSuccess(res, null, 'Profile deleted');
  } catch (error) {
    console.error('deleteProfile error:', error);
    return sendError(res, 'SERVER_ERROR', 'Failed to delete profile', 500);
  }
}

// GET /api/v1/users/watch-history/:profileId
export async function getWatchHistory(req: AuthRequest, res: Response) {
  try {
    const { profileId } = req.params;
    const history = await WatchHistory.find({ profileId })
      .populate('contentId', 'title posterUrl type duration')
      .sort({ updatedAt: -1 })
      .limit(50);

    return sendSuccess(res, history);
  } catch (error) {
    console.error('getWatchHistory error:', error);
    return sendError(res, 'SERVER_ERROR', 'Failed to get watch history', 500);
  }
}

// GET /api/v1/users/continue-watching/:profileId
export async function getContinueWatching(req: AuthRequest, res: Response) {
  try {
    const { profileId } = req.params;
    const history = await WatchHistory.find({
      profileId,
      completed: false,
      progressSeconds: { $gt: 0 },
    })
      .populate('contentId', 'title posterUrl backdropUrl type duration')
      .sort({ updatedAt: -1 })
      .limit(20);

    return sendSuccess(res, history);
  } catch (error) {
    console.error('getContinueWatching error:', error);
    return sendError(res, 'SERVER_ERROR', 'Failed to get continue watching', 500);
  }
}

// GET /api/v1/users/favorites/:profileId
export async function getFavorites(req: AuthRequest, res: Response) {
  try {
    const { profileId } = req.params;
    const favorites = await Favorite.find({ profileId })
      .populate('contentId', 'title posterUrl backdropUrl type duration rating')
      .sort({ addedAt: -1 });

    return sendSuccess(res, favorites);
  } catch (error) {
    console.error('getFavorites error:', error);
    return sendError(res, 'SERVER_ERROR', 'Failed to get favorites', 500);
  }
}

// POST /api/v1/users/favorites
export async function addFavorite(req: AuthRequest, res: Response) {
  try {
    const { profileId, contentId } = req.body;

    if (!profileId || !contentId) {
      return sendError(res, 'VALIDATION', 'profileId and contentId are required');
    }

    const existing = await Favorite.findOne({ profileId, contentId });
    if (existing) {
      return sendSuccess(res, existing, 'Already in favorites');
    }

    const favorite = await Favorite.create({ profileId, contentId });
    return sendSuccess(res, favorite, 'Added to favorites', 201);
  } catch (error) {
    console.error('addFavorite error:', error);
    return sendError(res, 'SERVER_ERROR', 'Failed to add favorite', 500);
  }
}

// DELETE /api/v1/users/favorites/:profileId/:contentId
export async function removeFavorite(req: AuthRequest, res: Response) {
  try {
    const { profileId, contentId } = req.params;

    await Favorite.findOneAndDelete({ profileId, contentId });
    return sendSuccess(res, null, 'Removed from favorites');
  } catch (error) {
    console.error('removeFavorite error:', error);
    return sendError(res, 'SERVER_ERROR', 'Failed to remove favorite', 500);
  }
}
