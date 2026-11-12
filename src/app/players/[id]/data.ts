// One lookup per request, shared by the layout and the page (React's cache() makes the second call free).
import { cache } from 'react';
import { getPlayerProfile } from '../../../server/squad';

export const loadProfile = cache((id: string) => getPlayerProfile(id));
