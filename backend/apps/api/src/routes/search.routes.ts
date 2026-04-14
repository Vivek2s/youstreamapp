import { Router } from 'express';
import { search, autocomplete } from '../controllers/search.controller';

const router = Router();

router.get('/', search);
router.get('/autocomplete', autocomplete);

export default router;
